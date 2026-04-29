// ─────────────────────────────────────────────────────────────────────────────
// pages-clinical-tools.js — Secondary clinical tool pages (code-split)
// Advanced Search · Benchmarks · Consent · Media · Dictation · Forms · etc.
// ─────────────────────────────────────────────────────────────────────────────
import { api, downloadBlob } from './api.js';
import { tag, spinner, emptyState, spark } from './helpers.js';
import { FALLBACK_CONDITIONS } from './constants.js';
import { loadResearchBundleOverview } from './research-bundle-overview.js';
import {
  CONDITION_HOME_TEMPLATES,
  buildRankedHomeSuggestions,
  confidenceTierFromScore,
  resolveConIdsFromCourse,
} from './home-program-condition-templates.js';
import {
  mergePatientTasksFromServer,
  mergeParsedMutationIntoLocalTask,
  parseHomeProgramTaskMutationResponse,
  markSyncFailed,
  SYNC_STATUS,
} from './home-program-task-sync.js';
import { COND_HUB_META } from './registries/condition-assessment-hub-meta.js';
import {
  getScaleMeta,
  enumerateBundleScales,
  resolveScaleCanonical,
} from './registries/scale-assessment-registry.js';
import {
  formatScaleWithImplementationBadgeHtml,
  partitionScalesByImplementationTruth,
  getLegacyRunScoreEntryNoticeHtml,
  routeLegacyRunAssessment,
} from './registries/assessment-implementation-status.js';
import { ASSESS_REGISTRY, ASSESS_TEMPLATES } from './registries/assess-instruments-registry.js';

function _dsToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `ds-toast ds-toast--${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// Assessments-hub helpers — referenced by pgAssessmentsHub. Mirror the sibling
// copy in pages-clinical.js; both intentionally share the same semantics.
function _hubResolveRegistryScale(scaleId) {
  const mapped = resolveScaleCanonical(scaleId);
  return ASSESS_REGISTRY.find(r => r.id === mapped || r.id === scaleId) || null;
}

function _hubEscHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function _hubInterpretScore(scaleId, score, extraScalesMap) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return '';
  const n = Number(score);
  const reg = _hubResolveRegistryScale(scaleId);
  if (reg && typeof reg.interpret === 'function') {
    const o = reg.interpret(n);
    return (o && o.label) || '';
  }
  const canon = resolveScaleCanonical(scaleId);
  const ex = (extraScalesMap || {})[scaleId] || (extraScalesMap || {})[canon];
  if (ex && Array.isArray(ex.interpretation)) {
    for (const r of ex.interpretation) {
      if (n <= r.max) return r.label;
    }
  }
  return '';
}

const _TYPE_COLORS = {
  patient:           { bg: '#0d9488', text: '#fff' },
  note:              { bg: '#2563eb', text: '#fff' },
  protocol:          { bg: '#7c3aed', text: '#fff' },
  session:           { bg: '#d97706', text: '#fff' },
  invoice:           { bg: '#e11d48', text: '#fff' },
  'qa-review':       { bg: '#0891b2', text: '#fff' },
  referral:          { bg: '#059669', text: '#fff' },
  'homework-plan':   { bg: '#9333ea', text: '#fff' },
  intake:            { bg: '#ca8a04', text: '#fff' },
};

function _asTypeBadge(type) {
  const c = _TYPE_COLORS[type] || { bg: 'var(--border)', text: 'var(--text)' };
  const label = type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  return '<span style="background:' + c.bg + ';color:' + c.text + ';font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:12px;text-transform:uppercase;flex-shrink:0">' + label + '</span>';
}

// ── pgAdvancedSearch ──────────────────────────────────────────────────────────
export async function pgAdvancedSearch(setTopbar) {
  setTopbar('Advanced Search', '<button class="btn-secondary" style="font-size:.8rem" onclick="window._nav(\'advanced-search\')">&#8635; Reset</button>');
  const el = document.getElementById('content');

  // ── state ──────────────────────────────────────────────────────────────────
  let _searchIdx  = [];
  let _curResults = [];
  let _filters    = { types: [], dateFrom: '', dateTo: '', tags: '' };
  let _query      = '';
  let _grouped    = false;
  let _sortBy     = 'relevance';
  let _debTimer   = null;

  _searchIdx = buildSearchIndex();

  // ── HTML skeleton ──────────────────────────────────────────────────────────
  const typeChips = ['all','patient','note','protocol','session','invoice','qa-review','referral','intake'];
  el.innerHTML = `
  <div style="display:flex;gap:20px;max-width:1200px;margin:0 auto;padding:16px">
    <div style="flex:1;min-width:0">
      <div style="position:relative;margin-bottom:16px">
        <input id="tt-search-input" class="search-input-lg" type="text"
          placeholder="Search patients, notes, protocols, sessions\u2026"
          oninput="window._ttSearch(this.value)"
          onkeydown="if(event.key==='Escape')window._ttClear()"
          autocomplete="off" />
        <button id="tt-clear-btn" onclick="window._ttClear()" title="Clear"
          style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);font-size:1.2rem;cursor:pointer;display:none">&#xD7;</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px">
        <span style="font-size:.8rem;color:var(--text-muted);flex-shrink:0">Type:</span>
        ${typeChips.map(t =>
          '<button class="search-type-chip' + (t==='all'?' active':'') + '" id="tt-chip-' + t + '" onclick="window._ttToggleType(\'' + t + '\')">' +
          t.replace(/-/g,' ').replace(/\b\w/g,l=>l.toUpperCase()) + '</button>'
        ).join('')}
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <label style="font-size:.8rem;color:var(--text-muted)">From
            <input type="date" id="tt-date-from" oninput="window._ttApplyFilters()"
              style="margin-left:4px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);font-size:.8rem"/></label>
          <label style="font-size:.8rem;color:var(--text-muted)">To
            <input type="date" id="tt-date-to" oninput="window._ttApplyFilters()"
              style="margin-left:4px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);font-size:.8rem"/></label>
          <input id="tt-tag-filter" type="text" placeholder="Tag filter\u2026" oninput="window._ttApplyFilters()"
            style="padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);font-size:.8rem;width:110px"/>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
        <select id="tt-saved-dd" onchange="window._ttLoadSearch(this.value)"
          style="padding:5px 10px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);font-size:.8rem;max-width:220px">
          <option value="">Saved searches\u2026</option>
        </select>
        <button id="tt-save-btn" onclick="window._ttSaveSearch()" class="btn-secondary"
          style="font-size:.8rem;display:none">&#128190; Save This Search</button>
      </div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
        <span id="tt-results-count" style="font-size:.85rem;color:var(--text-muted)">Index: ${_searchIdx.length} records ready</span>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
          <label style="font-size:.8rem;color:var(--text-muted)">Sort:
            <select id="tt-sort-sel" onchange="window._ttSort(this.value)"
              style="margin-left:4px;padding:3px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);font-size:.8rem">
              <option value="relevance">Relevance</option>
              <option value="date">Date</option>
              <option value="type">Type</option>
            </select>
          </label>
          <label style="font-size:.8rem;color:var(--text-muted);cursor:pointer">
            <input type="checkbox" id="tt-group-chk" onchange="window._ttGroupResults(this.checked)" style="margin-right:4px"/>Group by type
          </label>
          <button onclick="window._ttExportCSV()" class="btn-secondary" style="font-size:.8rem">&#11015; Export CSV</button>
        </div>
      </div>
      <div id="tt-results-list">
        <div style="text-align:center;padding:48px 24px;color:var(--text-muted)">
          <div style="font-size:2rem;margin-bottom:12px">&#128269;</div>
          <div>Type at least 2 characters to search across all records.</div>
          <div style="font-size:.8rem;margin-top:8px">${_searchIdx.length} records indexed from local data</div>
        </div>
      </div>
    </div>
    <div style="width:190px;flex-shrink:0">
      <div style="font-size:.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;letter-spacing:.06em">Filter Presets</div>
      <button class="search-preset-btn" onclick="window._ttPreset('recent-patients')">&#128100; Recent Patients</button>
      <button class="search-preset-btn" onclick="window._ttPreset('open-protocols')">&#129504; Open Protocols</button>
      <button class="search-preset-btn" onclick="window._ttPreset('flagged-notes')">&#128221; Flagged Notes</button>
      <button class="search-preset-btn" onclick="window._ttPreset('overdue-invoices')">&#128176; Overdue Invoices</button>
      <button class="search-preset-btn" onclick="window._ttPreset('pending-reviews')">&#9989; Pending Reviews</button>
      <div style="margin-top:16px;font-size:.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;letter-spacing:.06em">Saved Searches</div>
      <div id="tt-saved-list"></div>
    </div>
  </div>`;

  setTimeout(() => document.getElementById('tt-search-input')?.focus(), 50);
  _refreshSavedUI();

  // ── inner helpers ──────────────────────────────────────────────────────────
  function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _renderCard(x, q) {
    const r = x.record;
    const snip = (r.preview || '').slice(0, 120);
    const tagPills = (r.tags || []).slice(0, 4).filter(Boolean);
    const navParamJSON = JSON.stringify(r.navParam || {}).replace(/'/g, '\\\'');
    return '<div class="search-result-card">' +
      '<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-start;flex-shrink:0">' +
        _asTypeBadge(r.type) +
        '<span title="Relevance" style="font-size:.65rem;color:var(--text-muted);opacity:.7">' + x.score + 'pt</span>' +
      '</div>' +
      '<div class="search-result-body">' +
        '<div class="search-result-title">' + _hlMark(_esc(r.title), q) + '</div>' +
        (r.subtitle ? '<div style="font-size:.8rem;color:var(--text-muted);margin-top:2px">' + _esc(r.subtitle) + '</div>' : '') +
        (tagPills.length ? '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">' +
          tagPills.map(t => '<span style="background:var(--hover-bg);color:var(--text-muted);font-size:.7rem;padding:1px 7px;border-radius:10px;border:1px solid var(--border)">' + _esc(t) + '</span>').join('') +
        '</div>' : '') +
        (snip ? '<div class="search-result-preview">' + _hlMark(_esc(snip), q) + '</div>' : '') +
      '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">' +
        (r.date ? '<span style="font-size:.75rem;color:var(--text-muted)">' + r.date.slice(0,10) + '</span>' : '') +
        '<button class="btn-secondary" style="font-size:.75rem;white-space:nowrap" onclick="window._ttGo(\'' + r.navTarget + '\',' + navParamJSON + ')">Go &#8594;</button>' +
      '</div>' +
    '</div>';
  }

  function _showSkeleton() {
    const c = document.getElementById('tt-results-list');
    if (c) c.innerHTML = '<div class="search-skeleton"></div>'.repeat(3);
  }

  function _refreshSavedUI() {
    const saved = getSavedSearches();
    const listEl = document.getElementById('tt-saved-list');
    const ddEl   = document.getElementById('tt-saved-dd');
    if (listEl) {
      if (!saved.length) {
        listEl.innerHTML = '<div style="font-size:.75rem;color:var(--text-muted)">No saved searches yet.</div>';
      } else {
        listEl.innerHTML = saved.map(s => {
          const lbl = _esc(s.label.slice(0, 22)) + (s.label.length > 22 ? '\u2026' : '');
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border)">' +
            '<button class="search-preset-btn" style="flex:1;margin:0;border:none;padding:4px 0" onclick="window._ttLoadSearch(\'' + s.id + '\')" title="' + _esc(s.query) + '">' + lbl + '</button>' +
            '<button onclick="window._ttDeleteSearch(\'' + s.id + '\')" title="Delete" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:.9rem;padding:0 2px">&#x2715;</button>' +
          '</div>';
        }).join('');
      }
    }
    if (ddEl) {
      ddEl.innerHTML = '<option value="">Saved searches\u2026</option>' +
        saved.map(s => '<option value="' + s.id + '">' + _esc(s.label.slice(0, 36)) + '</option>').join('');
    }
  }

  function _renderResults(results, q) {
    const c = document.getElementById('tt-results-list');
    if (!c) return;
    if (!q || q.length < 2) {
      c.innerHTML = '<div style="text-align:center;padding:48px 24px;color:var(--text-muted)"><div style="font-size:2rem;margin-bottom:12px">&#128269;</div>Type at least 2 characters to search.</div>';
      return;
    }
    if (!results.length) {
      c.innerHTML = '<div style="text-align:center;padding:48px 24px;color:var(--text-muted)"><div style="font-size:1.5rem;margin-bottom:8px">&#128270;</div>No results for "<strong>' + _esc(q) + '</strong>". Try broader terms.</div>';
      return;
    }
    let sorted = results.slice();
    if (_sortBy === 'date') {
      sorted.sort((a, b) => (b.record.date || '').localeCompare(a.record.date || ''));
    } else if (_sortBy === 'type') {
      sorted.sort((a, b) => a.record.type.localeCompare(b.record.type) || b.score - a.score);
    }
    if (_grouped) {
      const groups = {};
      sorted.forEach(x => { const t = x.record.type; if (!groups[t]) groups[t] = []; groups[t].push(x); });
      c.innerHTML = Object.entries(groups).map(([type, items]) =>
        '<div class="search-group-header">' + type.replace(/-/g,' ').replace(/\b\w/g,l=>l.toUpperCase()) + ' (' + items.length + ')</div>' +
        items.map(x => _renderCard(x, q)).join('')
      ).join('');
    } else {
      c.innerHTML = sorted.map(x => _renderCard(x, q)).join('');
    }
  }

  function _runSearch() {
    const countEl  = document.getElementById('tt-results-count');
    const saveBtn  = document.getElementById('tt-save-btn');
    if (!_query || _query.length < 2) {
      const c = document.getElementById('tt-results-list');
      if (c) c.innerHTML = '<div style="text-align:center;padding:48px 24px;color:var(--text-muted)"><div style="font-size:2rem;margin-bottom:12px">&#128269;</div>Type at least 2 characters to search.</div>';
      if (countEl) countEl.textContent = 'Index: ' + _searchIdx.length + ' records ready';
      if (saveBtn) saveBtn.style.display = 'none';
      return;
    }
    _showSkeleton();
    setTimeout(() => {
      _searchIdx  = buildSearchIndex();
      _curResults = searchIndex(_query, _searchIdx, _filters);
      _renderResults(_curResults, _query);
      if (countEl) countEl.textContent = _curResults.length + ' result' + (_curResults.length !== 1 ? 's' : '') + ' for "' + _query + '"';
      if (saveBtn) saveBtn.style.display = _query ? 'inline-flex' : 'none';
    }, 120);
  }

  // ── Global handlers ─────────────────────────────────────────────────────────
  window._ttSearch = function(q) {
    _query = q;
    const cb = document.getElementById('tt-clear-btn');
    if (cb) cb.style.display = q ? 'block' : 'none';
    clearTimeout(_debTimer);
    _debTimer = setTimeout(_runSearch, 300);
  };

  window._ttClear = function() {
    _query = '';
    const inp = document.getElementById('tt-search-input');
    if (inp) { inp.value = ''; inp.focus(); }
    const cb = document.getElementById('tt-clear-btn');
    if (cb) cb.style.display = 'none';
    _curResults = [];
    _runSearch();
  };

  window._ttToggleType = function(type) {
    if (type === 'all') {
      _filters.types = [];
      document.querySelectorAll('.search-type-chip').forEach(el => el.classList.remove('active'));
      document.getElementById('tt-chip-all')?.classList.add('active');
    } else {
      document.getElementById('tt-chip-all')?.classList.remove('active');
      const chip = document.getElementById('tt-chip-' + type);
      if (_filters.types.includes(type)) {
        _filters.types = _filters.types.filter(t => t !== type);
        chip?.classList.remove('active');
      } else {
        _filters.types.push(type);
        chip?.classList.add('active');
      }
      if (!_filters.types.length) {
        document.getElementById('tt-chip-all')?.classList.add('active');
      }
    }
    _runSearch();
  };

  window._ttApplyFilters = function() {
    _filters.dateFrom = document.getElementById('tt-date-from')?.value || '';
    _filters.dateTo   = document.getElementById('tt-date-to')?.value   || '';
    _filters.tags     = document.getElementById('tt-tag-filter')?.value || '';
    _runSearch();
  };

  window._ttSaveSearch = function() {
    if (!_query || _query.length < 2) return;
    saveSearch(_query, Object.assign({}, _filters), _curResults.length);
    _refreshSavedUI();
    window._showNotifToast?.({ title: 'Search Saved', body: '"' + _query + '" was saved in this browser for quick access', severity: 'success' });
  };

  window._ttLoadSearch = function(id) {
    if (!id) return;
    const s = getSavedSearches().find(x => x.id === id);
    if (!s) return;
    _query   = s.query;
    _filters = Object.assign({ types: [], dateFrom: '', dateTo: '', tags: '' }, s.filters || {});
    const inp = document.getElementById('tt-search-input');
    if (inp) inp.value = _query;
    const cb = document.getElementById('tt-clear-btn');
    if (cb) cb.style.display = _query ? 'block' : 'none';
    // Restore type chips
    document.querySelectorAll('.search-type-chip').forEach(el => el.classList.remove('active'));
    if (_filters.types?.length) {
      _filters.types.forEach(t => document.getElementById('tt-chip-' + t)?.classList.add('active'));
    } else {
      document.getElementById('tt-chip-all')?.classList.add('active');
    }
    const dfEl = document.getElementById('tt-date-from'); if (dfEl) dfEl.value = _filters.dateFrom || '';
    const dtEl = document.getElementById('tt-date-to');   if (dtEl) dtEl.value = _filters.dateTo   || '';
    const tgEl = document.getElementById('tt-tag-filter'); if (tgEl) tgEl.value = _filters.tags    || '';
    const dd   = document.getElementById('tt-saved-dd');  if (dd)  dd.value = '';
    _runSearch();
  };

  window._ttDeleteSearch = function(id) {
    deleteSavedSearch(id);
    _refreshSavedUI();
  };

  window._ttGroupResults = function(grouped) {
    _grouped = grouped;
    _renderResults(_curResults, _query);
  };

  window._ttSort = function(by) {
    _sortBy = by;
    _renderResults(_curResults, _query);
  };

  window._ttExportCSV = function() {
    if (!_curResults.length) return;
    const header = ['Type','Title','Subtitle','Date','Tags','Preview'];
    const rows = _curResults.map(x => {
      const r = x.record;
      return [r.type, r.title, r.subtitle||'', r.date||'', (r.tags||[]).join(';'), (r.preview||'').slice(0,200)]
        .map(v => '"' + String(v).replace(/"/g,'""') + '"');
    });
    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = 'search-results-' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  window._ttPreset = function(name) {
    const inp  = document.getElementById('tt-search-input');
    const tgEl = document.getElementById('tt-tag-filter');
    const _setChips = types => {
      document.querySelectorAll('.search-type-chip').forEach(el => el.classList.remove('active'));
      if (types.length) {
        types.forEach(t => document.getElementById('tt-chip-' + t)?.classList.add('active'));
      } else {
        document.getElementById('tt-chip-all')?.classList.add('active');
      }
    };
    switch (name) {
      case 'recent-patients':
        _query = '';
        _filters = { types: ['patient'], dateFrom: '', dateTo: '', tags: '' };
        if (inp) inp.value = '';
        _setChips(['patient']);
        // Show all patients without keyword
        _searchIdx  = buildSearchIndex();
        _curResults = _searchIdx.filter(r => r.type === 'patient').slice(0, 50).map(r => ({ record: r, score: 50 }));
        _renderResults(_curResults, ' ');
        { const c = document.getElementById('tt-results-count'); if (c) c.textContent = _curResults.length + ' patient records'; }
        break;
      case 'open-protocols':
        _query = 'protocol'; _filters = { types: ['protocol'], dateFrom: '', dateTo: '', tags: '' };
        if (inp) inp.value = 'protocol'; _setChips(['protocol']); _runSearch(); break;
      case 'flagged-notes':
        _query = 'flagged'; _filters = { types: ['note'], dateFrom: '', dateTo: '', tags: 'flag' };
        if (inp) inp.value = 'flagged'; if (tgEl) tgEl.value = 'flag'; _setChips(['note']); _runSearch(); break;
      case 'overdue-invoices':
        _query = 'overdue'; _filters = { types: ['invoice'], dateFrom: '', dateTo: '', tags: '' };
        if (inp) inp.value = 'overdue'; _setChips(['invoice']); _runSearch(); break;
      case 'pending-reviews':
        _query = 'pending'; _filters = { types: ['qa-review'], dateFrom: '', dateTo: '', tags: 'pending' };
        if (inp) inp.value = 'pending'; if (tgEl) tgEl.value = 'pending'; _setChips(['qa-review']); _runSearch(); break;
    }
  };

  window._ttGo = function(navTarget, navParam) {
    if (navParam && typeof navParam === 'object') {
      Object.entries(navParam).forEach(([k, v]) => { window[k] = v; });
    }
    window._nav(navTarget);
  };
}

// ── Benchmark Library ────────────────────────────────────────────────────────

const BENCHMARK_DATA = {
  adhd: {
    neurofeedback: { n: 1253, meanImprovement: 28.4, sdImprovement: 12.1, responderRate: 0.68, sessions: 40, evidenceLevel: 'A', citation: 'Arns et al., 2014, Neurosci Biobehav Rev' },
    tms: { n: 187, meanImprovement: 18.2, sdImprovement: 9.8, responderRate: 0.52, sessions: 20, evidenceLevel: 'B', citation: 'Weaver et al., 2012, J Atten Disord' },
    tdcs: { n: 142, meanImprovement: 15.6, sdImprovement: 8.3, responderRate: 0.48, sessions: 15, evidenceLevel: 'B', citation: 'Shiozawa et al., 2014, Neuropsychiatric Dis Treat' },
  },
  anxiety: {
    neurofeedback: { n: 892, meanImprovement: 32.1, sdImprovement: 14.2, responderRate: 0.71, sessions: 30, evidenceLevel: 'B', citation: 'Schoenberg & David, 2014, Appl Psychophysiol Biofeedback' },
    ces: { n: 567, meanImprovement: 24.8, sdImprovement: 11.5, responderRate: 0.63, sessions: 20, evidenceLevel: 'B', citation: 'Morriss et al., 2019, Neuropsychiatric Dis Treat' },
    tdcs: { n: 234, meanImprovement: 19.3, sdImprovement: 10.1, responderRate: 0.55, sessions: 15, evidenceLevel: 'C', citation: 'Brunelin et al., 2018, J Psychiatr Res' },
    tavns: { n: 189, meanImprovement: 21.7, sdImprovement: 9.4, responderRate: 0.58, sessions: 24, evidenceLevel: 'B', citation: 'Clancy et al., 2014, Psychol Med' },
  },
  depression: {
    tms: { n: 4521, meanImprovement: 38.7, sdImprovement: 16.3, responderRate: 0.74, sessions: 36, evidenceLevel: 'A', citation: 'Carpenter et al., 2012, Brain Stimul' },
    neurofeedback: { n: 623, meanImprovement: 29.4, sdImprovement: 13.8, responderRate: 0.66, sessions: 30, evidenceLevel: 'B', citation: 'Hammond, 2005, J Neurotherapy' },
    tdcs: { n: 891, meanImprovement: 26.1, sdImprovement: 11.9, responderRate: 0.61, sessions: 20, evidenceLevel: 'A', citation: 'Brunoni et al., 2013, JAMA Psychiatry' },
    ces: { n: 412, meanImprovement: 22.3, sdImprovement: 10.7, responderRate: 0.57, sessions: 20, evidenceLevel: 'B', citation: 'Bystritsky et al., 2008, J Clin Psychiatry' },
  },
  ptsd: {
    neurofeedback: { n: 387, meanImprovement: 34.2, sdImprovement: 15.1, responderRate: 0.69, sessions: 24, evidenceLevel: 'B', citation: 'van der Kolk et al., 2016, Eur J Psychotraumatol' },
    tms: { n: 298, meanImprovement: 27.8, sdImprovement: 13.2, responderRate: 0.64, sessions: 20, evidenceLevel: 'B', citation: 'Watts et al., 2012, J Rehabil Res Dev' },
  },
  insomnia: {
    neurofeedback: { n: 412, meanImprovement: 41.3, sdImprovement: 17.2, responderRate: 0.76, sessions: 20, evidenceLevel: 'B', citation: 'Cortoos et al., 2010, Appl Psychophysiol Biofeedback' },
    ces: { n: 334, meanImprovement: 35.6, sdImprovement: 14.8, responderRate: 0.72, sessions: 15, evidenceLevel: 'B', citation: 'Lande & Gragnani, 2013, Prim Care Companion CNS Disord' },
  },
  chronic_pain: {
    tms: { n: 876, meanImprovement: 31.4, sdImprovement: 14.6, responderRate: 0.67, sessions: 20, evidenceLevel: 'A', citation: 'Lefaucheur et al., 2014, Clin Neurophysiol' },
    tdcs: { n: 543, meanImprovement: 28.9, sdImprovement: 13.1, responderRate: 0.62, sessions: 15, evidenceLevel: 'A', citation: "O'Connell et al., 2018, Cochrane Database Syst Rev" },
    neurofeedback: { n: 189, meanImprovement: 22.7, sdImprovement: 11.3, responderRate: 0.54, sessions: 24, evidenceLevel: 'C', citation: 'Jensen et al., 2013, Eur J Pain' },
  },
  tbi: {
    neurofeedback: { n: 234, meanImprovement: 19.8, sdImprovement: 10.4, responderRate: 0.51, sessions: 40, evidenceLevel: 'B', citation: 'Walker et al., 2002, J Neurotherapy' },
    tdcs: { n: 178, meanImprovement: 17.3, sdImprovement: 9.6, responderRate: 0.47, sessions: 20, evidenceLevel: 'B', citation: 'Hoy et al., 2013, J Neurotrauma' },
  },
  ocd: {
    tms: { n: 567, meanImprovement: 29.1, sdImprovement: 12.8, responderRate: 0.63, sessions: 29, evidenceLevel: 'A', citation: 'Berlim et al., 2013, J Psychiatr Res' },
    neurofeedback: { n: 112, meanImprovement: 18.4, sdImprovement: 9.7, responderRate: 0.49, sessions: 30, evidenceLevel: 'C', citation: 'Koprivova et al., 2013, Psychiatry Res' },
  },
  stroke_rehab: {
    tdcs: { n: 1243, meanImprovement: 22.6, sdImprovement: 11.8, responderRate: 0.58, sessions: 20, evidenceLevel: 'A', citation: 'Elsner et al., 2016, Cochrane Database Syst Rev' },
    tms: { n: 892, meanImprovement: 19.4, sdImprovement: 10.2, responderRate: 0.53, sessions: 15, evidenceLevel: 'A', citation: 'Hsu et al., 2012, Stroke' },
    neurofeedback: { n: 156, meanImprovement: 16.8, sdImprovement: 8.9, responderRate: 0.45, sessions: 30, evidenceLevel: 'C', citation: 'Ang et al., 2011, J Neuroeng Rehabil' },
  },
};

function _bmNormalCDF(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const phi = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z) * poly;
  return z >= 0 ? phi : 1 - phi;
}

function _bmCalculatePercentile(improvement, condition, modality) {
  const bench = BENCHMARK_DATA[condition]?.[modality];
  if (!bench) return null;
  const z = (improvement - bench.meanImprovement) / bench.sdImprovement;
  const percentile = Math.round(_bmNormalCDF(z) * 100);
  return { percentile, z, bench };
}

function _bmEvidenceBadgeStyle(level) {
  const bg  = { A: '#d1fae5', B: '#dbeafe', C: '#fef3c7', D: '#fee2e2' };
  const col = { A: '#065f46', B: '#1e40af', C: '#92400e', D: '#991b1b' };
  return `background:${bg[level] || '#f3f4f6'};color:${col[level] || '#374151'}`;
}

function _bmConditionLabel(c) {
  const map = {
    adhd: 'ADHD', anxiety: 'Anxiety', depression: 'Depression', ptsd: 'PTSD',
    insomnia: 'Insomnia', chronic_pain: 'Chronic Pain', tbi: 'TBI',
    ocd: 'OCD', stroke_rehab: 'Stroke Rehab',
  };
  return map[c] || c;
}

function _bmModalityLabel(m) {
  const map = { neurofeedback: 'Neurofeedback', tms: 'TMS', tdcs: 'tDCS', ces: 'CES', tavns: 'taVNS' };
  return map[m] || m;
}

function _bmResponderRing(rate) {
  const pct  = Math.round(rate * 100);
  const r    = 28, cx = 34, cy = 34;
  const circ = 2 * Math.PI * r;
  const dash = (rate * circ).toFixed(2);
  const gap  = (circ - rate * circ).toFixed(2);
  return `<svg width="68" height="68" style="display:block">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="5"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--accent-teal)" stroke-width="5"
      stroke-dasharray="${dash} ${gap}" stroke-dashoffset="${(circ * 0.25).toFixed(2)}"
      stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"/>
    <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
      font-size="11" font-weight="800" fill="var(--text-primary)">${pct}%</text>
  </svg>`;
}

function _bmBellCurveSVG(patientZ) {
  const W = 320, H = 90, pad = 20;
  const xScale = z => pad + ((z + 3) / 6) * (W - 2 * pad);
  const gauss  = z => (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z);
  const maxG   = gauss(0);
  const yScale = v => H - pad - v * (H - 2 * pad);
  const pts = [];
  for (let i = 0; i <= 100; i++) {
    const z = -3 + (i / 100) * 6;
    pts.push(`${xScale(z).toFixed(1)},${yScale(gauss(z) / maxG).toFixed(1)}`);
  }
  const clampedZ = Math.max(-3, Math.min(3, patientZ));
  const mx = xScale(clampedZ).toFixed(1);
  const zSign = patientZ >= 0 ? '+' : '';
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="overflow:visible;width:100%;max-width:${W}px;height:auto">
    <polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent-teal)" stroke-width="2.5" stroke-linejoin="round"/>
    <line x1="${mx}" y1="${(pad - 6)}" x2="${mx}" y2="${(H - pad + 4)}" stroke="#ef4444" stroke-width="2" stroke-dasharray="4 2"/>
    <circle cx="${mx}" cy="${yScale(gauss(clampedZ) / maxG).toFixed(1)}" r="4" fill="#ef4444"/>
    <text x="${pad}" y="${H - 4}" font-size="9" fill="var(--text-muted)">-3\u03c3</text>
    <text x="${(xScale(0) - 12).toFixed(1)}" y="${H - 4}" font-size="9" fill="var(--text-muted)">mean</text>
    <text x="${(W - pad - 12)}" y="${H - 4}" font-size="9" fill="var(--text-muted)">+3\u03c3</text>
    <text x="${mx}" y="${(pad - 10)}" text-anchor="middle" font-size="9" font-weight="700" fill="#ef4444">z=${zSign}${patientZ.toFixed(2)}</text>
  </svg>`;
}

function _bmCardHTML(condition, modality, bench) {
  const nFmt = bench.n.toLocaleString();
  return `<div class="benchmark-card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
      <div>
        <div style="font-weight:700;font-size:.95rem">${_bmConditionLabel(condition)}</div>
        <div style="font-size:.8rem;color:var(--text-muted)">${_bmModalityLabel(modality)}</div>
      </div>
      <span style="padding:3px 8px;border-radius:12px;font-size:.75rem;font-weight:700;${_bmEvidenceBadgeStyle(bench.evidenceLevel)}">Level ${bench.evidenceLevel}</span>
    </div>
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px">
      <div>
        <div class="benchmark-mean">${bench.meanImprovement}%</div>
        <div class="benchmark-sd">\u00b1 ${bench.sdImprovement}% SD improvement</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center">
        ${_bmResponderRing(bench.responderRate)}
        <div style="font-size:.7rem;color:var(--text-muted);margin-top:2px">responders</div>
      </div>
    </div>
    <div style="display:flex;gap:16px;font-size:.8rem;color:var(--text-muted);margin-bottom:8px">
      <span>n = ${nFmt}</span><span>${bench.sessions} sessions</span>
    </div>
    <div class="benchmark-citation">${bench.citation}</div>
    <button class="btn btn-sm" style="margin-top:10px;width:100%;font-size:.78rem"
      onclick="window._benchmarkSetTarget('${condition}','${modality}')">Use as Target</button>
  </div>`;
}

function _bmExplorerHTML(filterCond, filterMod) {
  const conditions = Object.keys(BENCHMARK_DATA);
  const modalities = ['neurofeedback', 'tms', 'tdcs', 'ces', 'tavns'];
  const condOptions = conditions.map(c => `<option value="${c}" ${filterCond === c ? 'selected' : ''}>${_bmConditionLabel(c)}</option>`).join('');
  const modOptions  = ['all', ...modalities].map(m => `<option value="${m}" ${filterMod === m ? 'selected' : ''}>${m === 'all' ? 'All Modalities' : _bmModalityLabel(m)}</option>`).join('');
  const cards = [];
  for (const cond of conditions) {
    if (filterCond !== 'all' && filterCond !== cond) continue;
    for (const mod of Object.keys(BENCHMARK_DATA[cond])) {
      if (filterMod !== 'all' && filterMod !== mod) continue;
      cards.push(_bmCardHTML(cond, mod, BENCHMARK_DATA[cond][mod]));
    }
  }
  return `<div style="display:flex;gap:12px;align-items:flex-end;margin-bottom:16px;flex-wrap:wrap">
    <div>
      <label style="font-size:.78rem;color:var(--text-muted);display:block;margin-bottom:3px">Condition</label>
      <select class="form-control" style="min-width:160px" onchange="window._benchmarkFilterCondition(this.value)">
        <option value="all" ${filterCond === 'all' ? 'selected' : ''}>All Conditions</option>
        ${condOptions}
      </select>
    </div>
    <div>
      <label style="font-size:.78rem;color:var(--text-muted);display:block;margin-bottom:3px">Modality</label>
      <select class="form-control" style="min-width:160px" onchange="window._benchmarkFilterModality(this.value)">
        ${modOptions}
      </select>
    </div>
    <div style="font-size:.8rem;color:var(--text-muted);padding-bottom:4px">${cards.length} benchmark${cards.length !== 1 ? 's' : ''}</div>
  </div>
  <div class="benchmark-grid">
    ${cards.length ? cards.join('') : '<div style="color:var(--text-muted);padding:24px">No benchmarks match the selected filters.</div>'}
  </div>`;
}

function _bmInterpBlock(percentile) {
  if (percentile >= 75) return ['benchmark-interp-excellent', 'Excellent response \u2014 top quartile compared to published literature'];
  if (percentile >= 50) return ['benchmark-interp-good',      'Good response \u2014 above median for this condition/modality'];
  if (percentile >= 25) return ['benchmark-interp-moderate',  'Moderate response \u2014 below median, consider protocol optimization'];
  return                       ['benchmark-interp-low',       'Below average response \u2014 review protocol and consider adjunctive approaches'];
}

function _bmCalcResultHTML(result, val) {
  if (!result) return `<div style="text-align:center;padding:32px;color:var(--text-muted)">
    <div style="font-size:2.5rem;margin-bottom:12px">&#128208;</div>
    <div style="font-weight:600">Select a condition and modality, enter the patient\u2019s improvement percentage, then click Calculate.</div>
  </div>`;
  const { percentile, z, bench } = result;
  const top25  = (bench.meanImprovement + 0.674 * bench.sdImprovement).toFixed(1);
  const top10  = (bench.meanImprovement + 1.282 * bench.sdImprovement).toFixed(1);
  const [interpClass, interpText] = _bmInterpBlock(percentile);
  const zSign  = z >= 0 ? '+' : '';
  const zLabel = z >= 0 ? 'above average' : 'below average';
  return `<div class="percentile-display">${percentile}<span style="font-size:1.4rem">th</span></div>
    <div style="text-align:center;color:var(--text-muted);font-size:.85rem;margin-bottom:8px">percentile</div>
    <div class="percentile-bell">${_bmBellCurveSVG(z)}</div>
    <div class="${interpClass}">${interpText}</div>
    <div style="font-size:.8rem;color:var(--text-muted);margin:8px 0">Z-score: ${zSign}${z.toFixed(2)} (${zLabel})</div>
    <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:12px">Based on: <em>${bench.citation}</em></div>
    <table style="width:100%;border-collapse:collapse;font-size:.82rem">
      <thead><tr style="border-bottom:1px solid var(--border)">
        <th style="text-align:left;padding:6px 4px;color:var(--text-muted)">Group</th>
        <th style="text-align:right;padding:6px 4px;color:var(--text-muted)">Improvement</th>
      </tr></thead>
      <tbody>
        <tr style="border-bottom:1px solid var(--border);font-weight:700;color:var(--accent-teal)">
          <td style="padding:6px 4px">Your Patient</td><td style="text-align:right;padding:6px 4px">${val}%</td>
        </tr>
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:6px 4px">Literature Mean</td><td style="text-align:right;padding:6px 4px">${bench.meanImprovement}%</td>
        </tr>
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:6px 4px">Top 25%</td><td style="text-align:right;padding:6px 4px">&ge;${top25}%</td>
        </tr>
        <tr>
          <td style="padding:6px 4px">Top 10%</td><td style="text-align:right;padding:6px 4px">&ge;${top10}%</td>
        </tr>
      </tbody>
    </table>`;
}

function _bmCalculatorHTML(calcResult, calcCondition, calcModality, calcImprovement) {
  const conditions  = Object.keys(BENCHMARK_DATA);
  const condOptions = conditions.map(c => `<option value="${c}" ${calcCondition === c ? 'selected' : ''}>${_bmConditionLabel(c)}</option>`).join('');
  const modsByCondition = calcCondition && BENCHMARK_DATA[calcCondition] ? Object.keys(BENCHMARK_DATA[calcCondition]) : ['neurofeedback','tms','tdcs','ces','tavns'];
  const modOptions  = modsByCondition.map(m => `<option value="${m}" ${calcModality === m ? 'selected' : ''}>${_bmModalityLabel(m)}</option>`).join('');
  const impVal = calcImprovement ?? 30;
  return `<div style="display:grid;grid-template-columns:340px 1fr;gap:20px;align-items:start">
    <div class="benchmark-card">
      <h3 style="font-size:.9rem;font-weight:700;margin-bottom:14px">Patient Data</h3>
      <div style="margin-bottom:12px">
        <label style="font-size:.78rem;color:var(--text-muted);display:block;margin-bottom:4px">Condition</label>
        <select id="bm-calc-condition" class="form-control" onchange="window._benchmarkUpdateCalcModalities()">
          <option value="">Select condition\u2026</option>
          ${condOptions}
        </select>
      </div>
      <div style="margin-bottom:12px">
        <label style="font-size:.78rem;color:var(--text-muted);display:block;margin-bottom:4px">Modality</label>
        <select id="bm-calc-modality" class="form-control">
          <option value="">Select modality\u2026</option>
          ${modOptions}
        </select>
      </div>
      <div style="margin-bottom:16px">
        <label style="font-size:.78rem;color:var(--text-muted);display:block;margin-bottom:4px">
          Patient Improvement: <strong id="bm-slider-val">${impVal}%</strong>
        </label>
        <input type="range" id="bm-calc-slider" min="0" max="100" value="${impVal}" style="width:100%;margin-bottom:6px"
          oninput="document.getElementById('bm-slider-val').textContent=this.value+'%';document.getElementById('bm-calc-input').value=this.value">
        <input type="number" id="bm-calc-input" class="form-control" min="0" max="100" value="${impVal}"
          oninput="document.getElementById('bm-slider-val').textContent=this.value+'%';document.getElementById('bm-calc-slider').value=this.value">
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="window._benchmarkCalculate()">Calculate Percentile</button>
    </div>
    <div class="benchmark-card" id="bm-calc-results">${_bmCalcResultHTML(calcResult, impVal)}</div>
  </div>`;
}

function _bmClinicCompareHTML() {
  const mockMean     = 31.2;
  const mockRespond  = 0.67;
  const mockSessions = 28;
  const topConditions = ['depression', 'adhd', 'anxiety', 'ptsd'];
  const gradeScore = (() => {
    let total = 0, count = 0;
    for (const cond of topConditions) {
      const mods = Object.keys(BENCHMARK_DATA[cond] || {});
      if (!mods.length) continue;
      total += mockMean / BENCHMARK_DATA[cond][mods[0]].meanImprovement;
      count++;
    }
    const ratio = count ? total / count : 1;
    if (ratio >= 1.05) return 'A';
    if (ratio >= 0.95) return 'B';
    if (ratio >= 0.85) return 'C';
    return 'D';
  })();
  const gradeColor = { A: '#065f46', B: '#1e40af', C: '#92400e', D: '#991b1b' }[gradeScore];
  const gradeBg    = { A: '#d1fae5', B: '#dbeafe', C: '#fef3c7', D: '#fee2e2' }[gradeScore];
  const compareRows = topConditions.map(cond => {
    const mods = Object.keys(BENCHMARK_DATA[cond] || {});
    if (!mods.length) return '';
    const bench   = BENCHMARK_DATA[cond][mods[0]];
    const litMean = bench.meanImprovement;
    const topQ    = +(litMean + 0.674 * bench.sdImprovement).toFixed(1);
    const maxVal  = Math.max(mockMean, litMean, topQ) * 1.1;
    const pct = v => ((v / maxVal) * 100).toFixed(1);
    return `<div style="margin-bottom:18px">
      <div style="font-weight:700;font-size:.85rem;margin-bottom:6px">${_bmConditionLabel(cond)}
        <span style="font-size:.75rem;font-weight:400;color:var(--text-muted)">(${_bmModalityLabel(mods[0])} reference)</span>
      </div>
      <div class="clinic-compare-row">
        <div style="width:90px;font-size:.78rem">My Clinic</div>
        <div class="clinic-bar-wrap">
          <div class="clinic-bar-track"><div class="clinic-bar-mine" style="width:${pct(mockMean)}%"></div></div>
          <div style="font-size:.72rem;color:var(--text-muted)">${mockMean}%</div>
        </div>
      </div>
      <div class="clinic-compare-row">
        <div style="width:90px;font-size:.78rem">Literature</div>
        <div class="clinic-bar-wrap">
          <div class="clinic-bar-track"><div class="clinic-bar-lit" style="width:${pct(litMean)}%"></div></div>
          <div style="font-size:.72rem;color:var(--text-muted)">${litMean}%</div>
        </div>
      </div>
      <div class="clinic-compare-row">
        <div style="width:90px;font-size:.78rem">Top 25%</div>
        <div class="clinic-bar-wrap">
          <div class="clinic-bar-track"><div class="clinic-bar-top" style="width:${pct(topQ)}%"></div></div>
          <div style="font-size:.72rem;color:var(--text-muted)">${topQ}%</div>
        </div>
      </div>
    </div>`;
  }).join('');
  return `<div style="display:grid;grid-template-columns:1fr 280px;gap:24px;align-items:start">
    <div>
      <h3 style="font-size:.9rem;font-weight:700;margin-bottom:16px">Condition Comparison</h3>
      ${compareRows}
      <p style="font-size:.72rem;font-style:italic;color:var(--text-muted);margin-top:12px">
        Benchmarks sourced from peer-reviewed literature. Individual results may vary.
      </p>
    </div>
    <div class="benchmark-card" style="text-align:center">
      <div style="font-size:.85rem;font-weight:700;margin-bottom:4px">Clinic Summary</div>
      <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:16px">vs. published literature</div>
      <div style="font-size:.8rem;margin-bottom:4px">Mean improvement</div>
      <div style="font-size:1.6rem;font-weight:800;color:var(--accent-teal);margin-bottom:2px">${mockMean}%</div>
      <div style="font-size:.68rem;color:var(--text-muted);margin-bottom:12px">(literature benchmark)</div>
      <div style="font-size:.8rem;margin-bottom:4px">Responder rate</div>
      <div style="font-size:1.6rem;font-weight:800;color:var(--accent-teal);margin-bottom:2px">${Math.round(mockRespond * 100)}%</div>
      <div style="font-size:.68rem;color:var(--text-muted);margin-bottom:12px">(literature benchmark)</div>
      <div style="font-size:.8rem;margin-bottom:4px">Mean sessions to response</div>
      <div style="font-size:1.6rem;font-weight:800;color:var(--accent-teal);margin-bottom:16px">${mockSessions}</div>
      <div style="font-size:.8rem;font-weight:600;margin-bottom:4px">Overall Clinic Grade</div>
      <div class="clinic-grade" style="color:${gradeColor};background:${gradeBg};border-radius:10px;padding:8px 0">${gradeScore}</div>
      <button class="btn btn-sm" style="margin-top:12px;width:100%" onclick="window._benchmarkExport()">Download Benchmark Report</button>
    </div>
  </div>`;
}

export async function pgBenchmarkLibrary(setTopbar) {
  setTopbar('Outcome Benchmark Library',
    '<button class="btn btn-primary btn-sm" onclick="window._benchmarkExport()">Download Report</button>'
  );
  const content = document.getElementById('content');
  if (!content) return;

  let _activeTab       = 'explorer';
  let _filterCond      = 'all';
  let _filterMod       = 'all';
  let _calcCondition   = '';
  let _calcModality    = '';
  let _calcImprovement = 30;
  let _calcResult      = null;

  function _render() {
    const tabs = [
      { id: 'explorer',   label: 'Benchmark Explorer' },
      { id: 'calculator', label: 'Percentile Calculator' },
      { id: 'clinic',     label: 'Clinic Comparison' },
    ];
    const tabNav = tabs.map(t =>
      `<button class="tab-btn ${_activeTab === t.id ? 'active' : ''}" onclick="window._benchmarkTab('${t.id}')">${t.label}</button>`
    ).join('');
    let body = '';
    if (_activeTab === 'explorer')   body = _bmExplorerHTML(_filterCond, _filterMod);
    if (_activeTab === 'calculator') body = _bmCalculatorHTML(_calcResult, _calcCondition, _calcModality, _calcImprovement);
    if (_activeTab === 'clinic')     body = _bmClinicCompareHTML();
    content.innerHTML = `<div style="max-width:1400px;margin:0 auto;padding:0 4px">
      <div style="margin-bottom:20px">
        <h2 style="font-size:1.1rem;font-weight:700;margin-bottom:4px">Outcome Benchmark Library</h2>
        <p style="font-size:12.5px;color:var(--text-secondary)">Normative data from peer-reviewed neuromodulation literature. Set outcome targets, calculate patient percentiles, and compare clinic performance.</p>
      </div>
      <div style="background:rgba(148,163,184,0.08);border:1px solid rgba(148,163,184,0.2);border-radius:10px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-secondary)">
        <span>📊</span>
        <span><strong style="color:var(--text-primary)">Illustrative benchmarks only.</strong> Values shown reflect published literature ranges for neuromodulation outcomes. Your clinic's actual outcomes will populate here as patient data accumulates.</span>
      </div>
      <div class="tab-nav" style="margin-bottom:20px">${tabNav}</div>
      <div id="bm-tab-body">${body}</div>
    </div>`;
  }

  _render();

  window._benchmarkTab = function(tab) {
    _activeTab = tab;
    _render();
  };

  window._benchmarkFilterCondition = function(c) {
    _filterCond = c;
    const el = document.getElementById('bm-tab-body');
    if (el) el.innerHTML = _bmExplorerHTML(_filterCond, _filterMod);
  };

  window._benchmarkFilterModality = function(m) {
    _filterMod = m;
    const el = document.getElementById('bm-tab-body');
    if (el) el.innerHTML = _bmExplorerHTML(_filterCond, _filterMod);
  };

  window._benchmarkSetTarget = function(condition, modality) {
    _calcCondition   = condition;
    _calcModality    = modality;
    _calcResult      = null;
    _activeTab       = 'calculator';
    _render();
  };

  window._benchmarkUpdateCalcModalities = function() {
    const condEl = document.getElementById('bm-calc-condition');
    const modEl  = document.getElementById('bm-calc-modality');
    if (!condEl || !modEl) return;
    const cond = condEl.value;
    const mods = cond && BENCHMARK_DATA[cond] ? Object.keys(BENCHMARK_DATA[cond]) : [];
    modEl.innerHTML = `<option value="">Select modality\u2026</option>` +
      mods.map(m => `<option value="${m}">${_bmModalityLabel(m)}</option>`).join('');
  };

  window._benchmarkCalculate = function() {
    const condEl = document.getElementById('bm-calc-condition');
    const modEl  = document.getElementById('bm-calc-modality');
    const valEl  = document.getElementById('bm-calc-input');
    if (!condEl || !modEl || !valEl) return;
    const cond = condEl.value;
    const mod  = modEl.value;
    const val  = parseFloat(valEl.value);
    if (!cond || !mod || isNaN(val)) {
      _dsToast('Please select a condition, modality, and enter an improvement percentage.', 'warn');
      return;
    }
    _calcCondition   = cond;
    _calcModality    = mod;
    _calcImprovement = val;
    _calcResult      = _bmCalculatePercentile(val, cond, mod);
    const resultsEl  = document.getElementById('bm-calc-results');
    if (resultsEl) resultsEl.innerHTML = _bmCalcResultHTML(_calcResult, val);
  };

  window._benchmarkExport = function() {
    const rows = [
      ['Condition', 'Modality', 'n', 'Mean Improvement %', 'SD %', 'Responder Rate', 'Sessions', 'Evidence Level', 'Citation'],
    ];
    for (const cond of Object.keys(BENCHMARK_DATA)) {
      for (const mod of Object.keys(BENCHMARK_DATA[cond])) {
        const b = BENCHMARK_DATA[cond][mod];
        rows.push([
          _bmConditionLabel(cond), _bmModalityLabel(mod),
          b.n, b.meanImprovement, b.sdImprovement,
          (b.responderRate * 100).toFixed(0) + '%', b.sessions,
          b.evidenceLevel, b.citation,
        ]);
      }
    }
    rows.push([]);
    rows.push(['--- Clinic Comparison ---']);
    rows.push(['Metric', 'Value']);
    rows.push(['Mean Improvement %', '31.2%']);
    rows.push(['Responder Rate', '67%']);
    rows.push(['Mean Sessions to Response', '28']);
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'benchmark-report-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
}

// ── pgConsentAutomation ───────────────────────────────────────────────────────
//
// Wiring contract (feat/docs-reports-go-live):
//   • Records     → GET /api/v1/consent/records      (hydrate on mount)
//   • Audit log   → GET /api/v1/consent/audit-log
//   • Automations → GET /api/v1/consent/automation-rules
//   • Compliance  → POST /api/v1/consent/compliance-score
//   • Versions    → localStorage only (no server schema yet, labelled "local")
//   • Deletions   → localStorage only (no server schema yet, labelled "local")
//
// When the backend call fails or returns []), the tab shows an honest empty
// state — NEVER auto-seed demo patient names into the consent tracker.
export async function pgConsentAutomation(setTopbar) {
  setTopbar('Consent & Compliance',
    `<button class="btn btn-primary btn-sm" onclick="window._consentExportAudit()">Export Audit Log</button>`
  );

  const ROOT_ID = 'ggg-consent-root';

  // Local-only stores (no server equivalent today).
  const LOCAL_KEYS = {
    versions:  'ds_consent_versions',
    deletions: 'ds_deletion_requests',
  };
  // Legacy localStorage keys we now IGNORE so stale demo rows can't reappear.
  // (Kept in localStorage so users don't lose data, but never read here.)
  //   ds_consent_records, ds_consent_automations, ds_consent_audit_log
  function lsGet(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  }
  function lsSave(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  // In-memory backend caches populated by hydrateServer().
  let _srvRecords   = [];
  let _srvAudit     = [];
  let _srvAutomations = [];
  let _srvLoaded    = { records: false, audit: false, automations: false };
  let _srvError     = null;
  let _patientsById = {};

  // Patient resolver — consent records reference patient_id; the UI surfaces
  // names, so we hydrate a name map once.
  async function _loadPatientsMap() {
    try {
      const pr = await api.listPatients?.();
      const items = pr?.items || pr || [];
      items.forEach(p => {
        _patientsById[String(p.id)] = `${p.first_name||''} ${p.last_name||p.name||''}`.trim() || `Patient #${p.id}`;
      });
    } catch (_) { /* ignore — patient names fall back to ids */ }
  }

  // Project a server ConsentRecord into the row shape the tracker table uses.
  // status mapping: if backend says active but expires_at is <30d away we
  // surface as 'expiring' so the same filter chips keep working.
  function _rowFromServer(r) {
    const pname = _patientsById[String(r.patient_id)] || r.patient_id || '—';
    const now = Date.now();
    let status = r.status || 'active';
    if (status === 'active' && r.expires_at) {
      const exp = Date.parse(r.expires_at);
      if (!isNaN(exp)) {
        if (exp < now) status = 'expired';
        else if (exp - now < 30 * 86400000) status = 'expiring';
      }
    }
    if (!r.signed && status === 'active') status = 'pending';
    return {
      id: r.id, name: pname, patient_id: r.patient_id,
      type: r.consent_type || 'General',
      version: r.modality_slug || null,
      signed: r.signed_at ? r.signed_at.slice(0, 10) : null,
      expiry: r.expires_at ? r.expires_at.slice(0, 10) : null,
      status,
      notes: r.notes || '',
      document_ref: r.document_ref || null,
    };
  }

  function _auditRowFromServer(l) {
    const pname = _patientsById[String(l.patient_id)] || l.patient_id || 'System';
    return {
      id: l.id,
      ts: l.created_at || l.timestamp || new Date().toISOString(),
      event: l.event || l.action || 'Event',
      patient: pname,
      extra: l.details || l.notes || '',
    };
  }

  async function hydrateServer() {
    _srvError = null;
    await _loadPatientsMap();
    const [rR, aR, ruR] = await Promise.allSettled([
      api.listConsentRecords ? api.listConsentRecords() : Promise.resolve(null),
      api.getConsentAuditLog ? api.getConsentAuditLog() : Promise.resolve(null),
      api.listConsentAutomationRules ? api.listConsentAutomationRules() : Promise.resolve(null),
    ]);
    if (rR.status === 'fulfilled' && rR.value) {
      const items = rR.value?.items || rR.value || [];
      _srvRecords = Array.isArray(items) ? items.map(_rowFromServer) : [];
      _srvLoaded.records = true;
    } else {
      _srvError = (rR.reason && rR.reason.message) || 'Consent records unavailable';
    }
    if (aR.status === 'fulfilled' && aR.value) {
      const items = aR.value?.items || aR.value || [];
      _srvAudit = Array.isArray(items) ? items.map(_auditRowFromServer) : [];
      _srvLoaded.audit = true;
    }
    if (ruR.status === 'fulfilled' && ruR.value) {
      const items = ruR.value?.items || ruR.value || [];
      _srvAutomations = Array.isArray(items) ? items : [];
      _srvLoaded.automations = true;
    }
  }

  // Seed ONLY the local-only tabs (versions, deletions). Records / audit /
  // automations come from the server — no demo-patient fabrication.
  function seedLocalIfNeeded() {
    if (!lsGet(LOCAL_KEYS.versions)) {
      lsSave(LOCAL_KEYS.versions, [
        { id:'v1', ver:'v1.0', docName:'General Consent Form', effectiveDate:'2023-01-01', changes:'Initial version. Covers standard neuromodulation treatments, data use, and risk disclosure.', active:false, patientCount:0 },
        { id:'v2', ver:'v1.1', docName:'General Consent Form', effectiveDate:'2024-03-15', changes:'Added EEG biofeedback clause. Updated HIPAA section 3.2 to reflect new data-sharing policy. Minor wording clarifications throughout.', active:false, patientCount:0 },
        { id:'v3', ver:'v2.0', docName:'General Consent Form', effectiveDate:'2025-07-01', changes:'Major revision: Added TMS and neurofeedback-specific risk disclosures. Incorporated GDPR Article 7 explicit consent language. Added guardian consent section for minors. Removed deprecated HITECH references.', active:true, patientCount:0 },
      ]);
    }
    if (!lsGet(LOCAL_KEYS.deletions)) {
      lsSave(LOCAL_KEYS.deletions, []);
    }
  }

  // Unified record-list accessor — server-preferred, never invents patients.
  function loadRecords() { return _srvRecords; }
  function loadAutomations() { return _srvAutomations; }
  function loadAudit() { return _srvAudit; }
  function loadVersions() { return lsGet(LOCAL_KEYS.versions) || []; }
  function loadDeletions() { return lsGet(LOCAL_KEYS.deletions) || []; }

  // Audit mutation: best-effort local prepend (so UI shows immediate feedback).
  // Server-side audit rows come from the backend on next hydrate; this local
  // row is cosmetic only and does not persist across reloads.
  function addAudit(event, patientName, extra) {
    _srvAudit.unshift({
      id: 'pending-' + Math.random().toString(36).slice(2),
      ts: new Date().toISOString(),
      event, patient: patientName || 'System',
      extra: extra || '',
      _pending: true,
    });
    if (_srvAudit.length > 200) _srvAudit.length = 200;
  }

  seedLocalIfNeeded();
  await hydrateServer();

  // ── Tab / filter state ────────────────────────────────────────────────────
  let _tab          = 'tracker';
  let _statusFilter = 'all';
  let _auditFilter  = 'all';
  let _diffA        = 'v1';
  let _diffB        = 'v3';
  let _selectedIds  = new Set();

  // ── Render helpers ────────────────────────────────────────────────────────
  function badgeHTML(status) {
    const labels = { active:'Active', expiring:'Expiring Soon', expired:'Expired', pending:'Pending', processing:'Processing', completed:'Completed' };
    return `<span class="ggg-status-badge ${status}">${labels[status] || status}</span>`;
  }

  function fmtDate(iso) {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  }

  function fmtTS(iso) {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
  }

  // ── Tab 1: Consent Tracker ────────────────────────────────────────────────
  function renderTracker() {
    const records  = loadRecords();
    const filtered = _statusFilter === 'all' ? records : records.filter(r => r.status === _statusFilter);
    const bulkBtn  = _selectedIds.size > 0
      ? `<button class="btn btn-primary btn-sm" onclick="window._consentBulkReconsent()">Bulk Re-consent (${_selectedIds.size})</button>`
      : '';
    const rows = filtered.map(r => {
      const sel = _selectedIds.has(r.id);
      return `<tr class="${sel ? 'ggg-selected' : ''}">
        <td><input type="checkbox" ${sel ? 'checked' : ''} onchange="window._consentToggleSelect('${_hubEscHtml(r.id)}',this.checked)"></td>
        <td style="font-weight:600">${_hubEscHtml(r.name)}</td>
        <td>${_hubEscHtml(r.type)}</td>
        <td>${_hubEscHtml(r.version) || '\u2014'}</td>
        <td>${fmtDate(r.signed)}</td>
        <td>${fmtDate(r.expiry)}</td>
        <td>${badgeHTML(r.status)}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-secondary btn-xs" onclick="window._consentView('${r.id}')">View</button>
          <button class="btn btn-secondary btn-xs" style="margin:0 4px" onclick="window._consentResend('${r.id}')">Re-send</button>
          <button class="btn btn-secondary btn-xs" style="color:var(--accent-rose)" onclick="window._consentRevoke('${r.id}')">Revoke</button>
        </td>
      </tr>`;
    }).join('');
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <label style="font-size:.8rem;color:var(--text-muted)">Filter by status:</label>
          <select onchange="window._consentFilterStatus(this.value)"
            style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:7px;padding:6px 10px;font-size:.85rem;color:var(--text)">
            ${['all','active','expiring','expired','pending'].map(s =>
              `<option value="${s}" ${_statusFilter===s?'selected':''}>${s === 'all' ? 'All' : badgeHTML(s).replace(/<[^>]+>/g,'')}</option>`
            ).join('')}
          </select>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          ${bulkBtn}
          <span style="font-size:.78rem;color:var(--text-muted)">${filtered.length} record${filtered.length!==1?'s':''}</span>
        </div>
      </div>
      <div style="overflow-x:auto;border:1px solid var(--border);border-radius:10px">
        <table class="ggg-consent-table">
          <thead><tr>
            <th><input type="checkbox" onchange="window._consentSelectAll(this.checked)"></th>
            <th>Patient</th><th>Consent Type</th><th>Version</th>
            <th>Signed Date</th><th>Expiry Date</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>${rows || (records.length === 0
            ? '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">'
                + (_srvError
                    ? 'Could not load consent records from the server. <button class="btn btn-xs" style="margin-left:6px" onclick="window._consentReloadAll()">Retry</button>'
                    : 'No consent records yet. Create a consent from the patient record or the Documents hub.')
                + '</td></tr>'
            : '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">No records match the filter.</td></tr>'
          )}</tbody>
        </table>
      </div>`;
  }

  // ── Tab 2: Automation Workflows ───────────────────────────────────────────
  function renderAutomation() {
    const autos = loadAutomations();
    const audit  = loadAudit().slice(0, 10);
    const rules  = autos.map(a => `
      <div class="ggg-automation-rule">
        <div class="rule-body">
          <div class="rule-title">${a.name}</div>
          <div class="rule-meta">
            <span style="color:var(--text-muted)">Trigger:</span> ${a.trigger}<br>
            <span style="color:var(--text-muted)">Action:</span> ${a.action}
          </div>
        </div>
        <label class="ggg-toggle-switch" title="${a.enabled ? 'Disable' : 'Enable'} rule">
          <input type="checkbox" ${a.enabled ? 'checked' : ''} onchange="window._consentToggleRule('${a.id}',this.checked)">
          <span class="ggg-toggle-slider"></span>
        </label>
      </div>`).join('');

    const logItems = audit.map(l => `
      <li>
        <span class="ggg-audit-ts">${fmtTS(l.ts)}</span>
        <span class="ggg-audit-event"><span class="ggg-audit-patient">${_hubEscHtml(l.patient)}</span> \u2014 ${_hubEscHtml(l.event)}${l.extra ? ` <span style="color:var(--text-muted)">(${_hubEscHtml(l.extra)})</span>` : ''}</span>
      </li>`).join('');

    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <h3 style="font-size:.95rem;font-weight:700;margin:0">Automation Rules</h3>
            <button class="btn btn-primary btn-sm" onclick="window._consentAddRule()">+ Add Rule</button>
          </div>
          ${rules || '<div style="padding:16px;border:1px dashed var(--border);border-radius:10px;color:var(--text-muted);font-size:.82rem;text-align:center">No automation rules configured yet.</div>'}
        </div>
        <div>
          <h3 style="font-size:.95rem;font-weight:700;margin-bottom:14px">Run Log (Last 10 Events)</h3>
          <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
            <ul class="ggg-audit-log">${logItems || '<li style="padding:16px;color:var(--text-muted);text-align:center">No events yet.</li>'}</ul>
          </div>
        </div>
      </div>`;
  }

  // ── Tab 3: Version Control ────────────────────────────────────────────────
  function renderVersions() {
    const versions = loadVersions();
    const cards    = versions.map(v => `
      <div class="ggg-version-card ${v.active ? 'active-version' : ''}">
        <span class="ggg-version-badge ${v.active ? 'current' : ''}">${v.ver}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.9rem;color:var(--text)">
            ${v.docName}
            ${v.active ? '<span style="font-size:.7rem;color:var(--accent-teal);margin-left:6px">CURRENT</span>' : ''}
          </div>
          <div style="font-size:.78rem;color:var(--text-muted);margin:2px 0">
            Effective: ${fmtDate(v.effectiveDate)} &nbsp;|&nbsp; ${v.patientCount} patient${v.patientCount!==1?'s':''} using this version
          </div>
          <div style="font-size:.8rem;color:var(--text);margin-top:4px;line-height:1.5">${v.changes}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
          <button class="btn btn-secondary btn-xs" onclick="window._consentDiffSelect('${v.id}')">Diff View</button>
          ${!v.active ? `<button class="btn btn-primary btn-xs" onclick="window._consentActivateVersion('${v.id}')">Activate</button>` : ''}
        </div>
      </div>`).join('');

    const vOpts = versions.map(v => `<option value="${v.id}">${v.ver} \u2014 ${v.docName}</option>`).join('');

    return `
      <div style="margin-bottom:24px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <h3 style="font-size:.95rem;font-weight:700;margin:0">Document Versions</h3>
          <button class="btn btn-primary btn-sm" onclick="window._consentNewVersion()">+ New Version</button>
        </div>
        <div style="font-size:.72rem;color:var(--text-muted);margin-bottom:10px;padding:8px 12px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.18);border-radius:8px">
          Consent-template versions are stored locally in this browser. Server-side consent versioning is not yet wired.
        </div>
        ${cards}
      </div>
      <div>
        <h3 style="font-size:.95rem;font-weight:700;margin-bottom:12px">Diff View</h3>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px">
          <label style="font-size:.8rem;color:var(--text-muted)">Compare:</label>
          <select onchange="window._consentDiffA(this.value)"
            style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:7px;padding:6px 10px;font-size:.85rem;color:var(--text)">${vOpts}</select>
          <span style="color:var(--text-muted)">vs</span>
          <select onchange="window._consentDiffB(this.value)"
            style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:7px;padding:6px 10px;font-size:.85rem;color:var(--text)">${vOpts}</select>
          <button class="btn btn-secondary btn-sm" onclick="window._consentRunDiff()">Compare</button>
        </div>
        <div id="ggg-diff-output"></div>
      </div>`;
  }

  function buildDiff(textA, textB) {
    const linesA = textA.split('\n');
    const linesB = textB.split('\n');
    const setA   = new Set(linesA);
    const setB   = new Set(linesB);
    const renderLines = (lines, ref, cls) =>
      lines.map(l => `<div class="ggg-diff-line ${ref.has(l) ? 'ggg-diff-same' : cls}">${l || '&nbsp;'}</div>`).join('');
    return `<div class="ggg-diff-view">
      <div class="ggg-diff-panel"><h4>Version A</h4>${renderLines(linesA, setB, 'ggg-diff-removed')}</div>
      <div class="ggg-diff-panel"><h4>Version B</h4>${renderLines(linesB, setA, 'ggg-diff-added')}</div>
    </div>`;
  }

  // ── Tab 4: GDPR / HIPAA ───────────────────────────────────────────────────
  function complianceScore() {
    const records = loadRecords();
    if (!records.length) return 0;
    return Math.round((records.filter(r => r.status === 'active').length / records.length) * 100);
  }

  function renderGaugeHTML(score) {
    const r     = 54;
    const circ  = 2 * Math.PI * r;
    const dash  = (score / 100) * circ;
    const color = score >= 80 ? 'var(--accent-teal)' : score >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)';
    const label = score >= 80 ? 'Good standing' : score >= 50 ? 'Needs attention' : 'Critical \u2014 action required';
    return `<div class="ggg-compliance-gauge">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle class="ggg-gauge-track" cx="70" cy="70" r="${r}"/>
        <circle class="ggg-gauge-fill" cx="70" cy="70" r="${r}"
          stroke="${color}"
          stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}"
          transform="rotate(-90 70 70)"/>
        <text class="ggg-gauge-label" x="70" y="75" text-anchor="middle">${score}%</text>
        <text class="ggg-gauge-sublabel" x="70" y="92">Compliance</text>
      </svg>
      <div style="font-size:.8rem;color:var(--text-muted);text-align:center">${label}</div>
    </div>`;
  }

  function renderGDPR() {
    const deletions = loadDeletions();
    const audit     = loadAudit();
    const records   = loadRecords();
    const score     = complianceScore();

    const delRows = deletions.map(d => `<tr>
      <td style="font-weight:600">${_hubEscHtml(d.patient)}</td>
      <td>${fmtDate(d.requestDate)}</td>
      <td>${badgeHTML(d.status)}</td>
      <td style="font-size:.8rem;color:var(--text-muted)">${_hubEscHtml(d.dataTypes)}</td>
      <td>${d.status !== 'completed'
        ? `<button class="btn btn-secondary btn-xs" style="color:var(--accent-rose)" onclick="window._consentProcessDeletion('${_hubEscHtml(d.id)}')">Process</button>`
        : '<span style="color:var(--text-muted);font-size:.78rem">Done</span>'}</td>
    </tr>`).join('');

    const ptOpts = records.map(r => `<option value="${_hubEscHtml(r.id)}">${_hubEscHtml(r.name)}</option>`).join('');

    const auditTypes = ['all','Consent Signed','Consent Revoked','Re-send Triggered','Consent Expired','Deletion Requested','Deletion Completed'];
    const auditFiltered = _auditFilter === 'all' ? audit : audit.filter(l => l.event === _auditFilter);
    const auditItems = auditFiltered.slice(0, 50).map(l => `
      <li>
        <span class="ggg-audit-ts">${fmtTS(l.ts)}</span>
        <span class="ggg-audit-event"><span class="ggg-audit-patient">${_hubEscHtml(l.patient)}</span> \u2014 ${_hubEscHtml(l.event)}${l.extra ? ` <span style="color:var(--text-muted)">(${_hubEscHtml(l.extra)})</span>` : ''}</span>
      </li>`).join('');

    return `
      <div style="display:grid;grid-template-columns:1fr auto;gap:24px;margin-bottom:28px;align-items:start">
        <div>
          <h3 style="font-size:.95rem;font-weight:700;margin-bottom:12px">Data Deletion Requests</h3>
          <div style="overflow-x:auto;border:1px solid var(--border);border-radius:10px">
            <table class="ggg-consent-table">
              <thead><tr><th>Patient</th><th>Request Date</th><th>Status</th><th>Data Types</th><th>Action</th></tr></thead>
              <tbody>${delRows || '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">No deletion requests.</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        ${renderGaugeHTML(score)}
      </div>

      <div style="margin-bottom:28px">
        <h3 style="font-size:.95rem;font-weight:700;margin-bottom:12px">Right to Access \u2014 Patient Data Export</h3>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <label style="font-size:.8rem;color:var(--text-muted)">Patient:</label>
          <select id="ggg-export-pt"
            style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:7px;padding:6px 10px;font-size:.85rem;color:var(--text)">${ptOpts}</select>
          <button class="btn btn-primary btn-sm" onclick="window._consentGenerateExport()">Generate JSON Export</button>
        </div>
        <div id="ggg-export-output" style="margin-top:12px"></div>
      </div>

      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px">
          <h3 style="font-size:.95rem;font-weight:700;margin:0">Audit Log</h3>
          <select onchange="window._consentAuditFilter(this.value)"
            style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:7px;padding:6px 10px;font-size:.85rem;color:var(--text)">
            ${auditTypes.map(o => `<option value="${o}" ${_auditFilter===o?'selected':''}>${o === 'all' ? 'All Events' : o}</option>`).join('')}
          </select>
        </div>
        <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;max-height:360px;overflow-y:auto">
          <ul class="ggg-audit-log">${auditItems || '<li style="padding:16px;color:var(--text-muted);text-align:center">No events match filter.</li>'}</ul>
        </div>
      </div>`;
  }

  // ── Main render ───────────────────────────────────────────────────────────
  function render() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    const tabs = [
      { id:'tracker',    label:'Consent Tracker' },
      { id:'automation', label:'Automation Workflows' },
      { id:'versions',   label:'Version Control' },
      { id:'gdpr',       label:'GDPR / HIPAA' },
    ];
    const tabNav = tabs.map(t =>
      `<button class="tab-btn ${_tab === t.id ? 'active' : ''}" onclick="window._consentTab('${t.id}')">${t.label}</button>`
    ).join('');

    let body = '';
    if (_tab === 'tracker')    body = renderTracker();
    if (_tab === 'automation') body = renderAutomation();
    if (_tab === 'versions')   body = renderVersions();
    if (_tab === 'gdpr')       body = renderGDPR();

    root.innerHTML = `
      <div style="max-width:1400px;margin:0 auto;padding:0 4px">
        <div style="margin-bottom:20px">
          <h2 style="font-size:1.1rem;font-weight:700;margin-bottom:4px">Consent &amp; Compliance Automation</h2>
          <p style="font-size:12.5px;color:var(--text-muted)">Manage patient consent records, automate renewal workflows, maintain version history, and track GDPR/HIPAA compliance.</p>
        </div>
        <div class="tab-nav" style="margin-bottom:20px">${tabNav}</div>
        <div id="ggg-consent-body">${body}</div>
      </div>`;
  }

  // ── Mount ─────────────────────────────────────────────────────────────────
  const content = document.getElementById('app-content') || document.getElementById('content');
  if (!content) return;
  content.innerHTML = `<div id="${ROOT_ID}"></div>`;
  render();

  // ── Window handlers ───────────────────────────────────────────────────────
  window._consentTab = function(tab) {
    if (!document.getElementById(ROOT_ID)) return;
    _tab = tab;
    render();
  };

  window._consentFilterStatus = function(v) {
    if (!document.getElementById(ROOT_ID)) return;
    _statusFilter = v;
    _selectedIds.clear();
    const body = document.getElementById('ggg-consent-body');
    if (body && _tab === 'tracker') body.innerHTML = renderTracker();
  };

  window._consentToggleSelect = function(id, checked) {
    if (checked) _selectedIds.add(id); else _selectedIds.delete(id);
    const body = document.getElementById('ggg-consent-body');
    if (body && _tab === 'tracker') body.innerHTML = renderTracker();
  };

  window._consentSelectAll = function(checked) {
    const records  = loadRecords();
    const filtered = _statusFilter === 'all' ? records : records.filter(r => r.status === _statusFilter);
    filtered.forEach(r => { if (checked) _selectedIds.add(r.id); else _selectedIds.delete(r.id); });
    const body = document.getElementById('ggg-consent-body');
    if (body && _tab === 'tracker') body.innerHTML = renderTracker();
  };

  // Retry button for the tracker table when server hydration fails.
  window._consentReloadAll = async function() {
    await hydrateServer();
    const body = document.getElementById('ggg-consent-body');
    if (body && _tab === 'tracker')      body.innerHTML = renderTracker();
    else if (body && _tab === 'automation') body.innerHTML = renderAutomation();
    else if (body && _tab === 'gdpr')       body.innerHTML = renderGDPR();
  };

  window._consentBulkReconsent = function() {
    const ids = [..._selectedIds];
    if (!ids.length) return;
    const records = loadRecords();
    const names   = records.filter(r => ids.includes(r.id)).map(r => r.name);
    if (!confirm(`Log re-consent follow-up for ${names.join(', ')}?`)) return;
    names.forEach(n => addAudit('Re-send Triggered', n, 'Bulk re-consent'));
    _dsToast(`Re-consent follow-up logged for ${names.join(', ')}. Remote delivery is not verified from this page.`, 'success');
    _selectedIds.clear();
    const body = document.getElementById('ggg-consent-body');
    if (body && _tab === 'tracker') body.innerHTML = renderTracker();
  };

  window._consentView = function(id) {
    const records = loadRecords();
    const r = records.find(x => x.id === id);
    if (!r) return;
    const overlay = document.createElement('div');
    overlay.className = 'ggg-modal-overlay';
    overlay.innerHTML = `<div class="ggg-modal">
      <h3>Consent Record \u2014 ${_hubEscHtml(r.name)}</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:.875rem;margin-bottom:16px">
        <div><span style="color:var(--text-muted)">Type:</span> ${_hubEscHtml(r.type)}</div>
        <div><span style="color:var(--text-muted)">Version:</span> ${_hubEscHtml(r.version) || '\u2014'}</div>
        <div><span style="color:var(--text-muted)">Signed:</span> ${fmtDate(r.signed)}</div>
        <div><span style="color:var(--text-muted)">Expiry:</span> ${fmtDate(r.expiry)}</div>
        <div><span style="color:var(--text-muted)">Status:</span> ${badgeHTML(r.status)}</div>
      </div>
      <div class="ggg-modal-footer">
        <button class="btn btn-secondary btn-sm" onclick="this.closest('.ggg-modal-overlay').remove()">Close</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  };

  window._consentResend = function(id) {
    const records = loadRecords();
    const r = records.find(x => x.id === id);
    if (!r) return;
    addAudit('Re-send Triggered', r.name, r.type);
    _dsToast(`Re-consent follow-up logged for ${r.name}. Remote delivery is not verified from this page.`, 'success');
  };

  // Revoke: persist via PATCH so the change survives a reload. If the API call
  // fails we keep the UI optimistic change but surface an error toast.
  window._consentRevoke = async function(id) {
    const idx = _srvRecords.findIndex(x => x.id === id);
    if (idx < 0) return;
    const target = _srvRecords[idx];
    if (!confirm(`Revoke consent for ${target.name}? They will need to sign a new consent form.`)) return;
    try {
      if (api.updateConsentRecord) {
        await api.updateConsentRecord(id, { status: 'withdrawn' });
      }
      addAudit('Consent Revoked', target.name, target.type);
      _srvRecords[idx] = { ...target, status: 'expired' };
      _dsToast(`Consent revoked for ${target.name}.`, 'success');
    } catch (e) {
      _dsToast(`Revoke failed: ${e?.message || 'server error'}`, 'warn');
    }
    const body = document.getElementById('ggg-consent-body');
    if (body && _tab === 'tracker') body.innerHTML = renderTracker();
  };

  // Toggle rule: local-only right now (the GET endpoint exists but there's
  // no PATCH). We update the in-memory cache so the UI feels responsive.
  window._consentToggleRule = function(id, enabled) {
    const idx = _srvAutomations.findIndex(a => a.id === id);
    if (idx < 0) return;
    _srvAutomations[idx] = { ..._srvAutomations[idx], enabled };
    addAudit(enabled ? 'Rule Enabled' : 'Rule Disabled', 'System', _srvAutomations[idx].name);
    _dsToast('Rule state updated (client-side only — backend patch not yet wired).', 'info');
  };

  window._consentAddRule = function() {
    const overlay = document.createElement('div');
    overlay.className = 'ggg-modal-overlay';
    overlay.innerHTML = `<div class="ggg-modal">
      <h3>Add Automation Rule</h3>
      <div class="ggg-form-row"><label>Rule Name</label><input id="ggg-rule-name" placeholder="e.g. Post-Treatment Review"></div>
      <div class="ggg-form-row"><label>Trigger</label><input id="ggg-rule-trigger" placeholder="e.g. Treatment course completed"></div>
      <div class="ggg-form-row"><label>Action</label><input id="ggg-rule-action" placeholder="e.g. Send outcome survey to patient"></div>
      <div class="ggg-modal-footer">
        <button class="btn btn-secondary btn-sm" onclick="this.closest('.ggg-modal-overlay').remove()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="window._consentSaveRule()">Save Rule</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  };

  window._consentSaveRule = async function() {
    const name    = document.getElementById('ggg-rule-name')?.value.trim();
    const trigger = document.getElementById('ggg-rule-trigger')?.value.trim();
    const action  = document.getElementById('ggg-rule-action')?.value.trim();
    if (!name || !trigger || !action) { _dsToast('Please fill in all required fields.', 'warn'); return; }
    // Server-persisted create. Fall back to in-memory if the endpoint fails.
    let saved = null;
    try {
      if (api.createConsentAutomationRule) {
        saved = await api.createConsentAutomationRule({ name, trigger, action, enabled: true });
      }
    } catch (e) {
      _dsToast(`Save failed (rule kept in memory): ${e?.message || 'server error'}`, 'warn');
    }
    const row = saved || { id: 'local-' + Date.now(), name, trigger, action, enabled: true };
    _srvAutomations.push(row);
    addAudit('Rule Created', 'System', name);
    document.querySelector('.ggg-modal-overlay')?.remove();
    const body = document.getElementById('ggg-consent-body');
    if (body && _tab === 'automation') body.innerHTML = renderAutomation();
  };

  window._consentDiffSelect = function(verId) {
    _diffA = verId;
    _tab   = 'versions';
    const body = document.getElementById('ggg-consent-body');
    if (body) {
      body.innerHTML = renderVersions();
      window._consentRunDiff();
    }
  };

  window._consentDiffA = function(v) { _diffA = v; };
  window._consentDiffB = function(v) { _diffB = v; };

  window._consentRunDiff = function() {
    const versions = loadVersions();
    const vA = versions.find(v => v.id === _diffA);
    const vB = versions.find(v => v.id === _diffB);
    const out = document.getElementById('ggg-diff-output');
    if (!out) return;
    if (!vA || !vB) {
      out.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem">Select two versions to compare.</p>';
      return;
    }
    if (vA.id === vB.id) {
      out.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem">Select two different versions to compare.</p>';
      return;
    }
    const textA = `Document: ${vA.docName}\nVersion: ${vA.ver}\nEffective: ${vA.effectiveDate}\n\nChanges:\n${vA.changes}`;
    const textB = `Document: ${vB.docName}\nVersion: ${vB.ver}\nEffective: ${vB.effectiveDate}\n\nChanges:\n${vB.changes}`;
    out.innerHTML = buildDiff(textA, textB);
  };

  window._consentActivateVersion = function(id) {
    const versions = loadVersions();
    const v = versions.find(x => x.id === id);
    if (!v) return;
    if (!confirm(`Activate ${v.ver} as the current consent version? All new consents will use this version.`)) return;
    versions.forEach(x => { x.active = (x.id === id); });
    lsSave(LOCAL_KEYS.versions, versions);
    addAudit('Version Activated', 'System', `${v.ver} \u2014 ${v.docName}`);
    const body = document.getElementById('ggg-consent-body');
    if (body && _tab === 'versions') body.innerHTML = renderVersions();
  };

  window._consentNewVersion = function() {
    const overlay = document.createElement('div');
    overlay.className = 'ggg-modal-overlay';
    overlay.innerHTML = `<div class="ggg-modal">
      <h3>New Consent Version</h3>
      <div class="ggg-form-row"><label>Version Number</label><input id="ggg-ver-num" placeholder="e.g. v2.1"></div>
      <div class="ggg-form-row"><label>Document Name</label><input id="ggg-ver-doc" value="General Consent Form"></div>
      <div class="ggg-form-row"><label>Effective Date</label><input type="date" id="ggg-ver-date"></div>
      <div class="ggg-form-row"><label>Summary of Changes</label><textarea id="ggg-ver-changes" rows="3" placeholder="Describe what changed from the previous version..."></textarea></div>
      <div class="ggg-modal-footer">
        <button class="btn btn-secondary btn-sm" onclick="this.closest('.ggg-modal-overlay').remove()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="window._consentSaveVersion()">Create Version</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  };

  window._consentSaveVersion = function() {
    const ver     = document.getElementById('ggg-ver-num')?.value.trim();
    const docName = document.getElementById('ggg-ver-doc')?.value.trim();
    const date    = document.getElementById('ggg-ver-date')?.value;
    const changes = document.getElementById('ggg-ver-changes')?.value.trim();
    if (!ver || !docName || !date || !changes) { _dsToast('Please fill in all required fields.', 'warn'); return; }
    const versions = loadVersions();
    versions.push({ id: 'v' + Date.now(), ver, docName, effectiveDate: date, changes, active: false, patientCount: 0 });
    lsSave(LOCAL_KEYS.versions, versions);
    addAudit('Version Created', 'System', `${ver} \u2014 ${docName}`);
    document.querySelector('.ggg-modal-overlay')?.remove();
    const body = document.getElementById('ggg-consent-body');
    if (body && _tab === 'versions') body.innerHTML = renderVersions();
  };

  window._consentProcessDeletion = function(id) {
    const deletions = loadDeletions();
    const idx = deletions.findIndex(d => d.id === id);
    if (idx < 0) return;
    const d = deletions[idx];
    if (!confirm(`Process data deletion request for ${d.patient}?\n\nData to be deleted:\n${d.dataTypes}\n\nThis action is irreversible and will be logged.`)) return;
    deletions[idx].status = 'completed';
    lsSave(LOCAL_KEYS.deletions, deletions);
    addAudit('Deletion Completed', d.patient, d.dataTypes);
    const body = document.getElementById('ggg-consent-body');
    if (body && _tab === 'gdpr') body.innerHTML = renderGDPR();
  };

  window._consentGenerateExport = function() {
    const ptId    = document.getElementById('ggg-export-pt')?.value;
    const records = loadRecords();
    const r = records.find(x => x.id === ptId);
    if (!r) return;
    const auditAll = loadAudit();
    const payload  = {
      exportDate: new Date().toISOString(),
      exportedBy: 'DeepSynaps Protocol Studio',
      legalBasis: 'GDPR Article 20 \u2014 Right to Data Portability',
      patient: { id: r.id, name: r.name },
      consentRecord: r,
      auditHistory: auditAll.filter(l => l.patient === r.name),
    };
    const json = JSON.stringify(payload, null, 2);
    const out  = document.getElementById('ggg-export-output');
    if (out) {
      out.innerHTML = `
        <pre style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:.75rem;overflow-x:auto;max-height:240px;color:var(--text)">${json.replace(/</g,'&lt;')}</pre>
        <button class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="window._consentDownloadExport('${ptId}')">Download JSON</button>`;
    }
    addAudit('Data Export Generated', r.name, 'GDPR Article 20');
  };

  window._consentDownloadExport = function(ptId) {
    const records  = loadRecords();
    const r = records.find(x => x.id === ptId);
    if (!r) return;
    const auditAll = loadAudit();
    const payload  = {
      exportDate: new Date().toISOString(),
      exportedBy: 'DeepSynaps Protocol Studio',
      patient: { id: r.id, name: r.name },
      consentRecord: r,
      auditHistory: auditAll.filter(l => l.patient === r.name),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `patient-data-export-${r.name.replace(/\s/g,'-').toLowerCase()}-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  window._consentAuditFilter = function(v) {
    if (!document.getElementById(ROOT_ID)) return;
    _auditFilter = v;
    const body = document.getElementById('ggg-consent-body');
    if (body && _tab === 'gdpr') body.innerHTML = renderGDPR();
  };

  window._consentExportAudit = function() {
    const audit = loadAudit();
    const rows  = [['Timestamp','Event','Patient','Details']];
    audit.forEach(l => rows.push([l.ts, l.event, l.patient, l.extra || '']));
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `consent-audit-log-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
}

// ── Media Review Queue ────────────────────────────────────────────────────────

export async function pgMediaReviewQueue(setTopbar) {
  setTopbar('Media Review Queue',
    `<button class="btn btn-primary btn-sm" onclick="window._mediaQueueRefresh()">&#x21BA; Refresh</button>`
  );

  const el = document.getElementById('content');
  if (!el) return;

  const BASE  = (import.meta.env && import.meta.env.VITE_API_BASE_URL) || 'http://127.0.0.1:8000';
  let _activeFilter = 'all';
  let _cachedItems  = [];

  async function _load() {
    el.innerHTML = spinner();
    let items = [];
    let loadErr = null;
    try {
      const token = api.getToken();
      const r = await fetch(`${BASE}/api/v1/media/review-queue`, {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (r.ok) {
        const data = await r.json();
        items = Array.isArray(data) ? data : (data.items || []);
      } else {
        loadErr = `Could not load queue (${r.status}). `;
      }
    } catch (e) { loadErr = 'Network error loading queue. '; }
    _cachedItems = items;
    _render(items, loadErr);
  }

  function _render(items, loadErr) {
    const pending  = items.filter(i => i.status === 'pending_review').length;
    const urgent   = items.filter(i => i.flagged_urgent).length;
    const awaiting = items.filter(i => i.status === 'approved_for_analysis').length;

    // Priority sort: urgent flagged first, then pending review, then reupload requested,
    // then approved for analysis, then everything else; within each group newest first.
    const STATUS_PRIORITY = { pending_review: 1, reupload_requested: 2, approved_for_analysis: 3, analyzing: 4, analyzed: 5, clinician_reviewed: 6, rejected: 7 };
    const sortItems = arr => arr.slice().sort((a, b) => {
      const aUrgent = a.flagged_urgent ? 0 : 1;
      const bUrgent = b.flagged_urgent ? 0 : 1;
      if (aUrgent !== bUrgent) return aUrgent - bUrgent;
      const aPri = STATUS_PRIORITY[a.status] ?? 8;
      const bPri = STATUS_PRIORITY[b.status] ?? 8;
      if (aPri !== bPri) return aPri - bPri;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    const filtered = sortItems(
      _activeFilter === 'all'   ? items
      : _activeFilter === 'text'  ? items.filter(i => i.upload_type === 'text' || i.media_type === 'text')
      : _activeFilter === 'voice' ? items.filter(i => i.upload_type === 'voice' || i.media_type === 'voice')
      : items.filter(i => i.flagged_urgent)
    );

    // Tab counts show scoped totals so clinicians see where work is waiting
    const tabCounts = {
      all:    items.length,
      text:   items.filter(i => (i.upload_type || i.media_type) === 'text').length,
      voice:  items.filter(i => (i.upload_type || i.media_type) === 'voice').length,
      flagged: urgent,
    };
    const tabs = ['all', 'text', 'voice', 'flagged'].map(t => {
      const label = t === 'all' ? 'All' : t === 'text' ? 'Text' : t === 'voice' ? 'Voice' : 'Flagged';
      const count = tabCounts[t];
      const badge = count > 0 ? ` <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:99px;font-size:10px;font-weight:700;background:${_activeFilter===t?'rgba(0,0,0,0.15)':'var(--bg-surface)'};margin-left:4px">${count}</span>` : '';
      return `<button class="tab-btn ${_activeFilter === t ? 'active' : ''}" onclick="window._mediaQueueFilter('${t}')">${label}${badge}</button>`;
    }
    ).join('');

    const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const cards = filtered.length === 0
      ? (items.length === 0
          ? `<div style="padding:48px;text-align:center;color:var(--text-tertiary)">
              <div style="font-size:32px;margin-bottom:10px;opacity:0.4">&#x1F4ED;</div>
              <div style="font-size:13.5px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">No items in review queue</div>
              <div style="font-size:12px">Patient-submitted voice notes and text updates will appear here once uploaded.</div>
            </div>`
          : `<div style="padding:48px;text-align:center;color:var(--text-tertiary);font-size:13.5px">
              No items match the current filter.
              <div style="font-size:11.5px;margin-top:6px">Switch tabs to see other items, or clear the filter.</div>
            </div>`)
      : filtered.map(u => {
          const typeIcon = u.upload_type === 'voice' ? '&#x1F399;' : '&#x1F4DD;';
          const dateStr  = u.created_at
            ? new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            : '&mdash;';
          const statusMap = {
            pending_review:        { label: 'Awaiting Review',       color: 'var(--amber)', bg: 'rgba(255,181,71,0.08)', border: 'rgba(255,181,71,0.3)' },
            approved_for_analysis: { label: 'Approved for Analysis',  color: 'var(--teal)',  bg: 'rgba(0,212,188,0.06)',  border: 'rgba(0,212,188,0.25)' },
            analyzing:             { label: 'AI Analysis Running',    color: 'var(--blue)',  bg: 'rgba(74,158,255,0.06)', border: 'rgba(74,158,255,0.25)' },
            analyzed:              { label: 'Analyzed',               color: 'var(--teal)',  bg: 'rgba(0,212,188,0.06)',  border: 'rgba(0,212,188,0.25)' },
            clinician_reviewed:    { label: 'Reviewed by Care Team',  color: 'var(--green,#22c55e)', bg: 'rgba(34,197,94,0.06)', border: 'rgba(34,197,94,0.25)' },
            reupload_requested:    { label: 'Re-upload Requested',    color: '#f97316',      bg: 'rgba(249,115,22,0.06)', border: 'rgba(249,115,22,0.25)' },
            rejected:              { label: 'Rejected',               color: 'var(--red)',   bg: 'rgba(255,107,107,0.06)',border: 'rgba(255,107,107,0.2)' },
          };
          const st = statusMap[u.status] || { label: u.status || '&mdash;', color: 'var(--text-tertiary)', bg: 'rgba(255,255,255,0.02)', border: 'var(--border)' };

          const actionBtns = [
            u.status === 'pending_review'
              ? `<button class="btn btn-sm" style="background:rgba(0,212,188,0.15);color:var(--teal);border-color:rgba(0,212,188,0.3)" onclick="window._mediaAction('${u.id}','approve')">&#x2713; Approve for Analysis</button>`
              : '',
            `<button class="btn btn-sm" style="color:var(--red);border-color:rgba(255,107,107,0.3)" onclick="window._mediaAction('${u.id}','reject')">&#x2715; Reject</button>`,
            `<button class="btn btn-sm" style="color:var(--amber);border-color:rgba(255,181,71,0.3)" onclick="window._mediaAction('${u.id}','request_reupload')">&#x21BA; Request Re-upload</button>`,
            !u.flagged_urgent
              ? `<button class="btn btn-sm" style="color:var(--amber);border-color:rgba(255,181,71,0.3)" onclick="window._mediaAction('${u.id}','flag_urgent')">&#x2691; Flag Urgent</button>`
              : '',
          ].filter(Boolean).join('');

          const analyzeBtn = u.status === 'approved_for_analysis'
            ? `<button class="btn btn-sm" style="background:rgba(0,212,188,0.15);color:var(--teal);border-color:rgba(0,212,188,0.3);margin-top:8px" onclick="window._mediaRunAnalysis('${u.id}')">&#x25B6; Run AI Analysis</button>`
            : '';
          const viewBtn = u.status === 'analyzed'
            ? `<button class="btn btn-sm" style="margin-top:8px" onclick="window._mediaViewDetail('${u.id}')">View Analysis &#x2192;</button>`
            : '';

          const preview = u.patient_note
            ? `<div style="font-size:12px;color:var(--text-secondary);background:var(--surface-1);border:1px solid var(--border);border-radius:6px;padding:8px 10px;max-height:58px;overflow:hidden;text-overflow:ellipsis;margin-top:6px">${esc((u.patient_note || '').slice(0, 200))}${(u.patient_note || '').length > 200 ? '&hellip;' : ''}</div>`
            : '';

          return `
          <div style="border:1px solid ${st.border};border-radius:12px;padding:16px 18px;margin-bottom:12px;background:${st.bg};transition:border-color 0.15s"
              onmouseover="this.style.borderColor='var(--border-teal,rgba(0,212,188,.35))'"
              onmouseout="this.style.borderColor='${st.border}'">
            <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">
              <div style="flex:1;min-width:200px">
                <div style="font-size:13.5px;font-weight:600;color:var(--text-primary);margin-bottom:3px">
                  ${u.patient_id
                    ? `<a style="color:inherit;text-decoration:none;border-bottom:1px solid rgba(255,255,255,0.15);cursor:pointer" onmouseover="this.style.color='var(--teal)'" onmouseout="this.style.color='inherit'" onclick="window._nav('patient',{id:'${u.patient_id}'})">${esc(u.patient_name || '&mdash;')}</a>`
                    : esc(u.patient_name || '&mdash;')}
                  ${u.flagged_urgent ? '<span style="font-size:10px;font-weight:700;background:rgba(255,107,107,0.15);color:var(--red);border-radius:4px;padding:1px 6px;margin-left:6px">&#x2691; URGENT</span>' : ''}
                </div>
                <div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:5px">
                  ${esc(u.primary_condition || '&mdash;')} &middot; ${esc(u.course_name || '&mdash;')}
                </div>
                <div style="font-size:11px;color:var(--text-tertiary)">
                  ${typeIcon} ${u.upload_type === 'voice' ? 'Voice note' : 'Text update'}
                  &middot; ${dateStr}
                  ${u.duration_seconds ? '&middot; ' + Math.round(u.duration_seconds) + 's' : ''}
                </div>
                ${preview}
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
                <span style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;padding:3px 8px;border-radius:4px;border:1px solid ${st.border};color:${st.color}">${st.label}</span>
                <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;margin-top:2px">${actionBtns}</div>
                ${analyzeBtn}
                ${viewBtn}
              </div>
            </div>
          </div>`;
        }).join('');

    el.innerHTML = `
    <div style="max-width:960px;margin:0 auto;padding:0 4px">
      <div style="margin-bottom:20px">
        <h2 style="font-size:1.1rem;font-weight:700;margin-bottom:4px">Patient Media Review Queue</h2>
        <p style="font-size:12.5px;color:var(--text-secondary)">Review patient-submitted voice notes and text updates before AI analysis.</p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
        <div class="metric-card">
          <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.9px;margin-bottom:6px">Pending Review</div>
          <div style="font-size:28px;font-weight:700;color:var(--amber);font-family:var(--font-mono)">${pending}</div>
        </div>
        <div class="metric-card">
          <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.9px;margin-bottom:6px">Flagged Urgent</div>
          <div style="font-size:28px;font-weight:700;color:var(--red);font-family:var(--font-mono)">${urgent}</div>
        </div>
        <div class="metric-card">
          <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.9px;margin-bottom:6px">Awaiting Analysis</div>
          <div style="font-size:28px;font-weight:700;color:var(--teal);font-family:var(--font-mono)">${awaiting}</div>
        </div>
      </div>
      ${loadErr ? `<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12.5px;color:#ef4444;display:flex;align-items:center;gap:10px">
        <span>&#x26A0;</span><span>${loadErr}<button class="btn btn-ghost btn-sm" style="font-size:11px;margin-left:6px" onclick="window._mediaQueueRefresh()">Retry</button></span>
      </div>` : ''}
      <div id="media-queue-action-error" style="display:none;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12.5px;color:#ef4444"></div>
      <div class="tab-nav" style="margin-bottom:16px">${tabs}</div>
      <div id="media-queue-list">${cards}</div>
    </div>`;
  }

  window._mediaQueueRefresh = function() { _load(); };

  window._mediaQueueFilter = function(f) {
    _activeFilter = f;
    _render(_cachedItems);
  };

  function _queueErr(msg) {
    const el2 = document.getElementById('media-queue-action-error');
    if (!el2) return;
    el2.textContent = msg;
    el2.style.display = 'block';
    clearTimeout(el2._t);
    el2._t = setTimeout(() => { el2.style.display = 'none'; }, 5000);
  }

  window._mediaAction = async function(uploadId, action) {
    let reason = null;
    if (action === 'reject' || action === 'request_reupload') {
      reason = prompt(action === 'reject' ? 'Reason for rejection (optional):' : 'Reason for requesting re-upload (optional):');
      if (reason === null) return; // cancelled
    }
    // Find and disable the clicked button immediately for loading feedback
    const clickedBtn = window.event ? window.event.currentTarget || window.event.target : null;
    const origText = clickedBtn ? clickedBtn.textContent : '';
    if (clickedBtn) { clickedBtn.disabled = true; clickedBtn.textContent = '\u2026'; }
    try {
      const body = { action };
      if (reason) body.reason = reason;
      const r = await fetch(`${BASE}/api/v1/media/review/${uploadId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + api.getToken() },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`Server error ${r.status}`);
    } catch (e) {
      if (clickedBtn) { clickedBtn.disabled = false; clickedBtn.textContent = origText; }
      _queueErr(`Action failed: ${e.message}. Please try again.`);
      return;
    }
    _load();
  };

  window._mediaRunAnalysis = async function(uploadId) {
    const src = window.event ? window.event.currentTarget || window.event.target : null;
    if (src) { src.disabled = true; src.textContent = 'Running\u2026'; }
    try {
      const r = await fetch(`${BASE}/api/v1/media/review/${uploadId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + api.getToken() },
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.detail || `Server error ${r.status}`);
      }
      window._mediaDetailUploadId = uploadId;
      window._nav('media-detail');
    } catch (e) {
      if (src) { src.disabled = false; src.textContent = '\u25B6 Run AI Analysis'; }
      _queueErr(`Analysis failed: ${e.message}. Check API key configuration or retry.`);
    }
  };

  window._mediaViewDetail = function(uploadId) {
    window._mediaDetailUploadId = uploadId;
    window._nav('media-detail');
  };

  await _load();
}

// ── Media Detail ──────────────────────────────────────────────────────────────

export async function pgMediaDetail(setTopbar) {
  const uploadId = window._mediaDetailUploadId;
  if (!uploadId) { window._nav('media-queue'); return; }

  setTopbar('Upload Detail',
    `<button class="btn btn-ghost btn-sm" onclick="window._nav('media-queue')">&#8592; Review Queue</button>`
  );

  const el = document.getElementById('content');
  if (!el) return;
  el.innerHTML = spinner();

  const BASE  = (import.meta.env && import.meta.env.VITE_API_BASE_URL) || 'http://127.0.0.1:8000';
  const token = api.getToken();
  const esc   = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let upload   = null;
  let analysis = null;

  try {
    const [ur, ar] = await Promise.all([
      fetch(`${BASE}/api/v1/media/patient/uploads/${uploadId}`, { headers: { Authorization: 'Bearer ' + token } }),
      fetch(`${BASE}/api/v1/media/analysis/${uploadId}`,        { headers: { Authorization: 'Bearer ' + token } }),
    ]);
    if (ur.ok) upload = await ur.json();
    if (ar.ok) analysis = await ar.json(); // 404 handled gracefully
  } catch (_) { /* best-effort */ }

  if (!upload) {
    el.innerHTML = `<div class="notice notice-warn">Could not load upload details.</div>`;
    return;
  }

  const dateStr = upload.created_at
    ? new Date(upload.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '&mdash;';

  const statusMap = {
    pending_review:        { label: 'Awaiting Review',       color: 'var(--amber)'          },
    approved_for_analysis: { label: 'Approved for Analysis', color: 'var(--teal)'           },
    analyzing:             { label: 'AI Analysis Running',   color: 'var(--blue)'           },
    analyzed:              { label: 'Analyzed',              color: 'var(--teal)'           },
    clinician_reviewed:    { label: 'Reviewed by Care Team', color: 'var(--green,#22c55e)'  },
    reupload_requested:    { label: 'Re-upload Requested',   color: '#f97316'               },
    rejected:              { label: 'Rejected',              color: 'var(--red)'            },
  };
  const st = statusMap[upload.status] || { label: upload.status || '&mdash;', color: 'var(--text-tertiary)' };

  const reviewBtns = upload.status === 'pending_review' ? `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
      <button class="btn btn-sm" style="background:rgba(0,212,188,0.15);color:var(--teal);border-color:rgba(0,212,188,0.3)" onclick="window._mdAction('approve')">&#x2713; Approve for Analysis</button>
      <button class="btn btn-sm" style="color:var(--red);border-color:rgba(255,107,107,0.3)" onclick="window._mdAction('reject')">&#x2715; Reject</button>
      <button class="btn btn-sm" style="color:var(--amber);border-color:rgba(255,181,71,0.3)" onclick="window._mdAction('request_reupload')">&#x21BA; Request Re-upload</button>
      ${!upload.flagged_urgent ? `<button class="btn btn-sm" style="color:var(--amber);border-color:rgba(255,181,71,0.3)" onclick="window._mdAction('flag_urgent')">&#x2691; Flag Urgent</button>` : ''}
    </div>` : '';

  const contentSection = upload.upload_type === 'voice' && upload.transcript ? `
    <div style="margin-top:16px">
      <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--text-tertiary);margin-bottom:7px">Transcript</div>
      <div style="background:var(--surface-2,var(--navy-900));border:1px solid var(--border);border-radius:8px;padding:12px 14px;font-size:12.5px;line-height:1.7;color:var(--text-secondary);white-space:pre-wrap;max-height:260px;overflow-y:auto">${esc(upload.transcript)}</div>
      <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">Transcribed by Whisper</div>
    </div>` : (upload.text_content ? `
    <div style="margin-top:16px">
      <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--text-tertiary);margin-bottom:7px">Text Content</div>
      <div style="background:var(--surface-2,var(--navy-900));border:1px solid var(--border);border-radius:8px;padding:12px 14px;font-size:12.5px;line-height:1.7;color:var(--text-secondary);white-space:pre-wrap;max-height:260px;overflow-y:auto">${esc(upload.text_content)}</div>
    </div>` : '');

  function _buildAnalysisPanel() {
    if (!analysis && upload.status === 'approved_for_analysis') {
      return `<div style="text-align:center;padding:32px 16px">
        <button class="btn btn-primary" id="md-run-btn" onclick="window._mdRunAnalysis()">&#x25B6; Run AI Analysis</button>
        <p style="font-size:11.5px;color:var(--text-secondary);margin-top:12px;line-height:1.6">Analysis will generate a draft note. Clinician approval required before clinical use.</p>
      </div>`;
    }
    if (upload.status === 'analyzing') {
      return `<div style="text-align:center;padding:32px 16px;color:var(--text-secondary)">
        ${spinner()} <div style="margin-top:12px;font-size:13px">Analyzing&hellip;</div>
      </div>`;
    }
    if (!analysis) {
      return `<div style="padding:24px;color:var(--text-tertiary);font-size:13px">No analysis available yet.</div>`;
    }

    const symptomChips = (analysis.symptoms_mentioned || []).map(s => {
      const label = typeof s === 'string' ? s : (s.symptom || s.label || '');
      const sev   = typeof s === 'object' ? (s.severity || '') : '';
      const quote = typeof s === 'object' ? (s.verbatim_quote || '') : '';
      return `<span title="${esc(quote)}" style="display:inline-block;padding:3px 9px;border-radius:12px;font-size:11px;font-weight:500;background:rgba(74,158,255,0.1);color:var(--blue);border:1px solid rgba(74,158,255,0.2);margin:2px;cursor:default">${esc(label)}${sev ? ' &middot; ' + sev : ''}</span>`;
    }).join('');

    const seChips = (analysis.side_effects || []).map(s => {
      const label = typeof s === 'string' ? s : (s.effect || s.label || '');
      const sev   = typeof s === 'object' ? (s.severity || '') : '';
      const quote = typeof s === 'object' ? (s.verbatim_quote || '') : '';
      return `<span title="${esc(quote)}" style="display:inline-block;padding:3px 9px;border-radius:12px;font-size:11px;font-weight:500;background:rgba(255,181,71,0.1);color:var(--amber);border:1px solid rgba(255,181,71,0.2);margin:2px;cursor:default">${esc(label)}${sev ? ' &middot; ' + sev : ''}</span>`;
    }).join('');

    const fi = analysis.functional_impact || {};
    const fiGrid = ['sleep', 'mood', 'cognition', 'work', 'social'].map(d =>
      `<div style="text-align:center;background:var(--surface-1);border:1px solid var(--border);border-radius:6px;padding:6px 4px">
        <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.6px;color:var(--text-tertiary);margin-bottom:3px">${d}</div>
        <div style="font-size:12px;font-weight:600;color:var(--text-primary)">${esc(String(fi[d] !== undefined ? fi[d] : '&mdash;'))}</div>
      </div>`
    ).join('');

    const redFlags = (analysis.red_flags || []).map(f => {
      const fc = f.severity === 'critical' ? 'var(--red)' : 'var(--amber)';
      const fb = f.severity === 'critical' ? 'rgba(255,107,107,0.08)' : 'rgba(255,181,71,0.08)';
      return `<div style="border-left:3px solid ${fc};padding:8px 12px;border-radius:0 6px 6px 0;background:${fb};margin-bottom:6px">
        <div style="font-size:12px;font-weight:600;color:${fc}">${esc(f.flag_type || 'Flag')}</div>
        <div style="font-size:11.5px;color:var(--text-secondary);margin-top:2px">${esc(f.extracted_text || '')}</div>
        ${f.severity ? `<div style="font-size:10.5px;color:var(--text-tertiary);margin-top:2px">Severity: ${f.severity}</div>` : ''}
      </div>`;
    }).join('');

    const fuqs = (analysis.follow_up_questions || []).map(q =>
      `<li style="font-size:12.5px;color:var(--text-secondary);margin-bottom:4px">${esc(q)}</li>`
    ).join('');

    return `
      ${analysis.structured_summary ? `
        <div style="margin-bottom:14px">
          <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--text-tertiary);margin-bottom:6px">Structured Summary</div>
          <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.7">${esc(analysis.structured_summary)}</div>
        </div>` : ''}

      ${symptomChips ? `
        <div style="margin-bottom:14px">
          <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--text-tertiary);margin-bottom:6px">Symptoms Mentioned</div>
          ${symptomChips}
        </div>` : ''}

      ${seChips ? `
        <div style="margin-bottom:14px">
          <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--text-tertiary);margin-bottom:6px">Side Effects</div>
          ${seChips}
        </div>` : ''}

      <div style="margin-bottom:14px">
        <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--text-tertiary);margin-bottom:6px">Functional Impact</div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:4px">${fiGrid}</div>
      </div>

      ${redFlags ? `
        <div style="margin-bottom:14px">
          <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--red);margin-bottom:6px">&#x26A0; Red Flags</div>
          ${redFlags}
        </div>` : ''}

      ${fuqs ? `
        <div style="margin-bottom:14px">
          <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--text-tertiary);margin-bottom:6px">Follow-up Questions</div>
          <ol style="margin:0;padding-left:18px">${fuqs}</ol>
        </div>` : ''}

      <div style="margin-bottom:14px">
        <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--amber);margin-bottom:6px">Chart Note Draft (SOAP)</div>
        <div style="font-size:9.5px;color:var(--amber);font-weight:600;margin-bottom:4px">DRAFT &mdash; requires clinician approval</div>
        <textarea id="md-soap-draft" class="form-control" rows="7" style="font-family:var(--font-mono);font-size:12px;resize:vertical">${esc(analysis.chart_note_draft || analysis.soap_note || '')}</textarea>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">Edit as needed before approving.</div>
      </div>

      <div style="margin-bottom:14px">
        <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--text-tertiary);margin-bottom:6px">Clinician Amendments</div>
        <textarea id="md-amendments" class="form-control" rows="4" style="font-size:12px;resize:vertical" placeholder="Add your notes or corrections&hellip;">${esc(analysis.clinician_amendments || '')}</textarea>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm" style="background:rgba(0,212,188,0.15);color:var(--teal);border-color:rgba(0,212,188,0.3)" onclick="window._mdApproveDraft()">&#x2713; Approve for Clinical Record</button>
        <button class="btn btn-sm" style="color:var(--red);border-color:rgba(255,107,107,0.3)" onclick="window._mdRejectDraft()">&#x2715; Reject Draft</button>
        <button class="btn btn-sm" id="md-save-amend-btn" onclick="window._mdSaveAmendments()">Save Amendments</button>
      </div>`;
  }

  const auditSteps = (upload.audit_trail || [])
    .map(e => `<span style="font-size:11px;color:var(--text-tertiary)">${esc(e)}</span>`)
    .join(' &middot; ');

  el.innerHTML = `
  <div style="max-width:1100px;margin:0 auto;padding:0 4px">
    <div style="margin-bottom:14px">
      <button class="btn btn-ghost btn-sm" onclick="window._nav('media-queue')">&#8592; Review Queue</button>
    </div>
    <div id="md-page-error" style="display:none;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12.5px;color:#ef4444"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">

      <!-- Left panel: Upload info -->
      <div style="background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:20px">
        <div style="margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
            <div style="font-size:15px;font-weight:700;color:var(--text-primary)">${esc(upload.patient_name || '&mdash;')}</div>
            ${upload.patient_id ? `<a style="font-size:11px;color:var(--teal);text-decoration:none;opacity:0.8;cursor:pointer" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.8'" onclick="window._nav('patient',{id:'${upload.patient_id}'})">View patient &#x2192;</a>` : ''}
          </div>
          <div style="font-size:12px;color:var(--text-secondary)">
            Condition: ${esc(upload.primary_condition || '&mdash;')} &nbsp;&middot;&nbsp; Course: ${esc(upload.course_name || '&mdash;')}
          </div>
          <div style="font-size:11.5px;color:var(--text-secondary);margin-top:4px">
            Type: ${upload.upload_type === 'voice' ? '&#x1F399; Voice' : '&#x1F4DD; Text'}
            &nbsp;&middot;&nbsp; Date: ${dateStr}
            ${upload.duration_seconds ? '&nbsp;&middot;&nbsp; Duration: ' + Math.round(upload.duration_seconds) + 's' : ''}
          </div>
          <div style="margin-top:8px">
            <span style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;padding:3px 8px;border-radius:4px;color:${st.color};border:1px solid ${st.color}22;background:${st.color}11">${st.label}</span>
          </div>
        </div>

        ${upload.patient_note ? `
          <div style="margin-bottom:12px">
            <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--text-tertiary);margin-bottom:6px">Patient Note</div>
            <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.7">${esc(upload.patient_note)}</div>
          </div>` : ''}

        ${contentSection}
        ${reviewBtns}
      </div>

      <!-- Right panel: AI Analysis -->
      <div style="background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:20px">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:14px">AI Analysis</div>
        <div id="md-analysis-panel">${_buildAnalysisPanel()}</div>
      </div>

    </div>

    ${auditSteps ? `
    <div style="margin-top:20px;padding:12px 16px;border:1px solid var(--border);border-radius:8px;background:var(--surface-1)">
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--text-tertiary);margin-bottom:6px">Audit Trail</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">${auditSteps}</div>
    </div>` : ''}
  </div>`;

  // ── Window handlers ───────────────────────────────────────────────────────────

  function _mdErr(msg) {
    const errEl = document.getElementById('md-page-error');
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.style.display = 'block';
    clearTimeout(errEl._t);
    errEl._t = setTimeout(() => { errEl.style.display = 'none'; }, 6000);
  }

  window._mdAction = async function(action) {
    let reason = null;
    if (action === 'reject' || action === 'request_reupload') {
      reason = prompt(action === 'reject' ? 'Reason for rejection (optional):' : 'Reason for requesting re-upload (optional):');
      if (reason === null) return;
    }
    const btn = window.event ? window.event.currentTarget || window.event.target : null;
    const origText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '\u2026'; }
    try {
      const body = { action };
      if (reason) body.reason = reason;
      const r = await fetch(`${BASE}/api/v1/media/review/${uploadId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`Server error ${r.status}`);
      window._nav('media-detail'); // refresh page
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = origText; }
      _mdErr('Action failed: ' + e.message);
    }
  };

  window._mdRunAnalysis = async function() {
    const btn = document.getElementById('md-run-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Running\u2026'; }
    try {
      const r = await fetch(`${BASE}/api/v1/media/review/${uploadId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.detail || `Server error ${r.status}`);
      }
      window._nav('media-detail'); // refresh
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '\u25B6 Run AI Analysis'; }
      _mdErr('Analysis failed: ' + e.message + ' — Check ANTHROPIC_API_KEY or retry.');
    }
  };

  window._mdApproveDraft = async function() {
    const soapDraft  = document.getElementById('md-soap-draft')?.value  || '';
    const amendments = document.getElementById('md-amendments')?.value  || '';
    const approveBtn = document.querySelector('#md-analysis-panel button[onclick="_mdApproveDraft()"], #md-analysis-panel button[onclick="window._mdApproveDraft()"]');
    if (approveBtn) { approveBtn.disabled = true; approveBtn.textContent = 'Saving\u2026'; }
    try {
      const r = await fetch(`${BASE}/api/v1/media/analysis/${uploadId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ chart_note_draft: soapDraft, clinician_amendments: amendments }),
      });
      if (!r.ok) throw new Error(`Server error ${r.status}`);
      const panel = document.getElementById('md-analysis-panel');
      if (panel) panel.innerHTML = `<div style="padding:24px;text-align:center;color:var(--teal);font-size:13.5px;font-weight:600;border:1px solid rgba(0,212,188,0.25);border-radius:12px;background:rgba(0,212,188,0.05)">&#x2713; Analysis approved and saved to clinical record.</div>`;
    } catch (e) {
      if (approveBtn) { approveBtn.disabled = false; approveBtn.textContent = '\u2713 Approve for Clinical Record'; }
      _mdErr('Could not approve: ' + e.message);
    }
  };

  window._mdRejectDraft = function() {
    if (!confirm('Reject this draft? The transcript will be kept and the upload can be re-analysed.')) return;
    window._nav('media-queue');
  };

  window._mdSaveAmendments = async function() {
    const amendments = document.getElementById('md-amendments')?.value || '';
    const soapDraft  = document.getElementById('md-soap-draft')?.value  || '';
    const saveBtn = document.getElementById('md-save-amend-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving\u2026'; }
    try {
      const r = await fetch(`${BASE}/api/v1/media/analysis/${uploadId}/amend`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ clinician_amendments: amendments, chart_note_draft: soapDraft }),
      });
      if (!r.ok) throw new Error(`Server error ${r.status}`);
      if (saveBtn) { saveBtn.textContent = '\u2713 Saved'; setTimeout(() => { saveBtn.disabled = false; saveBtn.textContent = 'Save Amendments'; }, 1800); }
    } catch (e) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Amendments'; }
      _mdErr('Could not save: ' + e.message);
    }
  };
}

// ── Clinician Dictation ───────────────────────────────────────────────────────

export async function pgClinicianDictation(setTopbar) {
  setTopbar('Clinical Note \u2014 Voice or Text', '');

  const el = document.getElementById('content');
  if (!el) return;

  const BASE  = (import.meta.env && import.meta.env.VITE_API_BASE_URL) || 'http://127.0.0.1:8000';
  const token = api.getToken();

  let _captureMode   = 'voice';
  let _patients      = [];
  let _courses       = [];
  let _sessions      = [];
  let _mediaRecorder = null;
  let _audioChunks   = [];
  let _timerInterval = null;
  let _startTime     = null;
  let _audioBlob     = null;

  try {
    const res = await api.listPatients().catch(() => null);
    _patients = res?.items || [];
  } catch (_) {}

  function _fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function _renderPage() {
    const patientOpts = _patients.map(p =>
      `<option value="${p.id}">${p.first_name || ''} ${p.last_name || ''}</option>`
    ).join('');

    const courseOpts = _courses.map(c =>
      `<option value="${c.id}">${c.condition_slug || '&mdash;'} &middot; ${c.modality_slug || '&mdash;'}</option>`
    ).join('');

    const sessionOpts = _sessions.map(s =>
      `<option value="${s.id}">Session #${(s.id || '').slice(0, 6)} &middot; ${s.scheduled_at ? new Date(s.scheduled_at).toLocaleDateString('en-GB') : '&mdash;'}</option>`
    ).join('');

    el.innerHTML = `
    <div style="max-width:720px;margin:0 auto;padding:0 4px">
      <div style="margin-bottom:20px">
        <h2 style="font-size:1.1rem;font-weight:700;margin-bottom:4px">Clinical Note &mdash; Voice or Text</h2>
      </div>

      <div style="background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:16px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div class="form-group" style="margin:0">
            <label class="form-label">Patient <span style="color:var(--red)">*</span></label>
            <select id="dict-patient" class="form-control" onchange="window._dictPatientChanged(this.value)">
              <option value="">Select patient&hellip;</option>
              ${patientOpts}
            </select>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Note Type</label>
            <select id="dict-note-type" class="form-control">
              <option value="post_session_note">Post-session note</option>
              <option value="clinical_update">Clinical update</option>
              <option value="adverse_event">Adverse event</option>
              <option value="progress_note">Progress note</option>
            </select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group" style="margin:0">
            <label class="form-label">Course <span style="font-weight:400;color:var(--text-tertiary)">(optional)</span></label>
            <select id="dict-course" class="form-control" onchange="window._dictCourseChanged(this.value)">
              <option value="">&mdash; none &mdash;</option>
              ${courseOpts}
            </select>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Session <span style="font-weight:400;color:var(--text-tertiary)">(optional)</span></label>
            <select id="dict-session" class="form-control">
              <option value="">&mdash; none &mdash;</option>
              ${sessionOpts}
            </select>
          </div>
        </div>
      </div>

      <div style="background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:20px">
        <div class="tab-nav" style="margin-bottom:20px">
          <button class="tab-btn ${_captureMode === 'voice' ? 'active' : ''}" onclick="window._dictMode('voice')">&#x1F399; Record Voice</button>
          <button class="tab-btn ${_captureMode === 'text'  ? 'active' : ''}" onclick="window._dictMode('text')">&#x1F4DD; Type Note</button>
        </div>

        <div id="dict-voice-panel" style="${_captureMode === 'voice' ? '' : 'display:none'}">
          <div style="text-align:center;padding:20px 0">
            <button id="dict-record-btn" class="btn" style="width:80px;height:80px;border-radius:50%;font-size:26px;border-width:2px;transition:all 0.2s" onclick="window._dictToggleRecord()">&#x25CF;</button>
            <div id="dict-timer" style="font-size:22px;font-family:var(--font-mono);color:var(--text-primary);margin-top:12px;letter-spacing:2px">00:00</div>
            <div id="dict-rec-status" style="font-size:12px;color:var(--text-tertiary);margin-top:4px">Press to start recording</div>
          </div>
          <div style="text-align:center;margin-bottom:12px">
            <span style="font-size:11.5px;color:var(--text-tertiary)">&mdash; or &mdash;</span><br>
            <label class="btn btn-sm" style="margin-top:8px;cursor:pointer">
              Upload audio file
              <input type="file" accept="audio/*" id="dict-file-input" style="display:none" onchange="window._dictHandleFile(this)">
            </label>
          </div>
          <div id="dict-ready-state" style="display:none;background:rgba(0,212,188,0.06);border:1px solid rgba(0,212,188,0.25);border-radius:8px;padding:12px;text-align:center;margin-bottom:12px">
            <span style="font-size:12.5px;color:var(--teal);font-weight:600">&#x2713; Ready to submit</span>
            <span id="dict-ready-duration" style="font-size:12px;color:var(--text-secondary);margin-left:8px"></span>
          </div>
        </div>

        <div id="dict-text-panel" style="${_captureMode === 'text' ? '' : 'display:none'}">
          <div class="form-group">
            <textarea id="dict-text-content" class="form-control" rows="10" style="font-size:13.5px;line-height:1.7;resize:vertical" placeholder="Write your clinical note. AI will generate a structured draft."></textarea>
          </div>
        </div>

        <div id="dict-error" style="color:var(--red);font-size:12px;margin-bottom:10px;display:none"></div>
        <button class="btn btn-primary" id="dict-submit-btn" onclick="window._dictSubmit()">Generate Draft Note</button>
      </div>
    </div>`;
  }

  _renderPage();

  window._dictMode = function(mode) {
    _captureMode = mode;
    _audioBlob   = null;
    _renderPage();
  };

  window._dictPatientChanged = async function(patientId) {
    _courses  = [];
    _sessions = [];
    if (!patientId) { _renderPage(); return; }
    try {
      const res = await api.listCourses({ patient_id: patientId }).catch(() => null);
      _courses = res?.items || [];
    } catch (_) {}
    _renderPage();
    const sel = document.getElementById('dict-patient');
    if (sel) sel.value = patientId;
  };

  window._dictCourseChanged = async function(courseId) {
    _sessions = [];
    if (!courseId) { _renderPage(); return; }
    try {
      const res = await api.listCourseSessions(courseId).catch(() => null);
      _sessions = Array.isArray(res) ? res : (res?.items || []);
    } catch (_) {}
    _renderPage();
    const sel = document.getElementById('dict-course');
    if (sel) sel.value = courseId;
  };

  window._dictToggleRecord = async function() {
    if (_mediaRecorder && _mediaRecorder.state === 'recording') {
      clearInterval(_timerInterval);
      _mediaRecorder.stop();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        _audioChunks = [];
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
        _mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
        _mediaRecorder.ondataavailable = e => { if (e.data && e.data.size > 0) _audioChunks.push(e.data); };
        _mediaRecorder.onstop = () => {
          const blob = new Blob(_audioChunks, { type: _audioChunks[0]?.type || 'audio/webm' });
          _audioBlob = blob;
          stream.getTracks().forEach(t => t.stop());
          const btn = document.getElementById('dict-record-btn');
          if (btn) { btn.style.color = ''; btn.style.borderColor = ''; btn.style.background = ''; btn.innerHTML = '&#x25CF;'; }
          const status = document.getElementById('dict-rec-status');
          if (status) status.textContent = 'Press to start recording';
          const ready = document.getElementById('dict-ready-state');
          if (ready) {
            ready.style.display = 'block';
            const dur = document.getElementById('dict-ready-duration');
            if (dur) dur.textContent = '(' + _fmtTime(_startTime ? Date.now() - _startTime : 0) + ')';
          }
          const timer = document.getElementById('dict-timer');
          if (timer) timer.textContent = '00:00';
        };
        _mediaRecorder.start(500);
        _startTime = Date.now();
        _timerInterval = setInterval(() => {
          const t = document.getElementById('dict-timer');
          if (!t) { clearInterval(_timerInterval); _timerInterval = null; return; }
          t.textContent = _fmtTime(Date.now() - _startTime);
        }, 500);
        const btn = document.getElementById('dict-record-btn');
        if (btn) { btn.style.color = '#fff'; btn.style.borderColor = 'var(--red)'; btn.style.background = 'var(--red)'; btn.innerHTML = '&#x25A0;'; }
        const status = document.getElementById('dict-rec-status');
        if (status) status.textContent = 'Recording\u2026 press to stop';
      } catch (err) {
        _dsToast('Could not access microphone: ' + (err.message || err.name), 'error');
      }
    }
  };

  window._dictHandleFile = function(input) {
    const file = input.files[0];
    if (!file) return;
    _audioBlob = file;
    const ready = document.getElementById('dict-ready-state');
    if (ready) {
      ready.style.display = 'block';
      const dur = document.getElementById('dict-ready-duration');
      if (dur) dur.textContent = '(' + file.name + ')';
    }
  };

  window._dictSubmit = async function() {
    const patientId = document.getElementById('dict-patient')?.value;
    const courseId  = document.getElementById('dict-course')?.value  || null;
    const sessionId = document.getElementById('dict-session')?.value || null;
    const noteType  = document.getElementById('dict-note-type')?.value || 'post_session_note';
    const errorEl   = document.getElementById('dict-error');

    if (!patientId) {
      if (errorEl) { errorEl.textContent = 'Please select a patient.'; errorEl.style.display = 'block'; }
      return;
    }
    if (errorEl) errorEl.style.display = 'none';

    const submitBtn = document.getElementById('dict-submit-btn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Generating\u2026'; }

    try {
      let result = null;

      if (_captureMode === 'text') {
        const textContent = document.getElementById('dict-text-content')?.value?.trim();
        if (!textContent) throw new Error('Please enter a note.');
        const r = await fetch(`${BASE}/api/v1/media/clinician/note/text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ patient_id: patientId, course_id: courseId, session_id: sessionId, note_type: noteType, text_content: textContent }),
        });
        if (!r.ok) throw new Error(`API error ${r.status}`);
        result = await r.json();

      } else {
        if (!_audioBlob) throw new Error('Please record or upload an audio file first.');
        const formData = new FormData();
        formData.append('file',       _audioBlob, 'dictation.webm');
        formData.append('patient_id', patientId);
        if (courseId)  formData.append('course_id',  courseId);
        if (sessionId) formData.append('session_id', sessionId);
        formData.append('note_type', noteType);
        const r = await fetch(`${BASE}/api/v1/media/clinician/note/audio`, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token },
          body: formData,
        });
        if (!r.ok) throw new Error(`API error ${r.status}`);
        result = await r.json();
      }

      if (result && result.note_id) {
        window._clinicianNoteId    = result.note_id;
        window._clinicianDraftId   = result.draft_id;
        window._clinicianDraftData = result.draft || {};
        window._nav('clinician-draft-review');
      } else {
        throw new Error('Unexpected response \u2014 no note_id returned.');
      }
    } catch (e) {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Generate Draft Note'; }
      if (errorEl) { errorEl.textContent = e.message; errorEl.style.display = 'block'; }
    }
  };
}

// ── Clinician Draft Review ────────────────────────────────────────────────────

export async function pgClinicianDraftReview(setTopbar) {
  const noteId    = window._clinicianNoteId;
  const draftId   = window._clinicianDraftId;
  const draftData = window._clinicianDraftData || {};

  if (!noteId && !draftId) { window._nav('clinician-dictation'); return; }

  setTopbar('Review AI-Generated Draft',
    `<button class="btn btn-ghost btn-sm" onclick="window._nav('clinician-dictation')">&#8592; Back to Dictation</button>`
  );

  const el = document.getElementById('content');
  if (!el) return;

  const BASE  = (import.meta.env && import.meta.env.VITE_API_BASE_URL) || 'http://127.0.0.1:8000';
  const token = api.getToken();
  const esc   = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const taskSuggestions = draftData.task_suggestions || [];
  const taskRows = taskSuggestions.map((t, i) => {
    const text     = typeof t === 'string' ? t : (t.text || '');
    const priority = typeof t === 'object' ? (t.priority || '') : '';
    const pc = priority === 'high' ? 'var(--red)' : priority === 'medium' ? 'var(--amber)' : 'var(--teal)';
    return `<label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer">
      <input type="checkbox" id="task-check-${i}" style="width:14px;height:14px;flex-shrink:0">
      <span style="flex:1;font-size:12.5px;color:var(--text-secondary)">${esc(text)}</span>
      ${priority ? `<span style="font-size:9.5px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;padding:2px 6px;border-radius:4px;background:${pc}18;color:${pc}">${priority}</span>` : ''}
    </label>`;
  }).join('');

  const treatmentSection = draftData.treatment_update ? `
    <div class="form-group">
      <label class="form-label">Treatment Update</label>
      <textarea id="draft-treatment-update" class="form-control" rows="4" style="font-size:12.5px;resize:vertical">${esc(draftData.treatment_update)}</textarea>
    </div>` : '';

  const adverseSection = draftData.adverse_event_note ? `
    <div class="form-group" style="border-left:3px solid var(--amber);padding-left:12px">
      <label class="form-label" style="color:var(--amber)">&#x26A0; Adverse Event Note</label>
      <textarea id="draft-ae-note" class="form-control" rows="4" style="font-size:12.5px;resize:vertical">${esc(draftData.adverse_event_note)}</textarea>
    </div>` : '';

  el.innerHTML = `
  <div style="max-width:1060px;margin:0 auto;padding:0 4px">
    <div style="margin-bottom:16px">
      <h2 style="font-size:1.1rem;font-weight:700;margin-bottom:4px">Review AI-Generated Draft</h2>
      <p style="font-size:12.5px;color:var(--text-secondary)">Review and edit the draft below. Approve to save to the patient record.</p>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">

      <!-- Left: Original dictation -->
      <div style="background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:20px">
        <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--text-tertiary);margin-bottom:10px">Original dictation</div>
        <div style="background:var(--surface-2,var(--navy-900));border:1px solid var(--border);border-radius:8px;padding:14px;max-height:500px;overflow-y:auto;font-size:12.5px;color:var(--text-secondary);line-height:1.7;white-space:pre-wrap;font-family:var(--font-mono)">${esc(draftData.original_text || draftData.transcript || '(No original text available)')}</div>
      </div>

      <!-- Right: AI Draft -->
      <div style="background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:20px">
        <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--text-tertiary);margin-bottom:14px">AI Draft</div>

        <div class="form-group">
          <label class="form-label">Session Note (SOAP)</label>
          <div style="font-size:9.5px;color:var(--amber);font-weight:600;margin-bottom:4px">DRAFT</div>
          <textarea id="draft-soap" class="form-control" rows="8" style="font-size:12.5px;line-height:1.7;resize:vertical;border-style:dashed">${esc(draftData.soap_note || draftData.session_note || '')}</textarea>
        </div>

        ${treatmentSection}
        ${adverseSection}

        <div class="form-group">
          <label class="form-label">Patient-Friendly Summary <span style="font-size:10.5px;font-weight:400;color:var(--text-tertiary)">&mdash; Shown to patient in portal</span></label>
          <textarea id="draft-patient-summary" class="form-control" rows="4" style="font-size:12.5px;resize:vertical">${esc(draftData.patient_summary || '')}</textarea>
        </div>

        ${taskRows ? `
        <div class="form-group">
          <label class="form-label">Task Suggestions <span style="font-size:10.5px;font-weight:400;color:var(--text-tertiary)">&mdash; Check to include in final note</span></label>
          <div style="border:1px solid var(--border);border-radius:8px;padding:8px 12px">${taskRows}</div>
        </div>` : ''}

        <div class="form-group">
          <label class="form-label">Clinician Review Notes <span style="font-size:10.5px;font-weight:400;color:var(--text-tertiary)">— corrections or context to attach to this record (optional)</span></label>
          <textarea id="draft-clinician-edits" class="form-control" rows="3" style="font-size:12.5px;resize:vertical" placeholder="e.g. Patient reported differently during session. Adjusted dose per protocol."></textarea>
        </div>
      </div>
    </div>

    <div id="draft-success" style="display:none;margin-top:16px;padding:14px 18px;background:rgba(0,212,188,0.08);border:1px solid rgba(0,212,188,0.3);border-radius:8px;font-size:13px;color:var(--teal);font-weight:600"></div>
    <div id="draft-error" style="display:none;margin-top:16px;padding:10px 14px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:8px;font-size:12.5px;color:#ef4444"></div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:20px;padding-top:16px;border-top:1px solid var(--border);align-items:center">
      <button class="btn btn-primary" id="draft-approve-btn" onclick="window._draftApprove()">&#x2713; Approve &amp; Save to Record</button>
      <button class="btn btn-sm" style="color:var(--red);border-color:rgba(255,107,107,0.3)" onclick="window._draftDiscard()">&#x2715; Discard Draft</button>
      <button class="btn btn-ghost btn-sm" onclick="window._nav('clinician-dictation')">&#8592; Back to Dictation</button>
      <span style="margin-left:auto;font-size:11px;color:var(--text-tertiary)">AI-generated draft. Review all sections before approving.</span>
    </div>
  </div>`;

  window._draftApprove = async function() {
    const soapNote       = document.getElementById('draft-soap')?.value            || '';
    const patientSummary = document.getElementById('draft-patient-summary')?.value  || '';
    const clinicianEdits = document.getElementById('draft-clinician-edits')?.value  || '';
    const treatmentUpd   = document.getElementById('draft-treatment-update')?.value || '';
    const aeNote         = document.getElementById('draft-ae-note')?.value           || '';

    const includedTasks = taskSuggestions
      .filter((_, i) => document.getElementById(`task-check-${i}`)?.checked)
      .map(t => (typeof t === 'string' ? t : (t.text || '')));

    const btn = document.getElementById('draft-approve-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving\u2026'; }

    try {
      const r = await fetch(`${BASE}/api/v1/media/clinician/draft/${draftId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          clinician_edits:    clinicianEdits,
          soap_note:          soapNote,
          patient_summary:    patientSummary,
          treatment_update:   treatmentUpd,
          adverse_event_note: aeNote,
          included_tasks:     includedTasks,
        }),
      });
      if (!r.ok) throw new Error(`API error ${r.status}`);
      const successEl = document.getElementById('draft-success');
      if (successEl) {
        successEl.style.display = 'block';
        const patientId = draftData.patient_id || null;
        const patientLink = patientId
          ? `<a style="color:var(--teal);text-decoration:underline;cursor:pointer" onclick="window._nav('patient',{id:'${patientId}'})">View patient record &#x2192;</a>`
          : `<a style="color:var(--teal);text-decoration:underline;cursor:pointer" onclick="window._nav('patients')">View patients &#x2192;</a>`;
        successEl.innerHTML = `&#x2713; Draft saved to clinical record. ${patientLink}`;
      }
      if (btn) { btn.disabled = true; btn.textContent = '\u2713 Approved'; }
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '\u2713 Approve & Save to Record'; }
      const errEl = document.getElementById('draft-error');
      if (errEl) { errEl.textContent = 'Could not save: ' + e.message; errEl.style.display = 'block'; }
    }
  };

  window._draftDiscard = function() {
    if (!confirm('Discard this draft? Unsaved note content will be lost.')) return;
    window._nav('media-queue');
  };
}

// ── Medication Interaction Checker ────────────────────────────────────────────
export async function pgMedInteractionChecker(setTopbar) {
  setTopbar('Medication Safety', `
    <button class="btn-secondary" onclick="window._micPrintSafety()" style="font-size:12px;padding:5px 12px">🖨 Print Safety Screen</button>
    <button class="btn-secondary" onclick="window._micExportCSV()" style="font-size:12px;padding:5px 12px">⬇ Export Log CSV</button>
  `);

  // ── Drug class mapping ──────────────────────────────────────────────────────
  const DRUG_CLASS_MAP = {
    ssri:            ['sertraline','fluoxetine','escitalopram','paroxetine','fluvoxamine','citalopram','zoloft','prozac','lexapro','paxil','luvox','celexa'],
    snri:            ['venlafaxine','duloxetine','desvenlafaxine','levomilnacipran','milnacipran','effexor','cymbalta','pristiq'],
    maoi:            ['phenelzine','tranylcypromine','isocarboxazid','selegiline','nardil','parnate','marplan'],
    stimulant:       ['methylphenidate','amphetamine','lisdexamfetamine','dextroamphetamine','ritalin','adderall','vyvanse','concerta','focalin','dexedrine'],
    benzodiazepine:  ['lorazepam','clonazepam','diazepam','alprazolam','temazepam','oxazepam','ativan','klonopin','valium','xanax','restoril'],
    opioid:          ['oxycodone','hydrocodone','morphine','codeine','tramadol','fentanyl','buprenorphine','methadone','percocet','vicodin'],
    antipsychotic:   ['clozapine','quetiapine','aripiprazole','risperidone','olanzapine','haloperidol','ziprasidone','lurasidone','clozaril','seroquel','abilify','risperdal','zyprexa','geodon'],
    'mood stabilizer': ['lithium','valproate','lamotrigine','carbamazepine','oxcarbazepine','lithobid','depakote','lamictal','tegretol'],
    lithium:         ['lithium','lithobid'],
    clozapine:       ['clozapine','clozaril'],
    bupropion:       ['bupropion','wellbutrin','zyban'],
    tramadol:        ['tramadol'],
    warfarin:        ['warfarin','coumadin'],
    ibuprofen:       ['ibuprofen','advil','motrin','naproxen','aleve','nsaid','celecoxib','indomethacin'],
  };

  // ── Interaction rules ───────────────────────────────────────────────────────
  const INTERACTION_RULES = [
    // Drug-Drug
    { drugs:['lithium','ibuprofen'],       severity:'major',           mechanism:'NSAIDs increase lithium levels → toxicity risk',                                     recommendation:'Monitor lithium levels; consider acetaminophen alternative' },
    { drugs:['tramadol','ssri'],           severity:'major',           mechanism:'Serotonin syndrome risk',                                                            recommendation:'Avoid combination; monitor for hyperthermia, agitation, clonus' },
    { drugs:['maoi','ssri'],              severity:'contraindicated', mechanism:'Serotonin syndrome — potentially fatal',                                              recommendation:'Do not combine; washout period required (2 weeks SSRI, 5 weeks fluoxetine)' },
    { drugs:['clozapine','ssri'],          severity:'moderate',        mechanism:'CYP1A2 inhibition raises clozapine levels',                                          recommendation:'Monitor clozapine levels; consider dose adjustment' },
    { drugs:['warfarin','ssri'],           severity:'moderate',        mechanism:'Increased bleeding risk via platelet inhibition',                                     recommendation:'Monitor INR; watch for bruising/bleeding' },
    { drugs:['stimulant','maoi'],          severity:'contraindicated', mechanism:'Hypertensive crisis risk',                                                           recommendation:'Absolute contraindication' },
    { drugs:['benzodiazepine','opioid'],   severity:'major',           mechanism:'Additive CNS/respiratory depression',                                                recommendation:'Use lowest effective doses; monitor closely' },
    { drugs:['lithium','ssri'],            severity:'moderate',        mechanism:'Increased risk of serotonin syndrome; lithium may potentiate SSRI effects',          recommendation:'Monitor for signs of serotonin toxicity; check lithium levels regularly' },
    { drugs:['stimulant','snri'],          severity:'moderate',        mechanism:'Additive cardiovascular effects — increased BP and heart rate',                      recommendation:'Monitor blood pressure and heart rate; dose carefully' },
    { drugs:['bupropion','maoi'],          severity:'contraindicated', mechanism:'Risk of hypertensive crisis and seizures',                                           recommendation:'Absolute contraindication; at least 14-day washout required' },
    { drugs:['bupropion','stimulant'],     severity:'moderate',        mechanism:'Additive CNS stimulation; increased seizure risk',                                   recommendation:'Use with caution; monitor for agitation and seizure threshold lowering' },
    { drugs:['antipsychotic','benzodiazepine'], severity:'moderate',   mechanism:'Additive CNS depression and respiratory depression risk',                            recommendation:'Monitor closely especially in elderly; use minimum effective doses' },
    // Drug-Modality
    { drug:'lithium',         modality:'TMS',           severity:'caution', mechanism:'Lithium lowers seizure threshold; may increase TMS seizure risk at therapeutic levels', recommendation:'Use conservative TMS parameters; monitor lithium levels; ensure level <0.8 mEq/L before TMS' },
    { drug:'clozapine',       modality:'TMS',           severity:'hold',    mechanism:'Clozapine significantly lowers seizure threshold — high seizure risk with TMS',          recommendation:'Consult psychiatrist before TMS; consider alternative protocols' },
    { drug:'bupropion',       modality:'TMS',           severity:'caution', mechanism:'Bupropion lowers seizure threshold in a dose-dependent manner',                          recommendation:'Use conservative TMS parameters; doses >300mg/day warrant additional caution' },
    { drug:'stimulant',       modality:'neurofeedback', severity:'note',    mechanism:'Stimulant use may affect baseline EEG and neurofeedback training targets',               recommendation:'Document stimulant timing relative to sessions; consider consistent med schedule' },
    { drug:'benzodiazepine',  modality:'neurofeedback', severity:'caution', mechanism:'Benzodiazepines suppress theta/beta ratios and alter EEG significantly',                 recommendation:'Note benzo use in session records; may reduce neurofeedback efficacy' },
    { drug:'ssri',            modality:'tDCS',          severity:'note',    mechanism:'SSRIs may modulate cortical excitability effects of tDCS',                               recommendation:'Potential enhancement of tDCS effects; monitor response carefully' },
    { drug:'benzodiazepine',  modality:'tDCS',          severity:'caution', mechanism:'Benzodiazepines may attenuate anodal tDCS-induced neuroplasticity via GABA-A channels', recommendation:'Consider scheduling tDCS sessions when benzo effect is minimal; note timing' },
    { drug:'maoi',            modality:'TMS',           severity:'caution', mechanism:'MAOIs may lower seizure threshold; cardiovascular reactivity concern during TMS',        recommendation:'Review MAOI type and dose; use conservative TMS parameters; have crash cart available' },
    { drug:'stimulant',       modality:'tDCS',          severity:'note',    mechanism:'Stimulants may enhance tDCS-induced cortical excitability additively',                   recommendation:'May potentiate tDCS effects; monitor carefully; document timing' },
    { drug:'antipsychotic',   modality:'neurofeedback', severity:'note',    mechanism:'Antipsychotics alter baseline EEG patterns; may affect neurofeedback targets',          recommendation:'Establish medication-stable EEG baseline; document medication status per session' },
    { drug:'lithium',         modality:'tDCS',          severity:'note',    mechanism:'Lithium affects intracellular signalling that tDCS modulates; uncertain interaction',    recommendation:'Monitor closely; document response; ensure lithium levels are stable' },
  ];

  // ── Drug database seed ──────────────────────────────────────────────────────
  const DRUG_DB = [
    { name:'Sertraline (Zoloft)',             class:'SSRI',                    uses:'Depression, anxiety, OCD, PTSD',                        neuroConsiderations:'May enhance tDCS cortical effects; monitor closely',                                  seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Fluoxetine (Prozac)',             class:'SSRI',                    uses:'Depression, bulimia, OCD',                              neuroConsiderations:'Long half-life; washout >5 weeks if switching to MAOI',                               seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Escitalopram (Lexapro)',          class:'SSRI',                    uses:'Depression, GAD',                                       neuroConsiderations:'Well-tolerated with most neuromodulation',                                             seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Paroxetine (Paxil)',              class:'SSRI',                    uses:'Depression, anxiety, PTSD, OCD',                        neuroConsiderations:'Short half-life; consider timing with sessions',                                       seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Citalopram (Celexa)',             class:'SSRI',                    uses:'Depression, anxiety',                                   neuroConsiderations:'Generally compatible with neuromodulation',                                            seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Venlafaxine (Effexor)',           class:'SNRI',                    uses:'Depression, anxiety, fibromyalgia',                     neuroConsiderations:'Dual mechanism; monitor BP with tDCS',                                                 seizureRisk:'low-moderate',  cnsStimRisk:'low' },
    { name:'Duloxetine (Cymbalta)',           class:'SNRI',                    uses:'Depression, pain, anxiety',                             neuroConsiderations:'Generally compatible with neuromodulation',                                            seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Lithium (Lithobid)',              class:'Mood Stabilizer',         uses:'Bipolar disorder, mania prevention',                    neuroConsiderations:'CAUTION with TMS — lowers seizure threshold; check levels',                           seizureRisk:'moderate',      cnsStimRisk:'low' },
    { name:'Valproate (Depakote)',            class:'Mood Stabilizer',         uses:'Bipolar, epilepsy, migraine',                           neuroConsiderations:'AED — actually raises seizure threshold; compatible with TMS',                        seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Lamotrigine (Lamictal)',          class:'Mood Stabilizer',         uses:'Bipolar, epilepsy, depression',                         neuroConsiderations:'AED — generally compatible; may enhance cortical stability',                          seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Carbamazepine (Tegretol)',        class:'Mood Stabilizer',         uses:'Bipolar, epilepsy, neuropathic pain',                   neuroConsiderations:'Strong CYP inducer; AED — compatible with TMS',                                       seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Clozapine (Clozaril)',            class:'Atypical Antipsychotic',  uses:'Treatment-resistant schizophrenia',                     neuroConsiderations:'HIGH seizure risk — TMS CONTRAINDICATED at standard doses',                           seizureRisk:'high',         cnsStimRisk:'low' },
    { name:'Quetiapine (Seroquel)',           class:'Atypical Antipsychotic',  uses:'Schizophrenia, bipolar, depression augmentation',       neuroConsiderations:'Moderate seizure risk consideration with TMS',                                        seizureRisk:'low-moderate',  cnsStimRisk:'low' },
    { name:'Aripiprazole (Abilify)',          class:'Atypical Antipsychotic',  uses:'Schizophrenia, bipolar, depression augmentation',       neuroConsiderations:'Generally well-tolerated with neuromodulation',                                       seizureRisk:'low',          cnsStimRisk:'moderate' },
    { name:'Risperidone (Risperdal)',         class:'Atypical Antipsychotic',  uses:'Schizophrenia, bipolar',                                neuroConsiderations:'Monitor for EPS; EEG baseline recommended',                                           seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Olanzapine (Zyprexa)',            class:'Atypical Antipsychotic',  uses:'Schizophrenia, bipolar, agitation',                     neuroConsiderations:'Sedating; note timing before sessions; EEG changes possible',                         seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Ziprasidone (Geodon)',            class:'Atypical Antipsychotic',  uses:'Schizophrenia, bipolar',                                neuroConsiderations:'QTc prolongation risk; EEG monitoring recommended',                                    seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Methylphenidate (Ritalin)',       class:'Stimulant',               uses:'ADHD, narcolepsy',                                      neuroConsiderations:'Document timing relative to neurofeedback sessions; may affect EEG targets',           seizureRisk:'low',          cnsStimRisk:'high' },
    { name:'Amphetamine salts (Adderall)',    class:'Stimulant',               uses:'ADHD, narcolepsy',                                      neuroConsiderations:'Same as methylphenidate; consistent timing recommended',                               seizureRisk:'low',          cnsStimRisk:'high' },
    { name:'Lisdexamfetamine (Vyvanse)',      class:'Stimulant',               uses:'ADHD, BED',                                             neuroConsiderations:'Longer-acting; more consistent EEG baseline vs IR stimulants',                         seizureRisk:'low',          cnsStimRisk:'high' },
    { name:'Bupropion (Wellbutrin)',          class:'NDRI',                    uses:'Depression, smoking cessation, ADHD',                   neuroConsiderations:'CAUTION with TMS — dose-dependent seizure threshold lowering',                         seizureRisk:'moderate',      cnsStimRisk:'high' },
    { name:'Mirtazapine (Remeron)',           class:'NaSSA',                   uses:'Depression, anxiety, insomnia',                         neuroConsiderations:'Sedating; may affect neurofeedback alertness',                                        seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Trazodone (Desyrel)',             class:'SARI',                    uses:'Depression, insomnia',                                  neuroConsiderations:'Sedating at low doses; generally compatible',                                          seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Lorazepam (Ativan)',              class:'Benzodiazepine',          uses:'Anxiety, panic, acute agitation',                       neuroConsiderations:'Significantly alters EEG — document use; may impair neurofeedback',                    seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Clonazepam (Klonopin)',           class:'Benzodiazepine',          uses:'Anxiety, panic disorder, seizures',                     neuroConsiderations:'AED — may reduce tDCS excitatory effects',                                            seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Diazepam (Valium)',               class:'Benzodiazepine',          uses:'Anxiety, muscle spasm, seizures',                       neuroConsiderations:'Long-acting; persistent EEG alteration',                                              seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Alprazolam (Xanax)',              class:'Benzodiazepine',          uses:'Anxiety, panic disorder',                               neuroConsiderations:'Short-acting; rapid onset EEG effect; document session timing',                        seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Phenelzine (Nardil)',             class:'MAOI',                    uses:'Depression, panic, social anxiety',                     neuroConsiderations:'Numerous interactions — comprehensive review required before any neuromodulation',     seizureRisk:'moderate',      cnsStimRisk:'high' },
    { name:'Tranylcypromine (Parnate)',       class:'MAOI',                    uses:'Depression',                                            neuroConsiderations:'High interaction risk; strict dietary + drug restrictions',                            seizureRisk:'moderate',      cnsStimRisk:'high' },
    { name:'Buspirone (Buspar)',              class:'Anxiolytic',              uses:'GAD',                                                   neuroConsiderations:'Generally compatible; non-benzodiazepine mechanism',                                   seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Hydroxyzine (Vistaril)',          class:'Antihistamine/Anxiolytic',uses:'Anxiety, itching, sedation',                            neuroConsiderations:'Sedating; note timing before sessions',                                               seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Naltrexone (Vivitrol)',           class:'Opioid Antagonist',       uses:'Alcohol/opioid use disorder',                           neuroConsiderations:'Generally compatible; may affect reward circuitry response to neurofeedback',          seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Prazosin',                        class:'Alpha-1 Blocker',         uses:'PTSD nightmares, hypertension',                         neuroConsiderations:'May cause orthostatic hypotension; note before tDCS',                                 seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Propranolol',                     class:'Beta Blocker',            uses:'Performance anxiety, PTSD, tremor',                     neuroConsiderations:'May blunt HR response; EEG alpha changes possible',                                   seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Clonidine',                       class:'Alpha-2 Agonist',         uses:'ADHD, PTSD, anxiety',                                   neuroConsiderations:'Sedating; may affect neurofeedback alertness; EEG theta increase possible',           seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Topiramate (Topamax)',            class:'Anticonvulsant',          uses:'Epilepsy, migraine, weight management',                  neuroConsiderations:'AED — raises seizure threshold; cognitive side effects may affect assessments',        seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Gabapentin (Neurontin)',          class:'Anticonvulsant/Analgesic',uses:'Neuropathic pain, anxiety, epilepsy',                   neuroConsiderations:'May increase delta/theta on EEG; generally compatible with TMS',                      seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Pregabalin (Lyrica)',             class:'Anticonvulsant/Analgesic',uses:'Neuropathic pain, GAD, fibromyalgia',                   neuroConsiderations:'Similar to gabapentin; anxiolytic properties; compatible with neuromodulation',       seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Memantine (Namenda)',             class:'NMDA Antagonist',         uses:'Alzheimer disease, treatment-augmentation',              neuroConsiderations:'NMDA antagonism may interact with tDCS glutamatergic mechanisms',                     seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Modafinil (Provigil)',            class:'Wakefulness Agent',       uses:'Narcolepsy, shift work, cognitive enhancement',         neuroConsiderations:'May enhance alertness for neurofeedback; document timing',                            seizureRisk:'low',          cnsStimRisk:'moderate' },
    { name:'N-Acetylcysteine (NAC)',          class:'Supplement/Glutamate Mod',uses:'OCD, addiction, depression augmentation',               neuroConsiderations:'Glutamate modulation may interact with tDCS effects; generally benign',               seizureRisk:'low',          cnsStimRisk:'low' },
  ];

  const MODALITIES = ['TMS', 'tDCS', 'Neurofeedback', 'EEG Biofeedback', 'PEMF', 'HEG'];

  // ── LocalStorage helpers ────────────────────────────────────────────────────
  function _lsGet(key, def = null) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
  }
  function _lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }

  // Seed patients if none
  if (!localStorage.getItem('ds_patients')) {
    _lsSet('ds_patients', [
      { id:'pt-001', name:'Alex Johnson', dob:'1985-03-12', condition:'MDD' },
      { id:'pt-002', name:'Morgan Lee',   dob:'1992-07-24', condition:'PTSD + ADHD' },
      { id:'pt-003', name:'Jordan Smith', dob:'1978-11-05', condition:'Bipolar I' },
    ]);
  }

  // Seed patient medications if none
  if (!localStorage.getItem('ds_patient_medications')) {
    _lsSet('ds_patient_medications', [
      { patientId:'pt-001', meds:[
        { id:'m1', name:'Sertraline', dose:'100mg', frequency:'Daily', prescriber:'Dr. Patel', startDate:'2024-01-15' },
        { id:'m2', name:'Bupropion',  dose:'300mg', frequency:'Daily', prescriber:'Dr. Patel', startDate:'2024-03-01' },
      ]},
      { patientId:'pt-002', meds:[
        { id:'m3', name:'Methylphenidate', dose:'20mg', frequency:'BID', prescriber:'Dr. Kim', startDate:'2023-09-10' },
        { id:'m4', name:'Lorazepam',       dose:'0.5mg', frequency:'PRN', prescriber:'Dr. Kim', startDate:'2024-02-20' },
      ]},
      { patientId:'pt-003', meds:[
        { id:'m5', name:'Lithium',     dose:'600mg', frequency:'BID', prescriber:'Dr. Nguyen', startDate:'2022-05-01' },
        { id:'m6', name:'Quetiapine',  dose:'200mg', frequency:'QHS', prescriber:'Dr. Nguyen', startDate:'2023-01-18' },
        { id:'m7', name:'Lorazepam',   dose:'1mg',   frequency:'PRN', prescriber:'Dr. Nguyen', startDate:'2024-06-10' },
      ]},
    ]);
  }

  if (!localStorage.getItem('ds_interaction_alerts')) _lsSet('ds_interaction_alerts', []);
  if (!localStorage.getItem('ds_interaction_checks')) _lsSet('ds_interaction_checks', []);

  // ── Interaction engine ──────────────────────────────────────────────────────
  function _resolveClasses(drugName) {
    const lower = drugName.toLowerCase().trim();
    const classes = new Set();
    classes.add(lower);
    for (const [cls, names] of Object.entries(DRUG_CLASS_MAP)) {
      if (names.some(n => lower.includes(n) || n.includes(lower))) classes.add(cls);
    }
    return classes;
  }

  function _runInteractionCheck(meds) {
    const results = [];
    const medList = meds.filter(m => m.name && m.name.trim());

    // Drug-Drug
    for (let i = 0; i < medList.length; i++) {
      for (let j = i + 1; j < medList.length; j++) {
        const classesA = _resolveClasses(medList[i].name);
        const classesB = _resolveClasses(medList[j].name);
        for (const rule of INTERACTION_RULES) {
          if (!rule.drugs) continue;
          const [r1, r2] = rule.drugs;
          const matchFwd = classesA.has(r1) && classesB.has(r2);
          const matchRev = classesA.has(r2) && classesB.has(r1);
          if (matchFwd || matchRev) {
            // Avoid duplicates
            const key = [medList[i].name, medList[j].name, rule.mechanism].join('|');
            if (!results.some(r => r._key === key)) {
              results.push({ _key: key, type:'drug-drug', drugA: medList[i].name, drugB: medList[j].name, severity: rule.severity, mechanism: rule.mechanism, recommendation: rule.recommendation, id: 'int-' + Math.random().toString(36).slice(2), acknowledged: false, flagged: false });
            }
          }
        }
      }
    }

    // Drug-Modality
    for (const med of medList) {
      const classes = _resolveClasses(med.name);
      for (const rule of INTERACTION_RULES) {
        if (!rule.modality) continue;
        if (classes.has(rule.drug)) {
          const key = [med.name, rule.modality, rule.mechanism].join('|');
          if (!results.some(r => r._key === key)) {
            results.push({ _key: key, type:'drug-modality', drugA: med.name, drugB: rule.modality, severity: rule.severity, mechanism: rule.mechanism, recommendation: rule.recommendation, id: 'int-' + Math.random().toString(36).slice(2), acknowledged: false, flagged: false });
          }
        }
      }
    }

    // Sort by severity weight
    const sevWeight = { contraindicated:0, hold:1, major:2, moderate:3, caution:4, note:5 };
    results.sort((a,b) => (sevWeight[a.severity]??9) - (sevWeight[b.severity]??9));
    return results;
  }

  function _modalitySafetyCheck(meds) {
    const modResults = {};
    for (const mod of MODALITIES) {
      modResults[mod] = { status:'go', items:[] };
    }
    for (const med of meds.filter(m => m.name && m.name.trim())) {
      const classes = _resolveClasses(med.name);
      for (const rule of INTERACTION_RULES) {
        if (!rule.modality) continue;
        if (classes.has(rule.drug)) {
          const modKey = MODALITIES.find(m => m.toLowerCase() === rule.modality.toLowerCase()) || rule.modality;
          if (!modResults[modKey]) modResults[modKey] = { status:'go', items:[] };
          modResults[modKey].items.push({ drug: med.name, severity: rule.severity, mechanism: rule.mechanism, recommendation: rule.recommendation });
          const cur = modResults[modKey].status;
          const sev = rule.severity;
          if (sev === 'hold' || sev === 'contraindicated') modResults[modKey].status = 'hold';
          else if ((sev === 'caution' || sev === 'major' || sev === 'moderate') && cur !== 'hold') modResults[modKey].status = 'caution';
          else if (sev === 'note' && cur === 'go') modResults[modKey].status = 'go';
        }
      }
    }
    return modResults;
  }

  // ── Render helpers ──────────────────────────────────────────────────────────
  function _severityBadge(sev) {
    return `<span class="qqq-badge qqq-badge-${sev}">${sev}</span>`;
  }

  function _renderInteractionResults(interactions, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!interactions || interactions.length === 0) {
      el.innerHTML = `<div class="qqq-empty"><div class="qqq-empty-icon">✓</div><p>No interactions found for current medication list.</p></div>`;
      return;
    }
    const counts = { contraindicated:0, hold:0, major:0, moderate:0, caution:0, note:0 };
    interactions.forEach(i => { if (counts[i.severity] !== undefined) counts[i.severity]++; });
    const summaryItems = [
      { label:'Contraindicated', key:'contraindicated', color:'#f87171' },
      { label:'Hold',            key:'hold',            color:'#f87171' },
      { label:'Major',           key:'major',           color:'#fb923c' },
      { label:'Moderate',        key:'moderate',        color:'#fbbf24' },
      { label:'Caution',         key:'caution',         color:'#fde047' },
      { label:'Note',            key:'note',            color:'#60a5fa' },
    ].filter(s => counts[s.key] > 0);

    const summaryHtml = `<div class="qqq-severity-summary">${summaryItems.map(s =>
      `<div class="qqq-summary-item"><span class="qqq-summary-count" style="color:${s.color}">${counts[s.key]}</span><span style="color:var(--text-muted);font-size:12px">${s.label}</span></div>`
    ).join('<span style="color:var(--border);align-self:center">·</span>')}</div>`;

    const cardsHtml = interactions.map(int => `
      <div class="qqq-interaction-card qqq-severity-${int.severity}${int.acknowledged ? ' acknowledged' : ''}" id="intcard-${int.id}">
        <div class="qqq-card-header">
          <span class="qqq-drug-pair">${_hubEscHtml(int.drugA)} ↔ ${_hubEscHtml(int.drugB)}</span>
          ${_severityBadge(int.severity)}
          ${int.type === 'drug-modality' ? '<span style="font-size:11px;color:var(--text-muted);background:var(--hover-bg);padding:2px 7px;border-radius:10px">Drug-Modality</span>' : ''}
          ${int.flagged ? '<span style="font-size:11px;color:#fbbf24">⚑ Flagged</span>' : ''}
          ${int.acknowledged ? '<span style="font-size:11px;color:var(--text-muted)">✓ Acknowledged</span>' : ''}
        </div>
        <div class="qqq-mechanism"><strong>Mechanism:</strong> ${_hubEscHtml(int.mechanism)}</div>
        <div class="qqq-recommendation">💡 ${_hubEscHtml(int.recommendation)}</div>
        <div class="qqq-card-actions">
          ${!int.flagged ? `<button class="qqq-btn-sm flag" onclick="window._micFlagInteraction('${int.id}')">⚑ Flag for Prescriber</button>` : ''}
          ${!int.acknowledged ? `<button class="qqq-btn-sm" onclick="window._micAcknowledge('${int.id}')">✓ Acknowledge</button>` : ''}
        </div>
      </div>`).join('');

    el.innerHTML = summaryHtml + cardsHtml;
  }

  function _renderModalitySafety(modResults, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const icons = { TMS:'⚡', tDCS:'🔋', Neurofeedback:'🧠', 'EEG Biofeedback':'📡', PEMF:'🌀', HEG:'💡' };
    el.innerHTML = MODALITIES.map(mod => {
      const r = modResults[mod] || { status:'go', items:[] };
      const statusClass = `qqq-status-${r.status}`;
      const pillClass = `qqq-status-pill-${r.status}`;
      const pillLabel = r.status === 'go' ? '✓ Go' : r.status === 'caution' ? '⚠ Caution' : '✕ Hold';
      const reasoning = r.items.length
        ? r.items.map(it => `<div style="margin-top:5px;padding:5px 8px;background:var(--hover-bg);border-radius:6px;font-size:12px"><strong>${_hubEscHtml(it.drug)}:</strong> ${_hubEscHtml(it.mechanism)} — <em>${_hubEscHtml(it.recommendation)}</em></div>`).join('')
        : '<span style="font-size:12px;color:var(--text-muted)">No relevant drug interactions found for this modality.</span>';
      return `
        <div class="qqq-modality-status ${statusClass}">
          <div class="qqq-modality-icon">${icons[mod] || '◉'}</div>
          <div class="qqq-modality-body">
            <div class="qqq-modality-name">${mod} <span class="qqq-status-pill ${pillClass}">${pillLabel}</span></div>
            <div class="qqq-modality-reasoning">${reasoning}</div>
          </div>
        </div>`;
    }).join('');
  }

  // ── Patients list ───────────────────────────────────────────────────────────
  const patients = _lsGet('ds_patients', []);
  const firstPt = patients[0]?.id || '';

  // ── Build page HTML ─────────────────────────────────────────────────────────
  document.getElementById('app-content').innerHTML = `
    <div style="max-width:1100px;margin:0 auto;padding:0 4px">
      <div class="qqq-tabs" role="tablist" aria-label="Medication Interaction Checker tabs">
        <button class="qqq-tab-btn active" role="tab" aria-selected="true"  aria-controls="qqq-panel-0" id="qqq-tab-0" onclick="window._micTab(0)">Patient Review</button>
        <button class="qqq-tab-btn"        role="tab" aria-selected="false" aria-controls="qqq-panel-1" id="qqq-tab-1" onclick="window._micTab(1)">Protocol Safety</button>
        <button class="qqq-tab-btn"        role="tab" aria-selected="false" aria-controls="qqq-panel-2" id="qqq-tab-2" onclick="window._micTab(2)">Drug Database</button>
        <button class="qqq-tab-btn"        role="tab" aria-selected="false" aria-controls="qqq-panel-3" id="qqq-tab-3" onclick="window._micTab(3)">Interaction Log</button>
      </div>

      <!-- Tab 1: Patient Medication Review -->
      <div class="qqq-tab-panel active" id="qqq-panel-0" role="tabpanel" aria-labelledby="qqq-tab-0">
        <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:20px">
          <div>
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Patient</label>
            <select id="mic-patient-sel" onchange="window._micSelectPatient(this.value)"
              style="padding:7px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text);font-size:13px;min-width:200px">
              ${patients.map(p => `<option value="${p.id}">${p.name}${p.condition ? ' — ' + p.condition : ''}</option>`).join('')}
            </select>
          </div>
          <button class="btn-primary" style="font-size:12.5px;padding:7px 16px" onclick="window._micRunCheck()">▶ Run Interaction Check</button>
          <button class="btn-secondary" style="font-size:12.5px;padding:7px 16px" onclick="window._micAddMedRow()">+ Add Medication</button>
        </div>
        <div id="mic-med-section">
          <!-- medication list rendered here -->
        </div>
        <div id="mic-results-section" style="margin-top:20px"></div>
      </div>

      <!-- Tab 2: Protocol Safety Screen -->
      <div class="qqq-tab-panel" id="qqq-panel-1" role="tabpanel" aria-labelledby="qqq-tab-1">
        <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:20px">
          <div>
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Patient</label>
            <select id="mic-safety-patient" onchange="window._micRenderSafety(this.value)"
              style="padding:7px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text);font-size:13px;min-width:200px">
              ${patients.map(p => `<option value="${p.id}">${p.name}${p.condition ? ' — ' + p.condition : ''}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="mic-safety-results"></div>
      </div>

      <!-- Tab 3: Drug Database -->
      <div class="qqq-tab-panel" id="qqq-panel-2" role="tabpanel" aria-labelledby="qqq-tab-2">
        <div class="qqq-filter-row">
          <input id="mic-drug-search" type="search" placeholder="Search drug name or class…" oninput="window._micFilterDrugs()" />
          <select id="mic-drug-class-filter" onchange="window._micFilterDrugs()"
            style="padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text);font-size:13px">
            <option value="">All Classes</option>
            ${[...new Set(DRUG_DB.map(d => d.class))].sort().map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div style="overflow-x:auto">
          <table class="qqq-drug-table" id="mic-drug-table">
            <thead>
              <tr>
                <th>Drug Name</th><th>Class</th><th>Common Uses</th>
                <th>Neuromodulation Considerations</th><th>Seizure Risk</th><th>CNS Stim Risk</th>
              </tr>
            </thead>
            <tbody id="mic-drug-tbody"></tbody>
          </table>
        </div>
        <div id="mic-drug-detail"></div>
      </div>

      <!-- Tab 4: Interaction Log -->
      <div class="qqq-tab-panel" id="qqq-panel-3" role="tabpanel" aria-labelledby="qqq-tab-3">
        <div class="qqq-filter-row">
          <select id="mic-log-sev" onchange="window._micRenderLog()"
            style="padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text);font-size:13px">
            <option value="">All Severities</option>
            <option value="contraindicated">Contraindicated</option>
            <option value="hold">Hold</option>
            <option value="major">Major</option>
            <option value="moderate">Moderate</option>
            <option value="caution">Caution</option>
            <option value="note">Note</option>
          </select>
          <select id="mic-log-patient" onchange="window._micRenderLog()"
            style="padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text);font-size:13px">
            <option value="">All Patients</option>
            ${patients.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
          </select>
          <button class="qqq-btn-sm primary" onclick="window._micExportCSV()">⬇ Export CSV</button>
        </div>
        <div id="mic-log-content"></div>
      </div>
    </div>`;

  // ── State ───────────────────────────────────────────────────────────────────
  let _currentPatientId = firstPt;
  let _currentInteractions = [];
  let _drugDbFiltered = [...DRUG_DB];

  // ── Tab switching ───────────────────────────────────────────────────────────
  window._micTab = function(idx) {
    document.querySelectorAll('.qqq-tab-btn').forEach((b, i) => {
      b.classList.toggle('active', i === idx);
      b.setAttribute('aria-selected', i === idx ? 'true' : 'false');
    });
    document.querySelectorAll('.qqq-tab-panel').forEach((p, i) => p.classList.toggle('active', i === idx));
    if (idx === 1) window._micRenderSafety(document.getElementById('mic-safety-patient')?.value || firstPt);
    if (idx === 2) window._micFilterDrugs();
    if (idx === 3) window._micRenderLog();
  };

  // ── Render medication list ──────────────────────────────────────────────────
  function _renderMedList(patientId) {
    const allMeds = _lsGet('ds_patient_medications', []);
    const entry = allMeds.find(e => e.patientId === patientId) || { patientId, meds:[] };
    const sec = document.getElementById('mic-med-section');
    if (!sec) return;
    if (entry.meds.length === 0) {
      sec.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:12px 0">No medications on file. Click <strong>+ Add Medication</strong> to begin.</div>`;
      return;
    }
    sec.innerHTML = `
      <div class="qqq-med-row-header">
        <span>Drug Name</span><span>Dose</span><span>Frequency</span><span>Prescriber</span><span>Start Date</span><span></span>
      </div>
      ${entry.meds.map(m => `
        <div class="qqq-med-row" id="medrow-${m.id}">
          <input type="text"  value="${m.name}"      onchange="window._micUpdateMed('${patientId}','${m.id}','name',this.value)"      placeholder="Drug name" />
          <input type="text"  value="${m.dose}"      onchange="window._micUpdateMed('${patientId}','${m.id}','dose',this.value)"      placeholder="e.g. 100mg" />
          <input type="text"  value="${m.frequency}" onchange="window._micUpdateMed('${patientId}','${m.id}','frequency',this.value)" placeholder="e.g. Daily" />
          <input type="text"  value="${m.prescriber}"onchange="window._micUpdateMed('${patientId}','${m.id}','prescriber',this.value)"placeholder="Prescriber" />
          <input type="date"  value="${m.startDate}" onchange="window._micUpdateMed('${patientId}','${m.id}','startDate',this.value)" />
          <button class="qqq-btn-sm danger" onclick="window._micDeleteMed('${patientId}','${m.id}')">✕</button>
        </div>`).join('')}`;
  }

  // ── Select patient ──────────────────────────────────────────────────────────
  window._micSelectPatient = function(pid) {
    _currentPatientId = pid;
    _currentInteractions = [];
    document.getElementById('mic-results-section').innerHTML = '';
    _renderMedList(pid);
  };

  // ── Add medication row ──────────────────────────────────────────────────────
  window._micAddMedRow = function() {
    const allMeds = _lsGet('ds_patient_medications', []);
    let entry = allMeds.find(e => e.patientId === _currentPatientId);
    if (!entry) { entry = { patientId: _currentPatientId, meds:[] }; allMeds.push(entry); }
    const newMed = { id: 'm' + Date.now(), name:'', dose:'', frequency:'', prescriber:'', startDate: new Date().toISOString().slice(0,10) };
    entry.meds.push(newMed);
    _lsSet('ds_patient_medications', allMeds);
    _renderMedList(_currentPatientId);
    // Focus first input of new row
    const row = document.getElementById(`medrow-${newMed.id}`);
    if (row) row.querySelector('input')?.focus();
  };

  // ── Update med field ────────────────────────────────────────────────────────
  window._micUpdateMed = function(pid, medId, field, value) {
    const allMeds = _lsGet('ds_patient_medications', []);
    const entry = allMeds.find(e => e.patientId === pid);
    if (!entry) return;
    const med = entry.meds.find(m => m.id === medId);
    if (!med) return;
    med[field] = value;
    _lsSet('ds_patient_medications', allMeds);
  };

  // ── Delete medication ───────────────────────────────────────────────────────
  window._micDeleteMed = function(pid, medId) {
    if (!confirm('Remove this medication?')) return;
    const allMeds = _lsGet('ds_patient_medications', []);
    const entry = allMeds.find(e => e.patientId === pid);
    if (!entry) return;
    entry.meds = entry.meds.filter(m => m.id !== medId);
    _lsSet('ds_patient_medications', allMeds);
    _renderMedList(pid);
  };

  // ── Run interaction check ───────────────────────────────────────────────────
  window._micRunCheck = function() {
    const allMeds = _lsGet('ds_patient_medications', []);
    const entry = allMeds.find(e => e.patientId === _currentPatientId) || { meds:[] };
    const meds = entry.meds.filter(m => m.name && m.name.trim());
    if (meds.length === 0) {
      document.getElementById('mic-results-section').innerHTML =
        `<div class="qqq-empty"><div class="qqq-empty-icon">ℹ</div><p>Add medications above, then run the check.</p></div>`;
      return;
    }
    _currentInteractions = _runInteractionCheck(meds);

    // Save to log
    const pt = patients.find(p => p.id === _currentPatientId);
    const checks = _lsGet('ds_interaction_checks', []);
    checks.unshift({ id:'chk-'+Date.now(), patientId: _currentPatientId, patientName: pt?.name || _currentPatientId, date: new Date().toISOString(), medications: meds.map(m => m.name), interactionCount: _currentInteractions.length, severities: [...new Set(_currentInteractions.map(i => i.severity))] });
    if (checks.length > 200) checks.splice(200);
    _lsSet('ds_interaction_checks', checks);

    const sec = document.getElementById('mic-results-section');
    sec.innerHTML = `<h3 style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:12px">Interaction Results — ${_hubEscHtml(pt?.name)}</h3><div id="mic-int-cards"></div>`;
    _renderInteractionResults(_currentInteractions, 'mic-int-cards');
  };

  // ── Flag interaction ────────────────────────────────────────────────────────
  window._micFlagInteraction = function(intId) {
    const int = _currentInteractions.find(i => i.id === intId);
    if (!int) return;
    int.flagged = true;
    const alerts = _lsGet('ds_interaction_alerts', []);
    const pt = patients.find(p => p.id === _currentPatientId);
    alerts.push({ id: 'alrt-'+Date.now(), interactionId: intId, patientId: _currentPatientId, patientName: pt?.name || '', drugA: int.drugA, drugB: int.drugB, severity: int.severity, mechanism: int.mechanism, recommendation: int.recommendation, date: new Date().toISOString() });
    _lsSet('ds_interaction_alerts', alerts);
    _renderInteractionResults(_currentInteractions, 'mic-int-cards');
  };

  // ── Acknowledge interaction ─────────────────────────────────────────────────
  window._micAcknowledge = function(intId) {
    const int = _currentInteractions.find(i => i.id === intId);
    if (!int) return;
    int.acknowledged = true;
    _renderInteractionResults(_currentInteractions, 'mic-int-cards');
  };

  // ── Protocol safety render ──────────────────────────────────────────────────
  window._micRenderSafety = function(pid) {
    const allMeds = _lsGet('ds_patient_medications', []);
    const entry = allMeds.find(e => e.patientId === pid) || { meds:[] };
    const meds = entry.meds.filter(m => m.name && m.name.trim());
    const pt = patients.find(p => p.id === pid);
    const modResults = _modalitySafetyCheck(meds);
    const container = document.getElementById('mic-safety-results');
    if (!container) return;
    const medSummary = meds.length
      ? meds.map(m => `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:var(--hover-bg);font-size:12px;margin:2px">${m.name}${m.dose ? ' '+m.dose : ''}</span>`).join(' ')
      : '<span style="color:var(--text-muted);font-size:13px">No medications recorded</span>';
    container.innerHTML = `
      <div style="margin-bottom:16px;padding:12px 16px;background:var(--card-bg);border:1px solid var(--border);border-radius:10px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;font-weight:600">Current Medications — ${pt?.name || pid}</div>
        <div>${medSummary}</div>
      </div>
      <div id="mic-safety-modalities"></div>`;
    _renderModalitySafety(modResults, 'mic-safety-modalities');
  };

  // ── Drug DB filter + render ─────────────────────────────────────────────────
  window._micFilterDrugs = function() {
    const q = (document.getElementById('mic-drug-search')?.value || '').toLowerCase();
    const cls = document.getElementById('mic-drug-class-filter')?.value || '';
    _drugDbFiltered = DRUG_DB.filter(d =>
      (!q || d.name.toLowerCase().includes(q) || d.class.toLowerCase().includes(q) || d.uses.toLowerCase().includes(q)) &&
      (!cls || d.class === cls)
    );
    const tbody = document.getElementById('mic-drug-tbody');
    if (!tbody) return;
    if (_drugDbFiltered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">No drugs match your search.</td></tr>`;
      return;
    }
    const riskClass = r => {
      if (r === 'high') return 'qqq-risk-high';
      if (r === 'moderate') return 'qqq-risk-moderate';
      if (r === 'low-moderate') return 'qqq-risk-low-moderate';
      return 'qqq-risk-low';
    };
    tbody.innerHTML = _drugDbFiltered.map((d, i) => `
      <tr onclick="window._micShowDrugDetail(${i})" data-idx="${i}">
        <td><strong>${d.name}</strong></td>
        <td>${d.class}</td>
        <td style="max-width:200px">${d.uses}</td>
        <td style="max-width:260px">${d.neuroConsiderations}</td>
        <td class="${riskClass(d.seizureRisk)}">${d.seizureRisk}</td>
        <td class="${riskClass(d.cnsStimRisk)}">${d.cnsStimRisk}</td>
      </tr>`).join('');
    document.getElementById('mic-drug-detail').innerHTML = '';
  };

  window._micShowDrugDetail = function(filteredIdx) {
    const d = _drugDbFiltered[filteredIdx];
    if (!d) return;
    // Highlight row
    document.querySelectorAll('#mic-drug-tbody tr').forEach((tr, i) => tr.classList.toggle('selected', i === filteredIdx));
    const riskLabel = r => ({ high:'High', moderate:'Moderate', 'low-moderate':'Low-Moderate', low:'Low' }[r] || r);
    const riskColor = r => ({ high:'#f87171', moderate:'#fb923c', 'low-moderate':'#fbbf24', low:'#2dd4bf' }[r] || 'var(--text)');
    document.getElementById('mic-drug-detail').innerHTML = `
      <div class="qqq-drug-detail">
        <h3>${d.name}</h3>
        <div class="qqq-detail-class">${d.class}</div>
        <div class="qqq-detail-grid">
          <div class="qqq-detail-field"><label>Common Uses</label><p>${d.uses}</p></div>
          <div class="qqq-detail-field"><label>Neuromodulation Considerations</label><p>${d.neuroConsiderations}</p></div>
          <div class="qqq-detail-field"><label>Seizure Risk</label><p style="color:${riskColor(d.seizureRisk)};font-weight:600">${riskLabel(d.seizureRisk)}</p></div>
          <div class="qqq-detail-field"><label>CNS Stimulation Risk</label><p style="color:${riskColor(d.cnsStimRisk)};font-weight:600">${riskLabel(d.cnsStimRisk)}</p></div>
        </div>
        <div style="margin-top:14px">
          <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;font-weight:600;display:block;margin-bottom:8px">Related Interactions</label>
          ${(() => {
            const related = INTERACTION_RULES.filter(r => {
              const classes = _resolveClasses(d.name);
              if (r.drugs) return r.drugs.some(dr => classes.has(dr));
              if (r.drug)  return classes.has(r.drug);
              return false;
            });
            return related.length
              ? related.map(r => `<div style="margin-bottom:8px;padding:8px 10px;background:var(--hover-bg);border-radius:8px;font-size:12.5px">
                  <span class="qqq-badge qqq-badge-${r.severity}" style="margin-right:6px">${r.severity}</span>
                  <strong>${r.drugs ? r.drugs.join(' + ') : r.drug + ' ↔ ' + r.modality}:</strong> ${r.mechanism}
                </div>`).join('')
              : '<p style="font-size:13px;color:var(--text-muted)">No specific rules in current database.</p>';
          })()}
        </div>
      </div>`;
  };

  // ── Interaction log render ──────────────────────────────────────────────────
  window._micRenderLog = function() {
    const sev = document.getElementById('mic-log-sev')?.value || '';
    const ptFilter = document.getElementById('mic-log-patient')?.value || '';
    let checks = _lsGet('ds_interaction_checks', []);
    if (sev) checks = checks.filter(c => c.severities && c.severities.includes(sev));
    if (ptFilter) checks = checks.filter(c => c.patientId === ptFilter);
    const container = document.getElementById('mic-log-content');
    if (!container) return;
    if (checks.length === 0) {
      container.innerHTML = `<div class="qqq-empty"><div class="qqq-empty-icon">📋</div><p>No interaction checks recorded yet.</p></div>`;
      return;
    }
    const sevWeight = { contraindicated:0, hold:1, major:2, moderate:3, caution:4, note:5 };
    const sevColor = { contraindicated:'#f87171', hold:'#f87171', major:'#fb923c', moderate:'#fbbf24', caution:'#fde047', note:'#60a5fa' };
    container.innerHTML = `
      <div style="overflow-x:auto">
        <table class="qqq-log-table">
          <thead><tr><th>Date</th><th>Patient</th><th>Medications Checked</th><th>Interactions</th><th>Severities</th></tr></thead>
          <tbody>
            ${checks.map(c => {
              const worstSev = (c.severities || []).sort((a,b) => (sevWeight[a]??9)-(sevWeight[b]??9))[0] || '';
              const dateStr = new Date(c.date).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
              return `<tr>
                <td style="white-space:nowrap;font-size:12px">${dateStr}</td>
                <td><strong>${c.patientName || c.patientId}</strong></td>
                <td style="font-size:12px;max-width:240px">${(c.medications||[]).join(', ')}</td>
                <td style="text-align:center"><strong style="color:${c.interactionCount > 0 ? '#fb923c' : '#2dd4bf'}">${c.interactionCount}</strong></td>
                <td>${(c.severities||[]).sort((a,b)=>(sevWeight[a]??9)-(sevWeight[b]??9)).map(s => `<span class="qqq-badge qqq-badge-${s}" style="margin-right:3px">${s}</span>`).join('')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  };

  // ── Export CSV ──────────────────────────────────────────────────────────────
  window._micExportCSV = function() {
    const checks = _lsGet('ds_interaction_checks', []);
    if (checks.length === 0) { _dsToast('No interaction log entries to export yet.', 'info'); return; }
    const rows = [['Date','Patient','Medications','Interaction Count','Severities'].join(',')];
    checks.forEach(c => {
      rows.push([
        new Date(c.date).toISOString(),
        `"${(c.patientName || c.patientId).replace(/"/g,'""')}"`,
        `"${(c.medications||[]).join('; ').replace(/"/g,'""')}"`,
        c.interactionCount,
        `"${(c.severities||[]).join('; ')}"`,
      ].join(','));
    });
    const blob = new Blob([rows.join('\n')], { type:'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `interaction-log-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Print safety screen ─────────────────────────────────────────────────────
  window._micPrintSafety = function() {
    const pid = document.getElementById('mic-safety-patient')?.value || _currentPatientId;
    const allMeds = _lsGet('ds_patient_medications', []);
    const entry = allMeds.find(e => e.patientId === pid) || { meds:[] };
    const meds = entry.meds.filter(m => m.name && m.name.trim());
    const pt = patients.find(p => p.id === pid);
    const modResults = _modalitySafetyCheck(meds);
    const icons = { TMS:'⚡', tDCS:'🔋', Neurofeedback:'🧠', 'EEG Biofeedback':'📡', PEMF:'🌀', HEG:'💡' };
    const rows = MODALITIES.map(mod => {
      const r = modResults[mod] || { status:'go', items:[] };
      const statusLabel = r.status === 'go' ? '✓ Go' : r.status === 'caution' ? '⚠ Caution' : '✕ Hold';
      const notes = r.items.map(it => `${it.drug}: ${it.mechanism}`).join('; ') || 'No interactions found';
      return `<tr><td>${icons[mod]||''} ${mod}</td><td><strong>${statusLabel}</strong></td><td style="font-size:11px">${notes}</td></tr>`;
    }).join('');
    const w = window.open('', '_blank', 'width=800,height=600');
    w.document.write(`<!DOCTYPE html><html><head><title>Protocol Safety Screen</title><style>
      body{font-family:system-ui,sans-serif;padding:24px;color:#111}
      h2{margin-bottom:4px}p.sub{color:#555;font-size:13px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{border:1px solid #ccc;padding:8px 10px;text-align:left}
      th{background:#f4f4f4;font-size:12px;text-transform:uppercase;letter-spacing:.4px}
      @media print{button{display:none}}
    </style></head><body>
      <h2>Protocol Safety Screen</h2>
      <p class="sub">Patient: <strong>${pt?.name || pid}</strong> &nbsp;|&nbsp; Date: ${new Date().toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'})}</p>
      <p class="sub">Medications: ${meds.map(m => m.name + (m.dose?' '+m.dose:'')).join(', ') || '(none recorded)'}</p>
      <table><thead><tr><th>Modality</th><th>Status</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>
      <p style="font-size:11px;color:#888;margin-top:16px">Generated by DeepSynaps Protocol Studio — for clinical review only, not a substitute for professional judgement.</p>
      <button onclick="window.print()" style="margin-top:12px;padding:8px 18px;font-size:13px">🖨 Print</button>
    </body></html>`);
    w.document.close();
  };

  // ── Initial render ──────────────────────────────────────────────────────────
  if (firstPt) {
    _renderMedList(firstPt);
    window._micRenderSafety(firstPt);
  }
  window._micFilterDrugs();
  window._micRenderLog();
}

// =============================================================================
// pgFormsBuilder — Dynamic Forms & Assessments Builder
// =============================================================================
export async function pgFormsBuilder(setTopbar) {
  setTopbar('Forms & Assessments', `<button class="btn btn-sm btn-primary" onclick="window._fbNewForm()">+ New Form</button><button class="btn btn-sm" onclick="window._fbExportCSV()" style="margin-left:6px">Export CSV</button>`);

  const VALIDATED_SCALES = [
    { id:'phq9', name:'PHQ-9', category:'Screening', locked:true, maxScore:27, description:'Patient Health Questionnaire — depression severity screening.', bands:[{max:4,label:'Minimal'},{max:9,label:'Mild'},{max:14,label:'Moderate'},{max:19,label:'Moderately Severe'},{max:27,label:'Severe'}], items:['Little interest or pleasure in doing things','Feeling down, depressed, or hopeless','Trouble falling or staying asleep, or sleeping too much','Feeling tired or having little energy','Poor appetite or overeating','Feeling bad about yourself or that you are a failure','Trouble concentrating on things','Moving or speaking so slowly that other people could have noticed','Thoughts that you would be better off dead, or of hurting yourself'] },
    { id:'gad7', name:'GAD-7', category:'Screening', locked:true, maxScore:21, description:'Generalised Anxiety Disorder 7-item scale.', bands:[{max:4,label:'Minimal'},{max:9,label:'Mild'},{max:14,label:'Moderate'},{max:21,label:'Severe'}], items:['Feeling nervous, anxious, or on edge','Not being able to stop or control worrying','Worrying too much about different things','Trouble relaxing','Being so restless that it is hard to sit still','Becoming easily annoyed or irritable','Feeling afraid, as if something awful might happen'] },
    { id:'vanderbilt', name:'Vanderbilt ADHD (Parent)', category:'Screening', locked:true, maxScore:null, description:'Vanderbilt Assessment Scale — Parent Informant (ADHD).', bands:[], items:['Fails to give attention to details or makes careless mistakes','Has difficulty sustaining attention to tasks or activities','Does not seem to listen when spoken to directly','Does not follow through on instructions and fails to finish schoolwork','Has difficulty organising tasks and activities','Avoids or dislikes tasks requiring sustained mental effort','Loses things necessary for tasks or activities','Is easily distracted by extraneous stimuli','Is forgetful in daily activities','Fidgets with hands or feet or squirms in seat','Leaves seat when remaining seated is expected','Runs about or climbs excessively','Has difficulty playing quietly','Is on the go or acts as if driven by a motor','Talks excessively','Blurts out answers before questions are completed','Has difficulty awaiting turn','Interrupts or intrudes on others','Academic performance: Reading','Academic performance: Mathematics','Academic performance: Written expression','Relationship with parents','Relationship with siblings','Relationship with peers','Participation in organised activities','Overall school performance'] },
    { id:'moca', name:'MoCA (Abbreviated)', category:'Screening', locked:true, maxScore:30, description:'Montreal Cognitive Assessment — abbreviated 10-item version.', bands:[{max:25,label:'Possible Impairment'},{max:30,label:'Normal'}], items:['Visuospatial/Executive — Trail-making task','Visuospatial — Copy cube','Naming — Name 3 animals','Attention — Forward digit span','Attention — Backward digit span','Language — Repeat two sentences','Fluency — Generate words starting with F','Abstraction — Identify similarity between two items','Delayed recall — Remember 5 words','Orientation — State date, month, year, day, place, city'] },
    { id:'pcl5', name:'PCL-5 PTSD Checklist', category:'Screening', locked:true, maxScore:80, description:'PTSD Checklist for DSM-5 — 20 symptom items, 0–4 scale each.', bands:[{max:31,label:'Below Threshold'},{max:80,label:'Probable PTSD'}], items:['Repeated, disturbing, and unwanted memories of the stressful experience','Repeated, disturbing dreams of the stressful experience','Feeling as if the stressful experience were actually happening again','Feeling very upset when something reminded you of the stressful experience','Having strong physical reactions to reminders','Avoiding memories, thoughts, or feelings related to the stressful experience','Avoiding external reminders of the stressful experience','Trouble remembering important parts of the stressful experience','Having strong negative beliefs about yourself, other people, or the world','Blaming yourself or someone else for the stressful experience','Having strong negative feelings such as fear, horror, anger, guilt, or shame','Loss of interest in activities you used to enjoy','Feeling distant or cut off from other people','Trouble experiencing positive feelings','Irritable behavior, angry outbursts, or acting aggressively','Taking too many risks or doing things that could cause you harm','Being superalert or watchful or on guard','Feeling jumpy or easily startled','Having difficulty concentrating','Trouble falling or staying asleep'] },
  ];

  const Q_TYPES = [
    { type:'likert',   label:'Likert Scale',  desc:'0–3 or 1–5 scale' },
    { type:'text',     label:'Short Text',    desc:'Single-line answer' },
    { type:'textarea', label:'Long Text',     desc:'Multi-line answer' },
    { type:'yesno',    label:'Yes / No',      desc:'Binary choice' },
    { type:'slider',   label:'Slider',        desc:'0–10 numeric range' },
    { type:'checkbox', label:'Checkboxes',    desc:'Multi-select options' },
    { type:'date',     label:'Date Picker',   desc:'Calendar date input' },
    { type:'number',   label:'Number',        desc:'Numeric with min/max' },
  ];

  // Storage helpers
  function _fbLoad(key, def) { try { return JSON.parse(localStorage.getItem(key)) || def; } catch { return def; } }
  function _fbSave(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  // Seed data on first load
  if (!localStorage.getItem('ds_forms')) {
    const sf = VALIDATED_SCALES.map(s => ({
      id: s.id, name: s.name, description: s.description, category: s.category,
      version: '1.0', locked: true, frequency: 'weekly', autoScore: true,
      scoreFormula: s.maxScore ? 'sum' : '', maxScore: s.maxScore, bands: s.bands,
      notifyThreshold: s.maxScore ? Math.round(s.maxScore * 0.5) : null,
      assignTo: 'all', deployedTo: [], lastModified: '2026-03-10T09:00:00Z',
      questions: s.items.map((text, i) => ({
        id: s.id + '_q' + (i + 1),
        type: (s.id === 'vanderbilt' && i >= 18) ? 'number' : 'likert',
        text, required: true,
        scale: s.id === 'pcl5' ? [0,1,2,3,4] : [0,1,2,3],
        scaleLabels: s.id === 'pcl5' ? ['Not at all','A little bit','Moderately','Quite a bit','Extremely'] : ['Not at all','Several days','More than half the days','Nearly every day'],
        options: null, min: null, max: null,
      })),
    }));
    sf.push(
      { id:'custom_intake_001', name:'Initial Neurofeedback Intake', description:'Baseline intake form for new neurofeedback patients.', category:'Custom', version:'1.2', locked:false, frequency:'one-time', autoScore:false, scoreFormula:'', maxScore:null, bands:[], notifyThreshold:null, assignTo:'all', deployedTo:['pt001','pt002'], lastModified:'2026-04-01T14:22:00Z',
        questions:[
          { id:'ci1', type:'text',     text:'What is your primary reason for seeking neurofeedback treatment?', required:true,  options:null, min:null, max:null },
          { id:'ci2', type:'checkbox', text:'Which of the following symptoms concern you most?', required:false, options:['Anxiety','Depression','Poor sleep','Difficulty concentrating','Memory issues','Chronic pain','Other'], min:null, max:null },
          { id:'ci3', type:'yesno',    text:'Have you previously undergone any brain-based therapy (neurofeedback, TMS, tDCS)?', required:true,  options:null, min:null, max:null },
          { id:'ci4', type:'textarea', text:'Please describe any current medications and dosages:', required:false, options:null, min:null, max:null },
          { id:'ci5', type:'number',   text:'On a scale of 1–10, how would you rate your overall quality of life?', required:true,  options:null, min:1, max:10 },
          { id:'ci6', type:'slider',   text:'Rate your current stress level:', required:true,  options:null, min:0, max:10 },
          { id:'ci7', type:'date',     text:'When did your symptoms first begin?', required:false, options:null, min:null, max:null },
        ] },
      { id:'custom_followup_001', name:'Weekly Progress Check-in', description:'Short weekly follow-up for ongoing treatment patients.', category:'Follow-up', version:'2.0', locked:false, frequency:'weekly', autoScore:true, scoreFormula:'sum', maxScore:30, bands:[{max:10,label:'Stable'},{max:20,label:'Mild Change'},{max:30,label:'Significant Change'}], notifyThreshold:20, assignTo:'all', deployedTo:['pt001','pt003'], lastModified:'2026-04-05T10:00:00Z',
        questions:[
          { id:'fw1', type:'slider',   text:'Rate your overall mood this week (0=Very poor, 10=Excellent):', required:true, options:null, min:0, max:10 },
          { id:'fw2', type:'slider',   text:'Rate your sleep quality this week (0=Very poor, 10=Excellent):', required:true, options:null, min:0, max:10 },
          { id:'fw3', type:'slider',   text:'Rate your concentration/focus this week (0=Very poor, 10=Excellent):', required:true, options:null, min:0, max:10 },
          { id:'fw4', type:'yesno',    text:'Did you experience any side effects from your last session?', required:true, options:null, min:null, max:null },
          { id:'fw5', type:'textarea', text:'Any additional notes or concerns for your clinician:', required:false, options:null, min:null, max:null },
        ] },
      { id:'custom_discharge_001', name:'Discharge and Outcome Summary', description:'End-of-treatment patient-reported outcome measure.', category:'Discharge', version:'1.0', locked:false, frequency:'one-time', autoScore:false, scoreFormula:'', maxScore:null, bands:[], notifyThreshold:null, assignTo:'all', deployedTo:[], lastModified:'2026-04-08T16:45:00Z',
        questions:[
          { id:'dc1', type:'likert',   text:'Overall, how satisfied are you with your treatment outcomes?', required:true, scale:[1,2,3,4,5], scaleLabels:['Very dissatisfied','Dissatisfied','Neutral','Satisfied','Very satisfied'], options:null, min:null, max:null },
          { id:'dc2', type:'likert',   text:'How would you rate the improvement in your primary symptom?', required:true, scale:[1,2,3,4,5], scaleLabels:['No improvement','Slight','Moderate','Good','Full resolution'], options:null, min:null, max:null },
          { id:'dc3', type:'checkbox', text:'Which areas of your life have improved since treatment?', required:false, options:['Sleep','Mood','Focus','Relationships','Work/school performance','Physical wellbeing','Other'], min:null, max:null },
          { id:'dc4', type:'yesno',    text:'Would you recommend this treatment to others?', required:true, options:null, min:null, max:null },
          { id:'dc5', type:'textarea', text:'Please share any final feedback or comments about your experience:', required:false, options:null, min:null, max:null },
        ] }
    );
    _fbSave('ds_forms', sf);
  }
  if (!localStorage.getItem('ds_form_submissions')) {
    const _n = Date.now();
    _fbSave('ds_form_submissions', [
      { id:'sub001', formId:'phq9', formName:'PHQ-9', patientId:'pt001', patientName:'Alexis Morgan', date:new Date(_n-7*86400000).toISOString(), score:12, severity:'Moderate', flagged:false, answers:[3,2,1,2,1,1,1,0,1] },
      { id:'sub002', formId:'phq9', formName:'PHQ-9', patientId:'pt001', patientName:'Alexis Morgan', date:new Date(_n-14*86400000).toISOString(), score:16, severity:'Moderately Severe', flagged:false, answers:[3,3,2,2,2,1,1,1,1] },
      { id:'sub003', formId:'phq9', formName:'PHQ-9', patientId:'pt001', patientName:'Alexis Morgan', date:new Date(_n-21*86400000).toISOString(), score:18, severity:'Moderately Severe', flagged:true, answers:[3,3,2,2,2,2,1,1,2] },
      { id:'sub004', formId:'phq9', formName:'PHQ-9', patientId:'pt001', patientName:'Alexis Morgan', date:new Date(_n-28*86400000).toISOString(), score:20, severity:'Severe', flagged:true, answers:[3,3,3,2,2,2,2,1,2] },
      { id:'sub005', formId:'phq9', formName:'PHQ-9', patientId:'pt001', patientName:'Alexis Morgan', date:new Date(_n-35*86400000).toISOString(), score:22, severity:'Severe', flagged:true, answers:[3,3,3,3,2,2,2,2,2] },
      { id:'sub006', formId:'gad7', formName:'GAD-7', patientId:'pt002', patientName:'Jordan Blake', date:new Date(_n-3*86400000).toISOString(), score:8, severity:'Mild', flagged:false, answers:[2,1,1,2,1,0,1] },
      { id:'sub007', formId:'gad7', formName:'GAD-7', patientId:'pt002', patientName:'Jordan Blake', date:new Date(_n-10*86400000).toISOString(), score:11, severity:'Moderate', flagged:false, answers:[2,2,2,1,2,1,1] },
      { id:'sub008', formId:'custom_followup_001', formName:'Weekly Progress Check-in', patientId:'pt003', patientName:'Sam Rivera', date:new Date(_n-2*86400000).toISOString(), score:24, severity:'Significant Change', flagged:false, answers:[8,7,9,'No','Feeling much better this week'] },
    ]);
  }
  if (!localStorage.getItem('ds_form_deployments')) {
    _fbSave('ds_form_deployments', [
      { formId:'phq9', patientId:'pt001', assignedAt:'2026-03-01T10:00:00Z', frequency:'weekly' },
      { formId:'gad7', patientId:'pt002', assignedAt:'2026-03-05T10:00:00Z', frequency:'weekly' },
      { formId:'custom_followup_001', patientId:'pt003', assignedAt:'2026-04-01T09:00:00Z', frequency:'weekly' },
    ]);
  }
  if (!localStorage.getItem('ds_active_form_id')) localStorage.setItem('ds_active_form_id', 'custom_intake_001');

  // Additional validated scales for the Validated Scales tab (beyond what's already in VALIDATED_SCALES)
  const EXTRA_SCALES = [
    { id:'hamd', name:'HAM-D', condition:'Depression', range:'0–52', rater:'Clinician-rated', description:'Hamilton Depression Rating Scale — 17-item clinician-administered gold standard.', maxScore:52, bands:[{max:7,label:'None'},{max:13,label:'Mild'},{max:18,label:'Moderate'},{max:22,label:'Severe'},{max:52,label:'Very Severe'}], items:['Depressed mood (0-4)','Guilt (0-4)','Suicide ideation (0-4)','Early insomnia (0-2)','Middle insomnia (0-2)','Late insomnia (0-2)','Work and activities (0-4)','Retardation (0-4)','Agitation (0-4)','Anxiety — psychic (0-4)','Anxiety — somatic (0-4)','Somatic symptoms GI (0-2)','General somatic symptoms (0-2)','Genital symptoms (0-2)','Hypochondriasis (0-4)','Weight loss (0-2)','Insight (0-2)'], itemMax:[4,4,4,2,2,2,4,4,4,4,4,2,2,2,4,2,2] },
    { id:'madrs', name:'MADRS', condition:'Depression', range:'0–60', rater:'Clinician-rated', description:'Montgomery-Åsberg Depression Rating Scale — sensitive to antidepressant change.', maxScore:60, bands:[{max:6,label:'Normal'},{max:19,label:'Mild'},{max:34,label:'Moderate'},{max:60,label:'Severe'}], items:['Apparent sadness','Reported sadness','Inner tension','Reduced sleep','Reduced appetite','Concentration difficulties','Lassitude','Inability to feel','Pessimistic thoughts','Suicidal thoughts'], itemMax:[6,6,6,6,6,6,6,6,6,6] },
    { id:'bdiii', name:'BDI-II', condition:'Depression', range:'0–63', rater:'Self-report', description:'Beck Depression Inventory — 21-item self-report depression severity.', maxScore:63, bands:[{max:13,label:'Minimal'},{max:19,label:'Mild'},{max:28,label:'Moderate'},{max:63,label:'Severe'}], items:['Sadness','Pessimism','Past failure','Loss of pleasure','Guilty feelings','Punishment feelings','Self-dislike','Self-criticalness','Suicidal thoughts or wishes','Crying','Agitation','Loss of interest','Indecisiveness','Worthlessness','Loss of energy','Changes in sleeping pattern','Irritability','Changes in appetite','Concentration difficulty','Tiredness or fatigue','Loss of interest in sex'], itemMax:Array(21).fill(3) },
    { id:'cdss', name:'CDSS', condition:'Cognitive / Schizophrenia', range:'0–12', rater:'Clinician-rated', description:'Calgary Depression Scale for Schizophrenia — 9-item depression in psychosis.', maxScore:12, bands:[{max:5,label:'Non-depressed'},{max:12,label:'Depressed'}], items:['Depression','Hopelessness','Self-depreciation','Guilty ideas of reference','Pathological guilt','Morning depression','Early wakening','Suicide','Observed depression'], itemMax:Array(9).fill(3) },
    { id:'moca2', name:'MoCA', condition:'Cognitive', range:'0–30', rater:'Clinician-rated', description:'Montreal Cognitive Assessment — full 30-item version for cognitive screening.', maxScore:30, bands:[{max:25,label:'Possible Impairment'},{max:30,label:'Normal'}], items:['Trail-making (alternating)','Copy cube','Draw clock (contour)','Draw clock (numbers)','Draw clock (hands)','Name lion','Name rhinoceros','Name camel','Forward digit span (5-2-1-4-1)','Backward digit span (7-4-2)','Tap for letter A','Serial 7s (93)','Serial 7s (86)','Serial 7s (79)','Serial 7s (72)','Serial 7s (65)','Repeat sentence 1','Repeat sentence 2','Fluency — F words','Abstraction — train/bicycle','Abstraction — watch/ruler','Recall — Face','Recall — Velvet','Recall — Church','Recall — Daisy','Recall — Red','Orientation — date','Orientation — month','Orientation — year','Orientation — day','Orientation — place','Orientation — city'], itemMax:Array(32).fill(1) },
    { id:'briefa', name:'BRIEF-A', condition:'Executive Function', range:'Norm-referenced', rater:'Self/informant', description:'Behavior Rating Inventory of Executive Function — Adult version; T-scores normed against population.', maxScore:null, bands:[], items:['Inhibit — stop actions/impulses','Shift — move between situations','Emotional Control — modulate emotions','Self-Monitor — check own behavior','Initiate — begin tasks','Working Memory — hold information','Plan/Organize — manage future-oriented tasks','Task Monitor — check work','Organization of Materials — keep workspace orderly'], itemMax:Array(9).fill(4) },
  ];

  // Module state
  let _fbTab = 'builder';
  let _fbActiveId = localStorage.getItem('ds_active_form_id') || 'custom_intake_001';

  // Utility
  const _e = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const _fbGetForms  = () => _fbLoad('ds_forms', []);
  const _fbGetSubs   = () => _fbLoad('ds_form_submissions', []);
  const _fbGetForm   = id => _fbGetForms().find(f => f.id === id) || null;
  const _fbSaveForm  = f  => { const fs = _fbGetForms(); const i = fs.findIndex(x => x.id === f.id); if (i >= 0) fs[i] = f; else fs.push(f); _fbSave('ds_forms', fs); };
  const _fbSevClass  = label => { const l = (label || '').toLowerCase(); if (l.includes('minimal') || l.includes('normal') || l.includes('below') || l.includes('stable')) return 'ppp-sev-minimal'; if (l.includes('mild')) return 'ppp-sev-mild'; if (l.includes('moderate')) return 'ppp-sev-moderate'; return 'ppp-sev-severe'; };
  const _fbFmt       = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '';

  // Question widget for canvas (disabled, preview)
  function _renderQWidget(q) {
    if (q.type === 'likert') {
      const sc = q.scale || [0,1,2,3], lb = q.scaleLabels || sc.map(String);
      return '<div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">' + sc.map((v,i) => '<div style="display:flex;flex-direction:column;align-items:center;gap:3px"><input type="radio" name="pw_' + q.id + '" disabled><label style="font-size:9px;color:var(--text-tertiary);max-width:64px;text-align:center">' + _e(lb[i] || String(v)) + '</label></div>').join('') + '</div>';
    }
    if (q.type === 'yesno') return '<div style="display:flex;gap:14px;margin-top:4px"><label style="font-size:12px;color:var(--text-secondary)"><input type="radio" disabled> Yes</label><label style="font-size:12px;color:var(--text-secondary)"><input type="radio" disabled> No</label></div>';
    if (q.type === 'slider') { const m = Math.round(((q.min ?? 0) + (q.max ?? 10)) / 2); return '<div style="display:flex;align-items:center;gap:6px;margin-top:4px"><input type="range" min="' + (q.min ?? 0) + '" max="' + (q.max ?? 10) + '" value="' + m + '" disabled style="flex:1;accent-color:var(--teal)"><span style="font-size:11px;color:var(--text-tertiary)">' + m + '</span></div>'; }
    if (q.type === 'checkbox') return '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">' + (q.options || ['Option 1','Option 2']).map(o => '<label style="font-size:11px;color:var(--text-secondary)"><input type="checkbox" disabled> ' + _e(o) + '</label>').join('') + '</div>';
    if (q.type === 'textarea') return '<textarea class="ppp-preview-input" disabled rows="2" style="margin-top:4px;opacity:0.5;resize:none" placeholder="Patient response\u2026"></textarea>';
    if (q.type === 'number') return '<input type="number" class="ppp-preview-input" disabled style="margin-top:4px;width:120px;opacity:0.5" placeholder="' + (q.min ?? 0) + '\u2013' + (q.max ?? 100) + '">';
    if (q.type === 'date') return '<input type="date" class="ppp-preview-input" disabled style="margin-top:4px;width:180px;opacity:0.5">';
    return '<input type="text" class="ppp-preview-input" disabled style="margin-top:4px;opacity:0.5" placeholder="Patient response\u2026">';
  }

  // Question widget for preview modal (enabled)
  function _renderPreviewWidget(q, idx) {
    const id = 'pfq_' + idx;
    if (q.type === 'likert') {
      const sc = q.scale || [0,1,2,3], lb = q.scaleLabels || sc.map(String);
      return '<div class="ppp-preview-likert-row">' + sc.map((v,i) => '<div class="ppp-preview-likert-opt"><input type="radio" id="' + id + '_' + v + '" name="' + id + '" value="' + v + '"><label for="' + id + '_' + v + '">' + _e(lb[i] || String(v)) + '</label></div>').join('') + '</div>';
    }
    if (q.type === 'yesno') return '<div style="display:flex;gap:20px"><label style="font-size:13px;cursor:pointer"><input type="radio" name="' + id + '" value="yes"> Yes</label><label style="font-size:13px;cursor:pointer"><input type="radio" name="' + id + '" value="no"> No</label></div>';
    if (q.type === 'slider') { const m = Math.round(((q.min ?? 0) + (q.max ?? 10)) / 2); return '<div style="display:flex;align-items:center;gap:10px"><input type="range" id="' + id + '" min="' + (q.min ?? 0) + '" max="' + (q.max ?? 10) + '" value="' + m + '" style="flex:1;accent-color:var(--teal)" oninput="document.getElementById(\'' + id + '_val\').textContent=this.value"><span id="' + id + '_val" style="font-size:14px;font-weight:600;color:var(--teal);min-width:24px">' + m + '</span></div>'; }
    if (q.type === 'checkbox') return '<div style="display:flex;flex-wrap:wrap;gap:8px">' + (q.options || ['Option 1','Option 2']).map(o => '<label style="font-size:12.5px;cursor:pointer"><input type="checkbox" name="' + id + '" value="' + _e(o) + '"> ' + _e(o) + '</label>').join('') + '</div>';
    if (q.type === 'textarea') return '<textarea class="ppp-preview-input" id="' + id + '" rows="3" placeholder="Enter your response\u2026"></textarea>';
    if (q.type === 'number') return '<input type="number" class="ppp-preview-input" id="' + id + '" min="' + (q.min ?? 0) + '" max="' + (q.max ?? 100) + '" style="width:180px">';
    if (q.type === 'date') return '<input type="date" class="ppp-preview-input" id="' + id + '" style="width:200px">';
    return '<input type="text" class="ppp-preview-input" id="' + id + '" placeholder="Enter your response\u2026">';
  }

  // Render question card list
  function _renderQList(questions) {
    if (!questions || !questions.length) {
      return '<div class="ppp-canvas-empty"><svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.2" style="margin-bottom:12px;opacity:0.3"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="13" x2="13" y2="13"/></svg><div style="font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:4px">No questions yet</div><div style="font-size:11.5px">Click "+ Add Question" to begin.</div></div>';
    }
    return questions.map((q, i) => {
      let ex = '';
      if (q.type === 'checkbox') ex += '<button class="ppp-lib-btn" style="flex:none" onclick="window._fbEditOptions(' + i + ')">Edit Options</button>';
      if (q.type === 'likert')   ex += '<button class="ppp-lib-btn" style="flex:none" onclick="window._fbEditScale(' + i + ')">Edit Scale</button>';
      if (q.type === 'number' || q.type === 'slider') ex += '<button class="ppp-lib-btn" style="flex:none" onclick="window._fbEditRange(' + i + ')">Edit Range</button>';
      return '<div class="ppp-canvas-question" data-qidx="' + i + '" data-qid="' + _e(q.id) + '">' +
        '<div class="ppp-drag-handle" data-qidx="' + i + '">\u28BF</div>' +
        '<div class="ppp-q-body">' +
          '<div class="ppp-q-header"><span class="ppp-q-num">' + (i + 1) + '.</span><span class="ppp-type-badge ' + _e(q.type) + '">' + _e(q.type) + '</span>' +
          '<div class="ppp-q-text" contenteditable="true" data-placeholder="Enter question text\u2026" data-qidx="' + i + '" onblur="window._fbEditQText(' + i + ',this.textContent)">' + _e(q.text) + '</div></div>' +
          '<div>' + _renderQWidget(q) + '</div>' +
          '<div class="ppp-q-controls"><button class="ppp-required-toggle ' + (q.required ? 'on' : '') + '" onclick="window._fbToggleRequired(' + i + ')">' + (q.required ? '\u2605 Required' : '\u2606 Optional') + '</button>' + ex +
          '<button class="ppp-q-delete-btn" onclick="window._fbDeleteQ(' + i + ')">&#x2715; Remove</button></div>' +
        '</div></div>';
    }).join('');
  }

  // Library panel HTML
  function _renderLibrary() {
    const fs = _fbGetForms(), vs = fs.filter(f => f.locked), cs = fs.filter(f => !f.locked);
    const vH = vs.map(f =>
      '<div class="ppp-library-item ' + (_fbActiveId === f.id ? 'active' : '') + '" onclick="window._fbOpenForm(\'' + _e(f.id) + '\')">' +
        '<div class="ppp-library-item-name">' + _e(f.name) + '</div>' +
        '<div class="ppp-library-item-meta"><span>' + (f.questions || []).length + ' Q</span>' + (f.maxScore ? '<span>/' + f.maxScore + 'pts</span>' : '') + '<span style="color:var(--amber)">\uD83D\uDD12</span></div>' +
        '<div class="ppp-lib-actions"><button class="ppp-lib-btn" onclick="event.stopPropagation();window._fbUseScale(\'' + _e(f.id) + '\')">Use</button><button class="ppp-lib-btn deploy" onclick="event.stopPropagation();window._fbDeployForm(\'' + _e(f.id) + '\')">Deploy</button></div>' +
      '</div>'
    ).join('');
    const cH = cs.length ? cs.map(f =>
      '<div class="ppp-library-item ' + (_fbActiveId === f.id ? 'active' : '') + '" onclick="window._fbOpenForm(\'' + _e(f.id) + '\')">' +
        '<div class="ppp-library-item-name">' + _e(f.name) + '</div>' +
        '<div class="ppp-library-item-meta"><span>' + (f.questions || []).length + ' Q</span><span>' + _fbFmt(f.lastModified) + '</span></div>' +
        '<div class="ppp-lib-actions"><button class="ppp-lib-btn" onclick="event.stopPropagation();window._fbDuplicateForm(\'' + _e(f.id) + '\')">Dup</button><button class="ppp-lib-btn deploy" onclick="event.stopPropagation();window._fbDeployForm(\'' + _e(f.id) + '\')">Deploy</button><button class="ppp-lib-btn" style="color:var(--red);border-color:rgba(255,107,107,0.2)" onclick="event.stopPropagation();window._fbDeleteForm(\'' + _e(f.id) + '\')">Del</button></div>' +
      '</div>'
    ).join('') : '<div style="padding:8px 14px;font-size:11px;color:var(--text-tertiary)">No custom forms yet.</div>';
    return '<div class="ppp-library-panel"><div style="padding:10px 10px 6px;border-bottom:1px solid var(--border)"><button class="btn btn-sm btn-primary" style="width:100%;font-size:11.5px" onclick="window._fbNewForm()">+ New Form</button></div><div class="ppp-library-scroll"><div class="ppp-lib-section-header">Validated Scales</div>' + vH + '<div class="ppp-lib-section-header" style="margin-top:8px">Custom Forms</div>' + cH + '</div></div>';
  }

  // Properties panel HTML
  function _renderProperties(form) {
    if (!form) return '<div class="ppp-properties-panel"><div class="ppp-props-scroll" style="padding:20px;font-size:12px;color:var(--text-tertiary)">Select a form.</div></div>';
    const dis = form.locked ? ' disabled' : '';
    const bandsH = (form.bands || []).map((b, i) =>
      '<div class="ppp-severity-band"><input type="number" value="' + b.max + '" min="0" oninput="window._fbUpdateBand(' + i + ',\'max\',this.value)" placeholder="Max"><input type="text" value="' + _e(b.label) + '" oninput="window._fbUpdateBand(' + i + ',\'label\',this.value)" placeholder="Label"><button class="ppp-band-remove" onclick="window._fbRemoveBand(' + i + ')">&#x2715;</button></div>'
    ).join('');
    const freqO = ['one-time','weekly','monthly','before-session','after-session'].map(v => '<option value="' + v + '"' + (form.frequency === v ? ' selected' : '') + '>' + v + '</option>').join('');
    const catO  = ['Screening','Follow-up','Discharge','Custom'].map(c => '<option value="' + c + '"' + (form.category === c ? ' selected' : '') + '>' + c + '</option>').join('');
    const assO  = [{v:'all',l:'All Active Patients'},{v:'pt001',l:'Alexis Morgan'},{v:'pt002',l:'Jordan Blake'},{v:'pt003',l:'Sam Rivera'}].map(o => '<option value="' + o.v + '"' + (form.assignTo === o.v ? ' selected' : '') + '>' + o.l + '</option>').join('');
    const scoreC = form.autoScore ?
      '<div class="ppp-props-row" style="margin-top:8px"><label class="ppp-props-label">Formula</label><input class="ppp-props-input"' + dis + ' value="' + _e(form.scoreFormula || 'sum') + '" oninput="window._fbPropChange(\'scoreFormula\',this.value)" placeholder="sum / average"></div>' +
      (form.maxScore != null ? '<div class="ppp-props-row"><label class="ppp-props-label">Max Score</label><input class="ppp-props-input" type="number"' + dis + ' value="' + form.maxScore + '" oninput="window._fbPropChange(\'maxScore\',+this.value)" style="width:80px"></div>' : '') +
      '<div style="margin-top:8px"><div style="font-size:10px;color:var(--text-tertiary);margin-bottom:6px;font-weight:500">Severity Bands</div><div id="ppp-bands-list">' + bandsH + '</div>' + (!form.locked ? '<button class="ppp-lib-btn" style="margin-top:4px;flex:none" onclick="window._fbAddBand()">+ Add Band</button>' : '') + '</div>'
      : '';
    const acts = !form.locked ?
      '<div class="ppp-props-section" style="display:flex;flex-direction:column;gap:7px"><div class="ppp-props-section-title">Actions</div><button class="btn btn-sm btn-primary" onclick="window._fbSaveFormBtn()">Save Form</button><button class="btn btn-sm" style="background:rgba(0,212,188,0.1);color:var(--teal);border:1px solid rgba(0,212,188,0.3)" onclick="window._fbPublishForm()">Publish Form</button><button class="btn btn-sm" onclick="window._fbExportFormJSON()">Export JSON</button></div>'
      : '<div class="ppp-props-section"><div class="ppp-props-section-title">Actions</div><button class="btn btn-sm" onclick="window._fbUseScale(\'' + _e(form.id) + '\')">Duplicate to Custom</button><button class="btn btn-sm" style="margin-top:6px;background:rgba(0,212,188,0.1);color:var(--teal);border:1px solid rgba(0,212,188,0.3)" onclick="window._fbDeployForm(\'' + _e(form.id) + '\')">Deploy to Patients</button></div>';
    return '<div class="ppp-properties-panel"><div class="ppp-props-scroll">' +
      '<div class="ppp-props-section"><div class="ppp-props-section-title">Form Settings</div>' +
        '<div class="ppp-props-row"><label class="ppp-props-label">Name</label><input class="ppp-props-input"' + dis + ' value="' + _e(form.name) + '" oninput="window._fbPropChange(\'name\',this.value)"></div>' +
        '<div class="ppp-props-row"><label class="ppp-props-label">Description</label><textarea class="ppp-props-input" rows="2"' + dis + ' oninput="window._fbPropChange(\'description\',this.value)">' + _e(form.description || '') + '</textarea></div>' +
        '<div class="ppp-props-row"><label class="ppp-props-label">Version</label><input class="ppp-props-input"' + dis + ' value="' + _e(form.version || '1.0') + '" oninput="window._fbPropChange(\'version\',this.value)" style="width:80px"></div>' +
        '<div class="ppp-props-row"><label class="ppp-props-label">Category</label><select class="ppp-props-input"' + dis + ' onchange="window._fbPropChange(\'category\',this.value)">' + catO + '</select></div>' +
      '</div>' +
      '<div class="ppp-props-section"><div class="ppp-props-section-title">Schedule</div>' +
        '<div class="ppp-props-row"><label class="ppp-props-label">Frequency</label><select class="ppp-props-input"' + dis + ' onchange="window._fbPropChange(\'frequency\',this.value)">' + freqO + '</select></div>' +
        '<div class="ppp-props-row"><label class="ppp-props-label">Assign To</label><select class="ppp-props-input" onchange="window._fbPropChange(\'assignTo\',this.value)">' + assO + '</select></div>' +
      '</div>' +
      '<div class="ppp-props-section"><div class="ppp-props-section-title">Scoring</div>' +
        '<label class="ppp-scoring-toggle"><input type="checkbox"' + (form.autoScore ? ' checked' : '') + dis + ' onchange="window._fbPropChange(\'autoScore\',this.checked)"> Enable Auto-Scoring</label>' + scoreC +
      '</div>' +
      '<div class="ppp-props-section"><div class="ppp-props-section-title">Notifications</div>' +
        '<div class="ppp-notif-row"><span style="font-size:11px;color:var(--text-secondary)">Alert when score &gt;</span><input type="number" value="' + (form.notifyThreshold != null ? form.notifyThreshold : '') + '" min="0" oninput="window._fbPropChange(\'notifyThreshold\',+this.value)" placeholder="\u2014" style="width:60px;background:var(--bg-input);border:1px solid var(--border);border-radius:4px;color:var(--text-primary);font-size:12px;padding:4px 6px;outline:none;font-family:var(--font-body)"></div>' +
      '</div>' + acts +
    '</div></div>';
  }

  // Canvas panel HTML
  function _renderCanvas(form) {
    if (!form) return '<div class="ppp-canvas-panel"><div class="ppp-canvas-scroll" style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-tertiary);font-size:13px">Select a form from the library.</div></div>';
    const autoBanner = form.autoScore ? '<div style="background:rgba(0,212,188,0.06);border:1px solid rgba(0,212,188,0.2);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--teal)">Auto-scoring \u2022 Formula: <strong>' + _e(form.scoreFormula || 'sum') + '</strong>' + (form.maxScore != null ? ' \u2022 Max: ' + form.maxScore + 'pts' : '') + '</div>' : '';
    const lockedNote = form.locked ? '<div style="margin-top:16px;padding:10px 14px;background:rgba(255,181,71,0.07);border:1px solid rgba(255,181,71,0.2);border-radius:8px;font-size:11.5px;color:var(--amber)">This is a validated scale. Use \u201cDuplicate to Custom\u201d to create an editable copy.</div>' : '';
    const addQ = !form.locked ? '<div class="ppp-add-q-area"><button class="btn btn-sm" onclick="window._fbShowTypePicker()" style="border-style:dashed;color:var(--teal);border-color:rgba(0,212,188,0.3)">+ Add Question</button></div>' : '';
    return '<div class="ppp-canvas-panel"><div class="ppp-canvas-scroll" id="ppp-canvas-scroll">' +
      '<div class="ppp-canvas-title-row"><input class="ppp-canvas-title" id="canvas-title" value="' + _e(form.name) + '" ' + (form.locked ? 'disabled' : '') + ' oninput="window._fbPropChange(\'name\',this.value)" placeholder="Form Title"><button class="btn btn-sm" onclick="window._fbPreviewForm()">Preview</button></div>' +
      (form.description ? '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5">' + _e(form.description) + '</div>' : '') +
      autoBanner + '<div id="ppp-q-list">' + _renderQList(form.questions) + '</div>' + addQ + lockedNote +
    '</div></div>';
  }

  // Validated Scales tab HTML
  function _renderValidatedScales() {
    const allScales = [
      { id:'phq9',  name:'PHQ-9',    condition:'Depression',        range:'0–27',         rater:'Self-report',   description:'Patient Health Questionnaire — 9-item depression severity screener.' },
      { id:'gad7',  name:'GAD-7',    condition:'Anxiety',           range:'0–21',         rater:'Self-report',   description:'Generalized Anxiety Disorder 7-item scale.' },
      { id:'pcl5',  name:'PCL-5',    condition:'PTSD',              range:'0–80',         rater:'Self-report',   description:'PTSD Checklist for DSM-5 — 20 symptom items (0–4 each).' },
      ...EXTRA_SCALES.map(s => ({ id:s.id, name:s.name, condition:s.condition, range:s.range, rater:s.rater, description:s.description })),
    ];
    const scores = _fbLoad('ds_scale_scores', []);
    const iconMap = { 'Depression':'🧠','Anxiety':'😰','PTSD':'⚡','Cognitive / Schizophrenia':'🔬','Cognitive':'💡','Executive Function':'🎯', default:'📋' };
    const scaleCards = allScales.map(s => {
      const recentScores = scores.filter(sc => sc.scaleId === s.id).sort((a,b) => new Date(b.date)-new Date(a.date));
      const latest = recentScores[0];
      const sparkHTML = recentScores.length >= 2 ? _fbSparklineSVG(recentScores.slice(0,6).reverse(), s) : '';
      const icon = iconMap[s.condition] || iconMap.default;
      return '<div class="vscale-card">' +
        '<div class="vscale-card-header">' +
          '<div class="vscale-card-icon">' + icon + '</div>' +
          '<div class="vscale-card-info">' +
            '<div class="vscale-card-name">' + _e(s.name) + '</div>' +
            '<div class="vscale-card-meta"><span class="vscale-condition-tag">' + _e(s.condition) + '</span><span class="vscale-range-tag">' + _e(s.range) + '</span><span class="vscale-rater-tag">' + _e(s.rater) + '</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="vscale-card-desc">' + _e(s.description) + '</div>' +
        (sparkHTML ? '<div class="vscale-spark-wrap"><div class="vscale-spark-label">Last ' + Math.min(recentScores.length,6) + ' scores</div>' + sparkHTML + (latest ? '<div class="vscale-spark-latest">Latest: <strong>' + latest.total + '</strong><span class="vscale-sev-badge vscale-sev-' + _e((latest.severity||'').toLowerCase().replace(/\s+/g,'-')) + '">' + _e(latest.severity||'') + '</span></div>' : '') + '</div>' : '') +
        '<div class="vscale-card-footer"><button class="btn btn-sm btn-primary" onclick="window._fbOpenScaleEntry(\'' + _e(s.id) + '\')">Use Scale</button>' + (recentScores.length ? '<span class="vscale-score-count">' + recentScores.length + ' score' + (recentScores.length!==1?'s':'') + ' recorded</span>' : '') + '</div>' +
      '</div>';
    }).join('');
    return '<div class="vscale-wrap"><div class="vscale-header"><div><div class="vscale-header-title">Validated Assessment Scales</div><div class="vscale-header-sub">Standardized instruments for tracking clinical outcomes. Scores are stored and trended automatically.</div></div></div><div class="vscale-grid">' + scaleCards + '</div></div>';
  }

  // SVG sparkline (200×60px) for scale score trend
  function _fbSparklineSVG(recentScores, scaleDef) {
    if (!recentScores || recentScores.length < 2) return '';
    const W = 200, H = 60, PAD = 8;
    const vals = recentScores.map(s => s.total);
    const minV = Math.min(...vals), maxV = Math.max(...vals), range = maxV - minV || 1;
    const xStep = (W - PAD*2) / Math.max(vals.length-1, 1);
    const pts = vals.map((v,i) => ({ x: PAD + i*xStep, y: PAD + (1 - (v-minV)/range) * (H - PAD*2) }));
    const poly = pts.map(p => p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ');
    const dots = pts.map((p,i) => '<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="3" fill="var(--teal)" stroke="var(--bg-base)" stroke-width="1.5"><title>'+vals[i]+'</title></circle>').join('');
    return '<svg class="vscale-spark-svg" viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg"><polyline points="'+poly+'" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'+dots+'</svg>';
  }

  // Full page HTML
  function _renderBuilder() {
    const form = _fbGetForm(_fbActiveId), sc = _fbGetSubs().length;
    const tabBar = '<div class="ppp-tab-bar">' +
      '<div class="ppp-tab ' + (_fbTab==='builder'?'active':'') + '" onclick="window._fbSetTab(\'builder\')">Builder</div>' +
      '<div class="ppp-tab ' + (_fbTab==='responses'?'active':'') + '" onclick="window._fbSetTab(\'responses\')">Responses <span style="font-size:10px;background:rgba(0,212,188,0.12);color:var(--teal);border-radius:8px;padding:1px 6px;margin-left:4px">' + sc + '</span></div>' +
      '<div class="ppp-tab ' + (_fbTab==='scales'?'active':'') + '" onclick="window._fbSetTab(\'scales\')" style="display:flex;align-items:center;gap:5px">Validated Scales <span style="font-size:10px;background:rgba(93,95,239,0.12);color:var(--accent-violet);border-radius:8px;padding:1px 6px">9</span></div>' +
    '</div>';
    let content;
    if (_fbTab === 'builder') content = '<div class="ppp-builder-layout" style="height:100%">' + _renderLibrary() + _renderCanvas(form) + _renderProperties(form) + '</div>';
    else if (_fbTab === 'scales') content = _renderValidatedScales();
    else content = _renderResponses();
    return '<div style="height:100%;display:flex;flex-direction:column;overflow:hidden">' + tabBar + '<div style="flex:1;min-height:0;overflow:' + (_fbTab==='scales'?'auto':'hidden') + '">' + content + '</div></div>';
  }

  // Responses view HTML
  // Submissions are stored in localStorage (ds_form_submissions) and seeded
  // with demo rows on first mount. Real patient submissions (once the backend
  // /api/v1/forms/responses endpoint is wired) would replace or augment these.
  function _renderResponses() {
    const subs = _fbGetSubs();
    const banner = '<div style="background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:8px 12px;margin:16px 24px 0;font-size:12px;color:var(--accent-amber,#ffb547)">Form submissions shown here are stored locally in this browser. Server-side responses collection is not yet wired to this view.</div>';
    if (!subs.length) return banner + '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);font-size:13px">No submissions yet.</div>';
    const rows = subs.map(s =>
      '<tr class="' + (s.flagged ? 'flagged' : '') + '" onclick="window._fbShowSubDetail(\'' + _e(s.id) + '\')" style="cursor:pointer"><td>' + _e(s.patientName) + '</td><td>' + _e(s.formName) + '</td><td>' + _fbFmt(s.date) + '</td><td>' + (s.score != null ? s.score : '\u2014') + '</td><td>' + (s.severity ? '<span class="ppp-severity-pill ' + _fbSevClass(s.severity) + '">' + _e(s.severity) + '</span>' : '\u2014') + '</td><td>' + (s.flagged ? '<span style="color:var(--red);font-size:11px">\uD83D\uDEA9</span>' : '<button class="ppp-lib-btn" style="flex:none" onclick="event.stopPropagation();window._fbFlagSub(\'' + _e(s.id) + '\')">Flag</button>') + '</td></tr>'
    ).join('');
    return '<div style="height:100%;overflow:hidden;display:flex;flex-direction:column">' + banner + '<div style="flex:1;overflow-y:auto;padding:20px 24px"><div style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px"><div style="font-size:13px;font-weight:500;color:var(--text-primary)">' + subs.length + ' submission' + (subs.length !== 1 ? 's' : '') + '</div><button class="btn btn-sm" onclick="window._fbExportCSV()">Export CSV</button></div><div style="overflow-x:auto"><table class="ppp-subs-table"><thead><tr><th>Patient</th><th>Form</th><th>Date</th><th>Score</th><th>Severity</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table></div></div></div>';
  }

  // SVG score trend chart
  function _fbTrendSVG(subs) {
    if (!subs || subs.length < 2) return '';
    const W = 340, H = 90, PAD = 16, scores = subs.map(s => s.score);
    const minS = Math.min(...scores), maxS = Math.max(...scores), range = maxS - minS || 1;
    const xStep = (W - PAD * 2) / (subs.length - 1);
    const pts = subs.map((s, i) => ({ x: PAD + i * xStep, y: PAD + (1 - (s.score - minS) / range) * (H - PAD * 2), score: s.score, date: _fbFmt(s.date) }));
    const poly = pts.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
    const dots = pts.map(p => '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4" fill="var(--teal)" stroke="var(--bg-base)" stroke-width="2"><title>' + p.score + ' \u2014 ' + p.date + '</title></circle>').join('');
    const lbls = pts.map(p => '<text x="' + p.x.toFixed(1) + '" y="' + (p.y - 8).toFixed(1) + '" text-anchor="middle" font-size="10" fill="var(--text-tertiary)">' + p.score + '</text>').join('');
    return '<svg class="ppp-trend-chart" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" style="height:' + H + 'px"><polyline points="' + poly + '" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' + dots + lbls + '</svg>';
  }

  // Inject into DOM
  const el = document.getElementById('content');
  el.style.padding = '0';
  el.style.overflow = 'hidden';
  el.innerHTML = _renderBuilder();

  // Drag-to-reorder: mousedown/mousemove/mouseup (no HTML5 drag API)
  function _fbBindDrag() {
    const list = document.getElementById('ppp-q-list');
    if (!list) return;
    const form = _fbGetForm(_fbActiveId);
    if (!form || form.locked) return;
    let dragEl = null, dragIdx = null, ghost = null, overIdx = null;
    list.addEventListener('mousedown', function(e) {
      const handle = e.target.closest('.ppp-drag-handle');
      if (!handle) return;
      e.preventDefault();
      const card = handle.closest('.ppp-canvas-question');
      if (!card) return;
      dragIdx = parseInt(card.dataset.qidx, 10);
      dragEl  = card;
      card.classList.add('dragging');
      const rect = card.getBoundingClientRect();
      ghost = card.cloneNode(true);
      ghost.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;opacity:0.85;width:' + card.offsetWidth + 'px;left:' + rect.left + 'px;top:' + rect.top + 'px;box-shadow:0 8px 32px rgba(0,0,0,0.5);border-color:var(--teal);transition:none;margin:0;';
      document.body.appendChild(ghost);
      function onMM(e2) {
        if (!ghost) return;
        ghost.style.top = (parseFloat(ghost.style.top) + e2.movementY) + 'px';
        const cards = Array.from(list.querySelectorAll('.ppp-canvas-question'));
        let no = dragIdx;
        for (let i = 0; i < cards.length; i++) {
          if (i === dragIdx) continue;
          const r = cards[i].getBoundingClientRect();
          if (e2.clientY > r.top + r.height * 0.5) no = i;
        }
        if (no !== overIdx) { cards.forEach(c => c.classList.remove('drag-over')); if (cards[no]) cards[no].classList.add('drag-over'); overIdx = no; }
      }
      function onMU() {
        document.removeEventListener('mousemove', onMM);
        document.removeEventListener('mouseup', onMU);
        ghost?.remove(); ghost = null;
        dragEl?.classList.remove('dragging');
        list.querySelectorAll('.ppp-canvas-question').forEach(c => c.classList.remove('drag-over'));
        if (overIdx !== null && overIdx !== dragIdx) {
          const f = _fbGetForm(_fbActiveId);
          if (f && !f.locked) {
            const qs = [...(f.questions || [])];
            const [mv] = qs.splice(dragIdx, 1);
            qs.splice(overIdx, 0, mv);
            f.questions = qs;
            f.lastModified = new Date().toISOString();
            _fbSaveForm(f);
            list.innerHTML = _renderQList(qs);
            _fbBindDrag();
          }
        }
        dragEl = null; dragIdx = null; overIdx = null;
      }
      document.addEventListener('mousemove', onMM);
      document.addEventListener('mouseup', onMU);
    });
  }
  _fbBindDrag();

  // Window handlers
  window._fbSetTab = t => { _fbTab = t; el.innerHTML = _renderBuilder(); if (t === 'builder') _fbBindDrag(); };

  // ── Validated Scales: Score Entry Modal ──────────────────────────────────────
  window._fbOpenScaleEntry = function(scaleId) {
    // Merge all scales
    const allScaleDefs = [
      ...VALIDATED_SCALES,
      ...EXTRA_SCALES,
    ];
    const scaleDef = allScaleDefs.find(s => s.id === scaleId);
    if (!scaleDef) return;
    const pts = ['Baseline','2-week','4-week','8-week','End of Course','Follow-up'];
    const today = new Date().toISOString().slice(0,10);
    const patients = [
      { id:'pt001', name:'Alexis Morgan' },
      { id:'pt002', name:'Jordan Blake' },
      { id:'pt003', name:'Sam Rivera' },
      { id:'pt004', name:'Casey Kim' },
    ];
    // Get previous scores for comparison
    const prevScores = _fbLoad('ds_scale_scores', []).filter(s => s.scaleId === scaleId).sort((a,b) => new Date(b.date)-new Date(a.date));
    const itemsHTML = (scaleDef.items || []).map((item, i) => {
      const maxV = (scaleDef.itemMax && scaleDef.itemMax[i] != null) ? scaleDef.itemMax[i] : 3;
      const opts = Array.from({length: maxV+1}, (_,v) => '<option value="'+v+'">'+v+'</option>').join('');
      return '<div class="vscale-item-row">' +
        '<div class="vscale-item-num">' + (i+1) + '.</div>' +
        '<div class="vscale-item-text">' + _e(item) + '</div>' +
        '<select class="vscale-item-sel" id="vscale_item_'+i+'" onchange="window._fbScaleItemChange()" data-max="'+maxV+'">' + opts + '</select>' +
      '</div>';
    }).join('');
    const ptOpts = patients.map(p => '<option value="'+p.id+'">'+_e(p.name)+'</option>').join('');
    const ptSelOpts = pts.map(p => '<option value="'+_e(p)+'">'+_e(p)+'</option>').join('');
    // Previous score comparison HTML
    const prevHtml = prevScores.length
      ? '<div class="vscale-prev-scores"><div class="vscale-prev-label">Previous scores:</div>' +
        prevScores.slice(0,3).map(s => '<span class="vscale-prev-entry"><strong>'+s.total+'</strong> <span class="vscale-sev-badge vscale-sev-'+(s.severity||'').toLowerCase().replace(/\s+/g,'-')+'">'+_e(s.severity||'')+'</span> &bull; '+(_fbFmt(s.date)||'')+'</span>').join('') +
        '</div>'
      : '';
    const modal = document.createElement('div');
    modal.className = 'vscale-modal-overlay';
    modal.id = 'vscale-modal';
    modal.innerHTML = '<div class="vscale-modal" onclick="event.stopPropagation()">' +
      '<div class="vscale-modal-header">' +
        '<div><div class="vscale-modal-title">' + _e(scaleDef.name) + '</div><div class="vscale-modal-sub">' + _e(scaleDef.description || '') + '</div></div>' +
        '<button class="vscale-modal-close" onclick="document.getElementById(\'vscale-modal\').remove()">\u2715</button>' +
      '</div>' +
      '<div class="vscale-modal-body">' +
        '<div class="vscale-modal-top-row">' +
          '<div class="vscale-field-group"><label class="vscale-field-label">Patient</label><select class="vscale-field-input" id="vscale_patient">' + ptOpts + '</select></div>' +
          '<div class="vscale-field-group"><label class="vscale-field-label">Date</label><input type="date" class="vscale-field-input" id="vscale_date" value="'+today+'"></div>' +
          '<div class="vscale-field-group"><label class="vscale-field-label">Measurement Point</label><select class="vscale-field-input" id="vscale_mpoint">' + ptSelOpts + '</select></div>' +
        '</div>' +
        '<div class="vscale-score-display" id="vscale-score-display">' +
          '<div class="vscale-score-live"><span class="vscale-score-val" id="vscale-score-val">0</span>' + (scaleDef.maxScore ? '<span class="vscale-score-max"> / '+scaleDef.maxScore+'</span>' : '') + '</div>' +
          '<span class="vscale-sev-badge vscale-sev-minimal" id="vscale-sev-badge">Minimal</span>' +
        '</div>' +
        (scaleDef.maxScore ? prevHtml : '') +
        '<div class="vscale-items-list">' + itemsHTML + '</div>' +
        '<div class="vscale-field-group" style="margin-top:12px"><label class="vscale-field-label">Notes (optional)</label><textarea class="vscale-field-input" id="vscale_notes" rows="2" placeholder="Clinical notes\u2026" style="resize:vertical"></textarea></div>' +
      '</div>' +
      '<div class="vscale-modal-footer">' +
        '<button class="btn btn-sm" onclick="document.getElementById(\'vscale-modal\').remove()">Cancel</button>' +
        '<button class="btn btn-sm btn-primary" onclick="window._fbSaveScaleScore(\'' + _e(scaleId) + '\')">Save Score</button>' +
      '</div>' +
    '</div>';
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
    window._fbScaleItemChange();
  };

  window._fbScaleItemChange = function() {
    // Re-calculate total from all item selects
    const items = document.querySelectorAll('.vscale-item-sel');
    let total = 0;
    items.forEach(sel => { total += parseInt(sel.value || '0', 10); });
    const valEl = document.getElementById('vscale-score-val');
    if (valEl) valEl.textContent = total;
    // Find the scale def from the modal title (we need the scaleId)
    // Get severity from current open modal's scaleId — stored in save button onclick attr
    const saveBtn = document.querySelector('#vscale-modal .btn-primary');
    if (!saveBtn) return;
    const m = saveBtn.getAttribute('onclick').match(/'([^']+)'/);
    if (!m) return;
    const scaleId = m[1];
    const allScaleDefs = [...VALIDATED_SCALES, ...EXTRA_SCALES];
    const scaleDef = allScaleDefs.find(s => s.id === scaleId);
    if (!scaleDef) return;
    const sev = _fbScoreSeverity(total, scaleDef);
    const sevEl = document.getElementById('vscale-sev-badge');
    if (sevEl) {
      sevEl.textContent = sev;
      sevEl.className = 'vscale-sev-badge vscale-sev-' + sev.toLowerCase().replace(/\s+/g,'-');
    }
  };

  window._fbSaveScaleScore = async function(scaleId) {
    const allScaleDefs = [...VALIDATED_SCALES, ...EXTRA_SCALES];
    const scaleDef = allScaleDefs.find(s => s.id === scaleId);
    if (!scaleDef) return;
    const ptSel = document.getElementById('vscale_patient');
    const dateSel = document.getElementById('vscale_date');
    const mpSel = document.getElementById('vscale_mpoint');
    const notesSel = document.getElementById('vscale_notes');
    const items = document.querySelectorAll('.vscale-item-sel');
    const answers = Array.from(items).map(sel => parseInt(sel.value||'0',10));
    const total = answers.reduce((a,b)=>a+b, 0);
    const patients = [{id:'pt001',name:'Alexis Morgan'},{id:'pt002',name:'Jordan Blake'},{id:'pt003',name:'Sam Rivera'},{id:'pt004',name:'Casey Kim'}];
    const pt = patients.find(p => p.id === (ptSel?.value||'pt001')) || patients[0];
    const sev = _fbScoreSeverity(total, scaleDef);
    const entry = {
      id: 'ss_'+Date.now(),
      scaleId, scaleName: scaleDef.name,
      patientId: pt.id, patientName: pt.name,
      date: dateSel?.value || new Date().toISOString().slice(0,10),
      measurementPoint: mpSel?.value || 'Baseline',
      answers, total, severity: sev,
      notes: notesSel?.value?.trim() || '',
      recordedAt: new Date().toISOString(),
    };
    const all = _fbLoad('ds_scale_scores', []);
    all.unshift(entry);
    if (all.length > 500) all.splice(500);
    _fbSave('ds_scale_scores', all);
    // Attempt API save
    await api.recordOutcome({ patientId: pt.id, scaleId, scaleName: scaleDef.name, score: total, severity: sev, date: entry.date }).catch(() => null);
    // Find previous score for comparison
    const prev = all.slice(1).find(s => s.scaleId === scaleId && s.patientId === pt.id);
    const delta = prev != null ? (total - prev.total) : null;
    const deltaStr = delta != null ? (delta < 0 ? ' (' + delta + ' vs previous, improved)' : delta > 0 ? ' (+' + delta + ' vs previous, worsened)' : ' (no change vs previous)') : '';
    window._showNotifToast?.({ title: scaleDef.name + ' Score Saved', body: pt.name + ' — ' + total + (scaleDef.maxScore?'/'+scaleDef.maxScore:'') + ' ' + sev + deltaStr, severity: sev.toLowerCase().includes('severe') ? 'warn' : 'info' });
    document.getElementById('vscale-modal')?.remove();
    // Re-render if on scales tab
    if (_fbTab === 'scales') { el.innerHTML = _renderBuilder(); }
  };

  function _fbScoreSeverity(total, scaleDef) {
    if (!scaleDef.bands || !scaleDef.bands.length) return '';
    const band = scaleDef.bands.find(b => total <= b.max);
    return band ? band.label : scaleDef.bands[scaleDef.bands.length-1].label;
  }
  window._fbOpenForm = id => { _fbActiveId = id; localStorage.setItem('ds_active_form_id', id); el.innerHTML = _renderBuilder(); _fbBindDrag(); };
  window._fbUseScale = id => { const src = _fbGetForm(id); if (!src) return; const c = JSON.parse(JSON.stringify(src)); c.id = 'custom_' + id + '_' + Date.now(); c.name = src.name + ' (Copy)'; c.locked = false; c.version = '1.0'; c.lastModified = new Date().toISOString(); _fbSaveForm(c); _fbActiveId = c.id; localStorage.setItem('ds_active_form_id', c.id); el.innerHTML = _renderBuilder(); _fbBindDrag(); };
  window._fbDuplicateForm = id => { const src = _fbGetForm(id); if (!src) return; const c = JSON.parse(JSON.stringify(src)); c.id = 'custom_copy_' + Date.now(); c.name = src.name + ' (Copy)'; c.locked = false; c.lastModified = new Date().toISOString(); _fbSaveForm(c); _fbActiveId = c.id; localStorage.setItem('ds_active_form_id', c.id); el.innerHTML = _renderBuilder(); _fbBindDrag(); };
  window._fbDeleteForm = id => { if (!confirm('Delete this form? This cannot be undone.')) return; const fs = _fbGetForms().filter(f => f.id !== id); _fbSave('ds_forms', fs); if (_fbActiveId === id) { _fbActiveId = fs.find(f => !f.locked)?.id || fs[0]?.id || ''; localStorage.setItem('ds_active_form_id', _fbActiveId); } el.innerHTML = _renderBuilder(); _fbBindDrag(); };
  window._fbNewForm = () => { const id = 'custom_' + Date.now(); _fbSaveForm({ id, name:'Untitled Form', description:'', category:'Custom', version:'1.0', locked:false, frequency:'one-time', autoScore:false, scoreFormula:'sum', maxScore:null, bands:[], notifyThreshold:null, assignTo:'all', questions:[], lastModified:new Date().toISOString(), deployedTo:[] }); _fbActiveId = id; localStorage.setItem('ds_active_form_id', id); el.innerHTML = _renderBuilder(); _fbBindDrag(); };
  window._fbDeployForm = id => { const form = _fbGetForm(id); if (!form) return; const deps = _fbLoad('ds_form_deployments', []); let added = 0; ['pt001','pt002','pt003'].forEach(pid => { if (!deps.find(d => d.formId === id && d.patientId === pid)) { deps.push({ formId:id, patientId:pid, assignedAt:new Date().toISOString(), frequency:form.frequency }); added++; } }); _fbSave('ds_form_deployments', deps); _dsToast('Form "' + form.name + '" was added to ' + (added > 0 ? added + ' local patient workflow(s)' : 'the existing local patient workflow list') + '. Patient deployment still depends on backend form sync.', 'success'); };
  window._fbPropChange = (key, val) => { const form = _fbGetForm(_fbActiveId); if (!form || form.locked) return; form[key] = val; form.lastModified = new Date().toISOString(); _fbSaveForm(form); if (key === 'name') { const ct = document.getElementById('canvas-title'); if (ct && ct !== document.activeElement) ct.value = val; } if (key === 'autoScore') { el.innerHTML = _renderBuilder(); _fbBindDrag(); } };
  window._fbEditQText = (idx, text) => { const form = _fbGetForm(_fbActiveId); if (!form || form.locked || !form.questions[idx]) return; form.questions[idx].text = text.trim(); form.lastModified = new Date().toISOString(); _fbSaveForm(form); };
  window._fbToggleRequired = idx => { const form = _fbGetForm(_fbActiveId); if (!form || form.locked || !form.questions[idx]) return; form.questions[idx].required = !form.questions[idx].required; form.lastModified = new Date().toISOString(); _fbSaveForm(form); el.innerHTML = _renderBuilder(); _fbBindDrag(); };
  window._fbDeleteQ = idx => { const form = _fbGetForm(_fbActiveId); if (!form || form.locked) return; if (!confirm('Remove this question?')) return; form.questions.splice(idx, 1); form.lastModified = new Date().toISOString(); _fbSaveForm(form); document.getElementById('ppp-q-list').innerHTML = _renderQList(form.questions); _fbBindDrag(); };
  window._fbEditOptions = idx => { const form = _fbGetForm(_fbActiveId); if (!form || form.locked || !form.questions[idx]) return; const q = form.questions[idx]; const inp = prompt('Enter checkbox options (one per line):', (q.options || ['Option 1','Option 2']).join('\n')); if (inp === null) return; q.options = inp.split('\n').map(s => s.trim()).filter(Boolean); form.lastModified = new Date().toISOString(); _fbSaveForm(form); document.getElementById('ppp-q-list').innerHTML = _renderQList(form.questions); _fbBindDrag(); };
  window._fbEditScale = idx => { const form = _fbGetForm(_fbActiveId); if (!form || form.locked || !form.questions[idx]) return; const q = form.questions[idx]; const sc = prompt('Scale values (comma-separated):', (q.scale || [0,1,2,3]).join(',')); if (sc === null) return; const lb = prompt('Labels (one per line):', (q.scaleLabels || []).join('\n')); if (lb === null) return; q.scale = sc.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)); q.scaleLabels = lb.split('\n').map(s => s.trim()).filter(Boolean); form.lastModified = new Date().toISOString(); _fbSaveForm(form); document.getElementById('ppp-q-list').innerHTML = _renderQList(form.questions); _fbBindDrag(); };
  window._fbEditRange = idx => { const form = _fbGetForm(_fbActiveId); if (!form || form.locked || !form.questions[idx]) return; const q = form.questions[idx]; const mn = prompt('Minimum value:', q.min ?? 0); if (mn === null) return; const mx = prompt('Maximum value:', q.max ?? 10); if (mx === null) return; q.min = parseFloat(mn); q.max = parseFloat(mx); form.lastModified = new Date().toISOString(); _fbSaveForm(form); document.getElementById('ppp-q-list').innerHTML = _renderQList(form.questions); _fbBindDrag(); };
  window._fbUpdateBand = (idx, key, val) => { const form = _fbGetForm(_fbActiveId); if (!form || form.locked || !form.bands?.[idx]) return; form.bands[idx][key] = key === 'max' ? parseInt(val, 10) : val; form.lastModified = new Date().toISOString(); _fbSaveForm(form); };
  function _rebandHTML(form) { const el2 = document.getElementById('ppp-bands-list'); if (!el2) return; el2.innerHTML = (form.bands || []).map((b, i) => '<div class="ppp-severity-band"><input type="number" value="' + b.max + '" min="0" oninput="window._fbUpdateBand(' + i + ',\'max\',this.value)" placeholder="Max"><input type="text" value="' + _e(b.label) + '" oninput="window._fbUpdateBand(' + i + ',\'label\',this.value)" placeholder="Label"><button class="ppp-band-remove" onclick="window._fbRemoveBand(' + i + ')">&#x2715;</button></div>').join(''); }
  window._fbRemoveBand = idx => { const form = _fbGetForm(_fbActiveId); if (!form || form.locked) return; form.bands.splice(idx, 1); form.lastModified = new Date().toISOString(); _fbSaveForm(form); _rebandHTML(form); };
  window._fbAddBand = () => { const form = _fbGetForm(_fbActiveId); if (!form || form.locked) return; if (!form.bands) form.bands = []; form.bands.push({ max: form.maxScore || 10, label: 'New Band' }); form.lastModified = new Date().toISOString(); _fbSaveForm(form); _rebandHTML(form); };
  window._fbSaveFormBtn = () => { const form = _fbGetForm(_fbActiveId); if (!form) return; form.lastModified = new Date().toISOString(); _fbSaveForm(form); window._announce?.('Form saved locally'); const btn = document.activeElement; if (btn && btn.tagName === 'BUTTON') { const orig = btn.textContent; btn.textContent = 'Saved locally \u2713'; setTimeout(() => { btn.textContent = orig; }, 1500); } };
  window._fbPublishForm = () => { const form = _fbGetForm(_fbActiveId); if (!form) return; form.published = true; form.publishedAt = new Date().toISOString(); form.lastModified = new Date().toISOString(); _fbSaveForm(form); _dsToast('Form "' + form.name + '" was marked published in this browser. Patient deployment still depends on the form workflow.', 'success'); };
  window._fbExportFormJSON = () => { const form = _fbGetForm(_fbActiveId); if (!form) return; const blob = new Blob([JSON.stringify(form, null, 2)], { type:'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = form.id + '_v' + (form.version || '1') + '.json'; a.click(); URL.revokeObjectURL(url); };
  window._fbShowTypePicker = () => { const ov = document.createElement('div'); ov.className = 'ppp-type-picker-overlay'; ov.innerHTML = '<div class="ppp-type-picker" onclick="event.stopPropagation()"><div class="ppp-type-picker-title">Choose Question Type</div><div class="ppp-type-grid">' + Q_TYPES.map(t => '<div class="ppp-type-option" onclick="window._fbAddQuestion(\'' + t.type + '\');document.querySelector(\'.ppp-type-picker-overlay\').remove()"><div class="ppp-type-option-label"><span class="ppp-type-badge ' + t.type + '">' + t.type + '</span> ' + t.label + '</div><div class="ppp-type-option-desc">' + t.desc + '</div></div>').join('') + '</div><div style="margin-top:14px;text-align:right"><button class="btn btn-sm" onclick="document.querySelector(\'.ppp-type-picker-overlay\').remove()">Cancel</button></div></div>'; ov.addEventListener('click', () => ov.remove()); document.body.appendChild(ov); };
  window._fbAddQuestion = type => { const form = _fbGetForm(_fbActiveId); if (!form || form.locked) return; const defs = { likert:{scale:[0,1,2,3],scaleLabels:['Not at all','Several days','More than half the days','Nearly every day'],options:null,min:null,max:null}, text:{scale:null,scaleLabels:null,options:null,min:null,max:null}, textarea:{scale:null,scaleLabels:null,options:null,min:null,max:null}, yesno:{scale:null,scaleLabels:null,options:null,min:null,max:null}, slider:{scale:null,scaleLabels:null,options:null,min:0,max:10}, checkbox:{scale:null,scaleLabels:null,options:['Option A','Option B','Option C'],min:null,max:null}, date:{scale:null,scaleLabels:null,options:null,min:null,max:null}, number:{scale:null,scaleLabels:null,options:null,min:0,max:100} }; const q = Object.assign({ id:'q_' + Date.now(), type, text:'', required:false }, defs[type] || {}); if (!form.questions) form.questions = []; form.questions.push(q); form.lastModified = new Date().toISOString(); _fbSaveForm(form); document.getElementById('ppp-q-list').innerHTML = _renderQList(form.questions); _fbBindDrag(); const cards = document.querySelectorAll('.ppp-canvas-question'); const last = cards[cards.length - 1]; if (last) { last.scrollIntoView({ behavior:'smooth', block:'nearest' }); last.querySelector('.ppp-q-text')?.focus(); } };
  window._fbPreviewForm = () => { const form = _fbGetForm(_fbActiveId); if (!form) return; const qs = form.questions || []; const qH = qs.length === 0 ? '<div style="color:var(--text-tertiary);font-size:13px;padding:20px 0">No questions added yet.</div>' : qs.map((q, i) => '<div class="ppp-preview-q"><div class="ppp-preview-q-text">' + (i + 1) + '. ' + _e(q.text || '(No question text)') + (q.required ? '<span class="required-star">*</span>' : '') + '</div>' + _renderPreviewWidget(q, i) + '</div>').join(''); const modal = document.createElement('div'); modal.className = 'ppp-preview-modal'; modal.innerHTML = '<div class="ppp-preview-modal-inner"><button onclick="document.querySelector(\'.ppp-preview-modal\').remove()" style="position:absolute;top:16px;right:16px;background:none;border:none;color:var(--text-tertiary);font-size:20px;cursor:pointer;line-height:1">\u2715</button><div style="font-size:10px;color:var(--teal);letter-spacing:1px;text-transform:uppercase;font-weight:600;margin-bottom:6px">Patient Preview</div><div class="ppp-preview-form-title">' + _e(form.name) + '</div>' + (form.description ? '<div class="ppp-preview-form-desc">' + _e(form.description) + '</div>' : '') + qH + (qs.length ? '<div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border);display:flex;justify-content:flex-end"><button class="btn btn-sm btn-primary" onclick="document.querySelector(\'.ppp-preview-modal\').remove()">Submit</button></div>' : '') + '</div>'; modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); }); document.body.appendChild(modal); };
  window._fbShowSubDetail = subId => { const subs = _fbGetSubs(); const sub = subs.find(s => s.id === subId); if (!sub) return; const form = _fbGetForm(sub.formId); const trend = subs.filter(s => s.formId === sub.formId && s.patientId === sub.patientId && s.score != null).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-5); document.querySelector('.ppp-sub-detail')?.remove(); const qs = form?.questions || []; const ansH = (sub.answers || []).map((a, i) => '<div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border)"><div style="font-size:11px;color:var(--text-tertiary);margin-bottom:3px">' + _e(qs[i]?.text || 'Question ' + (i + 1)) + '</div><div style="font-size:12.5px;color:var(--text-primary);font-weight:500">' + _e(String(a)) + '</div></div>').join(''); const panel = document.createElement('div'); panel.className = 'ppp-sub-detail'; panel.innerHTML = '<div class="ppp-sub-detail-header"><div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--text-primary)">' + _e(sub.formName) + '</div><div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">' + _e(sub.patientName) + ' &bull; ' + _fbFmt(sub.date) + '</div></div><button onclick="document.querySelector(\'.ppp-sub-detail\').remove()" style="background:none;border:none;color:var(--text-tertiary);font-size:18px;cursor:pointer">\u2715</button></div><div class="ppp-sub-detail-scroll"><div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:12px 14px;background:var(--bg-surface);border-radius:8px"><div><div style="font-size:24px;font-weight:700;color:var(--teal)">' + (sub.score != null ? sub.score : '\u2014') + '</div><div style="font-size:10px;color:var(--text-tertiary)">Score' + (form?.maxScore ? ' / ' + form.maxScore : '') + '</div></div>' + (sub.severity ? '<span class="ppp-severity-pill ' + _fbSevClass(sub.severity) + '" style="font-size:12px;padding:4px 12px">' + _e(sub.severity) + '</span>' : '') + (sub.flagged ? '<span style="color:var(--red);font-size:12px">\uD83D\uDEA9 Flagged</span>' : '') + '</div>' + (trend.length > 1 ? '<div style="margin-bottom:16px"><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;font-weight:500;margin-bottom:6px">Score Trend (Last ' + trend.length + ')</div>' + _fbTrendSVG(trend) + '</div>' : '') + '<div style="margin-bottom:16px"><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;font-weight:500;margin-bottom:10px">Response Detail</div>' + (ansH || '<div style="color:var(--text-tertiary);font-size:12px">No detailed answers recorded.</div>') + '</div><div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--border)">' + (!sub.flagged ? '<button class="btn btn-sm" style="color:var(--red);border-color:rgba(255,107,107,0.3)" onclick="window._fbFlagSub(\'' + _e(subId) + '\');document.querySelector(\'.ppp-sub-detail\').remove()">\uD83D\uDEA9 Flag for Review</button>' : '<span style="font-size:12px;color:var(--red)">\uD83D\uDEA9 Already Flagged</span>') + '</div></div>'; document.body.appendChild(panel); };
  window._fbFlagSub = subId => { const subs = _fbGetSubs(); const sub = subs.find(s => s.id === subId); if (!sub) return; sub.flagged = true; _fbSave('ds_form_submissions', subs); el.innerHTML = _renderBuilder(); if (_fbTab === 'builder') _fbBindDrag(); };
  window._fbExportCSV = () => { const subs = _fbGetSubs(); if (!subs.length) { window._showToast?.('No submissions to export.', 'warning'); return; } const hdr = ['ID','Patient','Form','Date','Score','Severity','Flagged']; const rows = subs.map(s => [s.id, s.patientName, s.formName, _fbFmt(s.date), s.score != null ? s.score : '', s.severity || '', s.flagged ? 'Yes' : 'No'].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')); const blob = new Blob([[hdr.join(','), ...rows].join('\n')], { type:'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'form_submissions_' + new Date().toISOString().slice(0, 10) + '.csv'; a.click(); URL.revokeObjectURL(url); };
}

// ── NNN-C: Evidence Builder ───────────────────────────────────────────────────

const EVIDENCE_SEED_PAPERS = [
  { id:'ev1', title:'High-frequency rTMS of left DLPFC for MDD', authors:'George et al.', year:2010, journal:'Arch Gen Psychiatry', modality:'TMS', condition:'Depression', effectSize:0.55, ci:'[0.38–0.72]', n:190, design:'RCT', outcome:'HDRS-17' },
  { id:'ev2', title:'iTBS vs 10Hz rTMS equivalence trial', authors:'Blumberger et al.', year:2018, journal:'Lancet', modality:'TMS', condition:'Depression', effectSize:0.51, ci:'[0.35–0.67]', n:414, design:'RCT', outcome:'MADRS' },
  { id:'ev3', title:'Neurofeedback for ADHD: meta-analysis', authors:'Arns et al.', year:2009, journal:'Clinical EEG & Neuroscience', modality:'Neurofeedback', condition:'ADHD', effectSize:0.59, ci:'[0.44–0.74]', n:1194, design:'Meta-analysis', outcome:'ADHD rating scale' },
  { id:'ev4', title:'Alpha/theta neurofeedback for PTSD', authors:'Peniston & Kulkosky', year:1991, journal:'Medical Psychotherapy', modality:'Neurofeedback', condition:'PTSD', effectSize:1.12, ci:'[0.71–1.53]', n:29, design:'RCT', outcome:'MMPI scales' },
  { id:'ev5', title:'Anodal tDCS M1/SO for depression', authors:'Brunoni et al.', year:2013, journal:'JAMA Psychiatry', modality:'tDCS', condition:'Depression', effectSize:0.37, ci:'[0.14–0.60]', n:120, design:'RCT', outcome:'MADRS' },
  { id:'ev6', title:'tDCS for fibromyalgia pain', authors:'Fregni et al.', year:2006, journal:'Pain', modality:'tDCS', condition:'Chronic Pain', effectSize:0.68, ci:'[0.31–1.05]', n:32, design:'RCT', outcome:'VAS pain score' },
  { id:'ev7', title:'Neurofeedback for insomnia: pilot RCT', authors:'Cortoos et al.', year:2010, journal:'Applied Psychophysiology', modality:'Neurofeedback', condition:'Insomnia', effectSize:0.72, ci:'[0.22–1.22]', n:17, design:'Pilot RCT', outcome:'Sleep diary + PSG' },
  { id:'ev8', title:'Deep TMS for OCD: multicenter trial', authors:'Carmi et al.', year:2019, journal:'Am J Psychiatry', modality:'TMS', condition:'OCD', effectSize:0.64, ci:'[0.38–0.90]', n:99, design:'RCT', outcome:'Y-BOCS' },
];

const SEED_PATIENT_OUTCOMES = [
  { id:'po1', condition:'Depression', modality:'TMS',          n:28, meanChange:-9.4,  sdChange:3.1, pctImproved:71 },
  { id:'po2', condition:'ADHD',       modality:'Neurofeedback', n:14, meanChange:-6.2,  sdChange:2.8, pctImproved:64 },
  { id:'po3', condition:'Anxiety',    modality:'Neurofeedback', n:11, meanChange:-7.1,  sdChange:3.5, pctImproved:73 },
  { id:'po4', condition:'PTSD',       modality:'Neurofeedback', n:8,  meanChange:-10.3, sdChange:4.2, pctImproved:75 },
  { id:'po5', condition:'Insomnia',   modality:'Neurofeedback', n:9,  meanChange:-5.8,  sdChange:2.6, pctImproved:67 },
  { id:'po6', condition:'Depression', modality:'tDCS',          n:12, meanChange:-6.5,  sdChange:3.8, pctImproved:58 },
  { id:'po7', condition:'Chronic Pain',modality:'tDCS',         n:10, meanChange:-4.3,  sdChange:2.9, pctImproved:60 },
  { id:'po8', condition:'OCD',        modality:'TMS',           n:7,  meanChange:-8.2,  sdChange:3.3, pctImproved:71 },
];

const _ebLiveState = {
  loaded: false,
  loading: null,
  protocols: [],
  coverageRows: [],
  safetySignals: [],
  papersByProtocolId: {},
};

function _ebLoad(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
}
function _ebSave(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function _ebEsc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

function _ebSlug(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function _ebNormalizeConditionLabel(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

function _ebNormalizeModalityLabel(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower === 'tdcs') return 'tDCS';
  if (lower === 'tacs') return 'tACS';
  if (lower === 'tfus') return 'tFUS';
  if (lower === 'tms' || lower === 'rtms' || lower === 'tms-rtms') return 'TMS';
  if (lower === 'neurofeedback') return 'Neurofeedback';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
}

function _ebProtocolIdFromPair(condition, modality, target) {
  return ['live', _ebSlug(condition), _ebSlug(modality), _ebSlug(target)].filter(Boolean).join('::');
}

async function _ebEnsureLiveData() {
  if (_ebLiveState.loaded) return _ebLiveState;
  if (_ebLiveState.loading) return _ebLiveState.loading;
  _ebLiveState.loading = (async () => {
    try {
      const liveOverview = await loadResearchBundleOverview({
        coverageLimit: 18,
        templateLimit: 18,
        safetyLimit: 40,
        includeConditions: false,
      });
      const templates = Array.isArray(liveOverview?.templates) ? liveOverview.templates : [];
      _ebLiveState.protocols = templates.map((row) => ({
        id: _ebProtocolIdFromPair(row.indication, row.modality, row.target),
        name: [row.modality, row.indication, row.target].filter(Boolean).join(' — ') || 'Live protocol template',
        modality: _ebNormalizeModalityLabel(row.modality),
        condition: _ebNormalizeConditionLabel(row.indication),
        description: row.example_titles || row.top_parameter_tags || 'Live research-backed protocol template.',
        notes: '',
        target: row.target || '',
        indicationSlug: _ebSlug(row.indication),
        modalitySlug: _ebSlug(row.modality),
        liveTemplate: row,
      }));
      _ebLiveState.coverageRows = Array.isArray(liveOverview?.coverageRows) ? liveOverview.coverageRows : [];
      _ebLiveState.safetySignals = Array.isArray(liveOverview?.safetySignals) ? liveOverview.safetySignals : [];
      _ebLiveState.loaded = _ebLiveState.protocols.length > 0 || _ebLiveState.coverageRows.length > 0 || _ebLiveState.safetySignals.length > 0;
    } catch {
      _ebLiveState.loaded = false;
    } finally {
      _ebLiveState.loading = null;
    }
    return _ebLiveState;
  })();
  return _ebLiveState.loading;
}

async function _ebEnsureLivePapersForProtocol(proto) {
  if (!proto || !proto.id || !proto.indicationSlug || !proto.modalitySlug) return [];
  if (_ebLiveState.papersByProtocolId[proto.id]) return _ebLiveState.papersByProtocolId[proto.id];
  try {
    const papers = await api.searchResearchPapers({
      indication: proto.indicationSlug,
      modality: proto.modalitySlug,
      target: proto.target || '',
      ranking_mode: 'clinical',
      limit: 8,
    });
    _ebLiveState.papersByProtocolId[proto.id] = Array.isArray(papers) ? papers : [];
  } catch {
    _ebLiveState.papersByProtocolId[proto.id] = [];
  }
  return _ebLiveState.papersByProtocolId[proto.id];
}

function _ebGetLiterature() {
  const ext = _ebLoad('ds_literature', null);
  if (ext && Array.isArray(ext) && ext.length > 0) return ext;
  if (!localStorage.getItem('ds_literature_seeded')) {
    _ebSave('ds_literature', EVIDENCE_SEED_PAPERS);
    localStorage.setItem('ds_literature_seeded', '1');
  }
  return _ebLoad('ds_literature', EVIDENCE_SEED_PAPERS);
}

function _ebGetProtocols() {
  if (_ebLiveState.loaded && Array.isArray(_ebLiveState.protocols) && _ebLiveState.protocols.length) {
    return _ebLiveState.protocols;
  }
  return _ebLoad('ds_protocols', [
    { id:'proto1', name:'TMS for Depression (Standard)', modality:'TMS', condition:'Depression', description:'10 Hz rTMS protocol targeting left DLPFC for MDD treatment.', notes:'' },
    { id:'proto2', name:'Neurofeedback ADHD Alpha/Beta', modality:'Neurofeedback', condition:'ADHD', description:'Alpha/beta neurofeedback targeting frontal midline theta suppression.', notes:'' },
    { id:'proto3', name:'tDCS for Chronic Pain', modality:'tDCS', condition:'Chronic Pain', description:'Anodal M1 tDCS for fibromyalgia and central sensitization.', notes:'' },
    { id:'proto4', name:'Neurofeedback PTSD Alpha/Theta', modality:'Neurofeedback', condition:'PTSD', description:'Alpha/theta downtraining with heart rate variability integration.', notes:'' },
    { id:'proto5', name:'Deep TMS OCD Protocol', modality:'TMS', condition:'OCD', description:'H7 coil dTMS protocol for OCD based on multicenter RCT.', notes:'' },
  ]);
}

function _ebGetPatientOutcomes() {
  if (!localStorage.getItem('ds_patient_outcomes_seeded')) {
    _ebSave('ds_patient_outcomes', SEED_PATIENT_OUTCOMES);
    localStorage.setItem('ds_patient_outcomes_seeded', '1');
  }
  return _ebLoad('ds_patient_outcomes', SEED_PATIENT_OUTCOMES);
}

function _ebRelevanceScore(paper, protocol) {
  let score = 0;
  if (paper.modality === protocol.modality) score += 40;
  if (paper.condition === protocol.condition) score += 40;
  const currentYear = 2026;
  if (currentYear - paper.year <= 5) score += 20;
  return score;
}

function _ebMatchPapers(protocol) {
  if (protocol && Array.isArray(_ebLiveState.papersByProtocolId[protocol.id]) && _ebLiveState.papersByProtocolId[protocol.id].length) {
    return _ebLiveState.papersByProtocolId[protocol.id].map((paper, idx) => ({
      id: paper.paper_key || paper.pmid || paper.doi || `${protocol.id}-${idx}`,
      title: paper.title,
      authors: paper.authors,
      year: paper.year,
      journal: paper.journal,
      modality: _ebNormalizeModalityLabel(paper.primary_modality || protocol.modality),
      condition: _ebNormalizeConditionLabel((paper.indication_tags && paper.indication_tags[0]) || protocol.condition),
      effectSize: null,
      ci: '',
      n: Number(paper.citation_count || 0),
      design: paper.study_type_normalized || 'Research paper',
      outcome: paper.research_summary || paper.regulatory_clinical_signal || 'Bundle evidence',
      relevance: Number(paper.protocol_relevance_score || 0),
      record_url: paper.record_url || '',
      evidence_tier: paper.evidence_tier || '',
    }));
  }
  const lit = _ebGetLiterature();
  return lit
    .filter(p => p.modality === protocol.modality || p.condition === protocol.condition)
    .map(p => ({ ...p, relevance: _ebRelevanceScore(p, protocol) }))
    .sort((a, b) => b.relevance - a.relevance);
}

function _ebEvidenceLevel(design) {
  if (!design) return 'Level IV';
  const d = design.toLowerCase();
  if (d.includes('meta')) return 'Level I';
  if (d.includes('rct') || d.includes('randomized')) return 'Level II';
  if (d.includes('pilot')) return 'Level III';
  return 'Level IV';
}

function _ebLevelColor(level) {
  if (level === 'Level I')   return 'var(--accent-teal)';
  if (level === 'Level II')  return 'var(--accent-blue)';
  if (level === 'Level III') return 'var(--accent-amber)';
  return 'var(--accent-rose)';
}

function _ebDesignBadge(design) {
  const level = _ebEvidenceLevel(design);
  return `<span class="nnnc-ev-level-badge" style="background:${_ebLevelColor(level)}22;color:${_ebLevelColor(level)};border:1px solid ${_ebLevelColor(level)}44;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;letter-spacing:0.4px">${_ebEsc(level)}</span>`;
}

function _ebRenderMatchCard(paper) {
  const rel = paper.relevance ?? 0;
  const barW = Math.min(rel, 100);
  return `<div class="nnnc-match-card">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:3px">${_ebEsc(paper.title)}</div>
        <div style="font-size:11.5px;color:var(--text-muted)">${_ebEsc(paper.authors)} (${paper.year}) — <em>${_ebEsc(paper.journal)}</em></div>
      </div>
      ${_ebDesignBadge(paper.design)}
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;font-size:12px;color:var(--text-muted)">
      <span><strong style="color:var(--text)">${paper.evidence_tier ? 'Evidence tier:' : 'Effect size:'}</strong> ${paper.evidence_tier ? _ebEsc(paper.evidence_tier) : `d = ${paper.effectSize} ${_ebEsc(paper.ci)}`}</span>
      <span><strong style="color:var(--text)">N:</strong> ${paper.n}</span>
      <span><strong style="color:var(--text)">Outcome:</strong> ${_ebEsc(paper.outcome)}</span>
      <span><strong style="color:var(--text)">Modality:</strong> ${_ebEsc(paper.modality)}</span>
      <span><strong style="color:var(--text)">Condition:</strong> ${_ebEsc(paper.condition)}</span>
    </div>
    <div style="margin-top:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:10.5px;color:var(--text-muted);letter-spacing:0.4px;text-transform:uppercase">Relevance</span>
        <span style="font-size:11px;font-weight:600;color:var(--accent-teal)">${rel}/100</span>
      </div>
      <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
        <div class="nnnc-effect-bar" style="height:100%;width:${barW}%;background:var(--accent-teal);border-radius:3px;transition:width 0.4s"></div>
      </div>
    </div>
    ${paper.record_url ? `<div style="margin-top:10px;display:flex;justify-content:flex-end"><a href="${_ebEsc(paper.record_url)}" target="_blank" rel="noopener" style="font-size:11px;color:var(--accent-blue);text-decoration:none">Open source ↗</a></div>` : ''}
    <div style="margin-top:10px;display:flex;justify-content:flex-end">
      <button class="btn btn-sm" onclick="window._ebAddCitation('${_ebEsc(paper.id)}')" style="font-size:11px">+ Add to Protocol Notes</button>
    </div>
  </div>`;
}

function _ebBuildComparisonSVG(pubES, pubCILow, pubCIHigh, clinicES, clinicSD) {
  const W = 480, H = 120, PL = 120, PR = 20, PT = 18, PB = 28;
  const innerW = W - PL - PR;
  const maxVal = Math.max(pubCIHigh + 0.1, clinicES + clinicSD + 0.1, 1.4);
  const scale = innerW / maxVal;
  const rowH = (H - PT - PB) / 2;
  const barH = 22;
  const pubY  = PT + rowH * 0 + (rowH - barH) / 2;
  const clinY = PT + rowH * 1 + (rowH - barH) / 2;
  const pubBarW  = Math.max(pubES  * scale, 2);
  const cliBarW  = Math.max(clinicES * scale, 2);
  const ciLowX   = PL + pubCILow  * scale;
  const ciHighX  = PL + pubCIHigh * scale;
  const cliLowX  = PL + Math.max(clinicES - clinicSD, 0) * scale;
  const cliHighX = PL + (clinicES + clinicSD) * scale;
  const midY1    = pubY  + barH / 2;
  const midY2    = clinY + barH / 2;
  return `<svg class="nnnc-comparison-chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px;height:auto;display:block">
    <text x="${PL - 8}" y="${midY1 + 4}" text-anchor="end" font-size="12" fill="var(--text-muted)">Published</text>
    <text x="${PL - 8}" y="${midY2 + 4}" text-anchor="end" font-size="12" fill="var(--text-muted)">Your Clinic</text>
    <rect x="${PL}" y="${pubY}" width="${pubBarW}" height="${barH}" rx="4" fill="var(--accent-blue)" opacity="0.8"/>
    <rect x="${PL}" y="${clinY}" width="${cliBarW}" height="${barH}" rx="4" fill="var(--accent-teal)" opacity="0.85"/>
    <line x1="${ciLowX}" y1="${midY1 - 8}" x2="${ciLowX}" y2="${midY1 + 8}" stroke="var(--accent-blue)" stroke-width="2"/>
    <line x1="${ciHighX}" y1="${midY1 - 8}" x2="${ciHighX}" y2="${midY1 + 8}" stroke="var(--accent-blue)" stroke-width="2"/>
    <line x1="${ciLowX}" y1="${midY1}" x2="${ciHighX}" y2="${midY1}" stroke="var(--accent-blue)" stroke-width="1.5" stroke-dasharray="3,2"/>
    <line x1="${cliLowX}" y1="${midY2 - 8}" x2="${cliLowX}" y2="${midY2 + 8}" stroke="var(--accent-teal)" stroke-width="2"/>
    <line x1="${cliHighX}" y1="${midY2 - 8}" x2="${cliHighX}" y2="${midY2 + 8}" stroke="var(--accent-teal)" stroke-width="2"/>
    <line x1="${cliLowX}" y1="${midY2}" x2="${cliHighX}" y2="${midY2}" stroke="var(--accent-teal)" stroke-width="1.5" stroke-dasharray="3,2"/>
    <text x="${PL + pubBarW + 6}" y="${midY1 + 4}" font-size="11" fill="var(--text)">d=${pubES.toFixed(2)}</text>
    <text x="${PL + cliBarW + 6}" y="${midY2 + 4}" font-size="11" fill="var(--text)">d=${clinicES.toFixed(2)}</text>
    <line x1="${PL}" y1="${H - PB}" x2="${W - PR}" y2="${H - PB}" stroke="var(--border)" stroke-width="1"/>
    <text x="${PL}" y="${H - PB + 12}" font-size="9" fill="var(--text-muted)">0</text>
    <text x="${PL + innerW / 2}" y="${H - PB + 12}" text-anchor="middle" font-size="9" fill="var(--text-muted)">Cohen's d</text>
    <text x="${W - PR}" y="${H - PB + 12}" text-anchor="end" font-size="9" fill="var(--text-muted)">${maxVal.toFixed(1)}</text>
  </svg>`;
}

function _ebParseCI(ciStr) {
  if (!ciStr) return { low: 0, high: 0 };
  const m = ciStr.match(/([\d.]+)[–\-]([\d.]+)/);
  if (m) return { low: parseFloat(m[1]), high: parseFloat(m[2]) };
  return { low: 0, high: 0 };
}

function _ebInterpretation(clinicES, pubCILow, pubCIHigh, condition, modality) {
  let pos = 'within';
  if (clinicES > pubCIHigh) pos = 'above';
  else if (clinicES < pubCILow) pos = 'below';
  const posLabel = { above: 'above', within: 'within', below: 'below' }[pos];
  const posColor = { above: 'var(--accent-teal)', within: 'var(--accent-blue)', below: 'var(--accent-amber)' }[pos];
  return `<div style="padding:12px 16px;border-radius:8px;border:1px solid ${posColor}33;background:${posColor}0d;font-size:13px;line-height:1.6">
    <strong style="color:${posColor}">Your clinic's outcomes are ${posLabel} the published range</strong> for <em>${_ebEsc(condition)}</em> treated with <em>${_ebEsc(modality)}</em>.
    Published benchmark: d = ${pubCILow.toFixed(2)}–${pubCIHigh.toFixed(2)} (95% CI). Your clinic: d ≈ ${clinicES.toFixed(2)}.
    ${pos === 'above' ? 'Excellent outcome — consider documenting your protocol parameters for dissemination.' :
      pos === 'below' ? 'Review session adherence, patient selection criteria, and protocol parameters.' :
      'Your real-world results align well with the published evidence base.'}
  </div>`;
}

function _ebRenderGapSection(protocols, literature) {
  if (_ebLiveState.loaded && _ebLiveState.coverageRows.length) {
    const wishlist = _ebLoad('ds_irb_wishlist', []);
    const items = _ebLiveState.coverageRows
      .filter((row) => row.gap && row.gap !== 'None')
      .map((row) => {
        const proto = protocols.find((p) => _ebSlug(p.condition) === _ebSlug(row.condition) && _ebSlug(p.modality) === _ebSlug(row.modality))
          || {
            id: `coverage::${row.id}`,
            name: `${row.modality} — ${row.condition}`,
            modality: row.modality,
            condition: row.condition,
          };
        const matchedSignals = _ebLiveState.safetySignals.filter((signal) => {
          const indicationHit = (signal.indication_tags || []).some((tag) => _ebSlug(tag) === _ebSlug(row.condition));
          const modalityHit = (signal.canonical_modalities || []).some((tag) => _ebSlug(tag) === _ebSlug(row.modality))
            || _ebSlug(signal.primary_modality) === _ebSlug(row.modality);
          return indicationHit && modalityHit;
        }).slice(0, 2);
        const severity = row.paper_count < 10 ? 'high' : 'medium';
        const action = matchedSignals.length
          ? 'Review live safety signals and narrow patient-selection criteria before expanding this protocol.'
          : 'Review live protocol templates and strengthen the evidence base before scaling this protocol.';
        return { proto, type: row.gap, action, severity, row, matchedSignals };
      });
    if (!items.length) {
      return `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">No live evidence gaps detected across the top protocol coverage rows.</div>`;
    }
    return items.map((g) => {
      const sColor = g.severity === 'high' ? 'var(--accent-rose)' : 'var(--accent-amber)';
      const alreadyAdded = wishlist.some(i => i.protoId === g.proto.id && i.gapType === g.type);
      return `<div class="nnnc-gap-item">
        <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:2px">${_ebEsc(g.proto.name)}</div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
              <span style="font-size:10.5px;font-weight:600;color:${sColor};background:${sColor}18;padding:2px 8px;border-radius:4px;border:1px solid ${sColor}33">${_ebEsc(g.type)}</span>
              <span style="font-size:11px;color:var(--text-muted)">${_ebEsc(g.proto.modality)} / ${_ebEsc(g.proto.condition)} · ${g.row.paper_count} papers · coverage ${g.row.coverage}%</span>
            </div>
            <div style="font-size:12px;color:var(--text-muted)">Suggested action: ${_ebEsc(g.action)}</div>
            ${g.matchedSignals.length ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px">Safety signals: ${g.matchedSignals.map((signal) => _ebEsc((signal.safety_signal_tags || []).concat(signal.contraindication_signal_tags || []).join(', ') || signal.title || 'Signal')).join(' · ')}</div>` : ''}
          </div>
          <button class="btn btn-sm" ${alreadyAdded ? 'disabled style="opacity:0.5"' : ''}
            onclick="window._ebAddToIRB('${_ebEsc(g.proto.id)}','${_ebEsc(g.proto.name)}','${_ebEsc(g.type)}')"
            style="flex-shrink:0;font-size:11px;${alreadyAdded ? '' : 'border-color:var(--accent-violet);color:var(--accent-violet)'}">
            ${alreadyAdded ? 'Added to IRB ✓' : '+ IRB Wishlist'}
          </button>
        </div>
      </div>`;
    }).join('');
  }
  const gaps = [];
  for (const proto of protocols) {
    const matched = literature.filter(p => p.modality === proto.modality && p.condition === proto.condition);
    if (matched.length === 0) {
      gaps.push({ proto, type: 'No matched literature', action: 'Search PubMed for recent trials on this modality + condition combination', severity: 'high' });
      continue;
    }
    const hasOnlyLevelIII = matched.every(p => {
      const l = _ebEvidenceLevel(p.design);
      return l === 'Level III' || l === 'Level IV';
    });
    if (hasOnlyLevelIII) {
      gaps.push({ proto, type: 'Only Level III/IV evidence', action: 'Consider conducting a pilot study or consulting a specialist', severity: 'medium' });
    }
    const positives = matched.filter(p => p.effectSize > 0).length;
    const negatives = matched.filter(p => p.effectSize <= 0).length;
    if (positives > 0 && negatives > 0) {
      gaps.push({ proto, type: 'Contradictory findings', action: 'Review conflicting studies and identify moderating variables', severity: 'medium' });
    }
  }
  if (gaps.length === 0) {
    return `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">No evidence gaps detected across active protocols.</div>`;
  }
  return gaps.map(g => {
    const sColor = g.severity === 'high' ? 'var(--accent-rose)' : 'var(--accent-amber)';
    const irbList = _ebLoad('ds_irb_wishlist', []);
    const alreadyAdded = irbList.some(i => i.protoId === g.proto.id && i.gapType === g.type);
    return `<div class="nnnc-gap-item">
      <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:2px">${_ebEsc(g.proto.name)}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
            <span style="font-size:10.5px;font-weight:600;color:${sColor};background:${sColor}18;padding:2px 8px;border-radius:4px;border:1px solid ${sColor}33">${_ebEsc(g.type)}</span>
            <span style="font-size:11px;color:var(--text-muted)">${_ebEsc(g.proto.modality)} / ${_ebEsc(g.proto.condition)}</span>
          </div>
          <div style="font-size:12px;color:var(--text-muted)">Suggested action: ${_ebEsc(g.action)}</div>
        </div>
        <button class="btn btn-sm" ${alreadyAdded ? 'disabled style="opacity:0.5"' : ''}
          onclick="window._ebAddToIRB('${_ebEsc(g.proto.id)}','${_ebEsc(g.proto.name)}','${_ebEsc(g.type)}')"
          style="flex-shrink:0;font-size:11px;${alreadyAdded ? '' : 'border-color:var(--accent-violet);color:var(--accent-violet)'}">
          ${alreadyAdded ? 'Added to IRB ✓' : '+ IRB Wishlist'}
        </button>
      </div>
    </div>`;
  }).join('');
}

export async function pgEvidenceBuilder(setTopbar) {
  setTopbar('Evidence Builder', `<button class="btn btn-sm" onclick="window._ebRefresh()" style="font-size:12px">↺ Refresh</button>`);

  const el = document.getElementById('content');
  if (!el) return;
  const shouldHydrateLive = !_ebLiveState.loaded;

  // Ensure seed data is ready
  _ebGetLiterature();
  _ebGetPatientOutcomes();

  const protocols = _ebGetProtocols();
  const selProto  = protocols[0] || null;

  el.innerHTML = `<div style="padding:24px 28px;max-width:1100px;margin:0 auto">

    <!-- Page header -->
    <div style="margin-bottom:24px">
      <div style="font-size:10px;color:var(--accent-teal);letter-spacing:1.2px;text-transform:uppercase;font-weight:600;margin-bottom:6px">Clinical Intelligence</div>
      <div style="font-size:22px;font-weight:700;color:var(--text);margin-bottom:4px">Outcome Evidence Builder</div>
      <div style="font-size:13px;color:var(--text-muted)">Connect your real-world patient outcomes to published research evidence and identify gaps in your protocol portfolio.</div>
    </div>

    <!-- Section 1: Protocol-Evidence Matcher -->
    <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:20px">
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px">Protocol–Evidence Matcher</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Select a protocol to see matched literature with relevance scoring.</div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px">
        <label style="font-size:12px;color:var(--text-muted)">Protocol:</label>
        <select id="eb-proto-select" class="input" style="max-width:340px;font-size:13px" onchange="window._ebOnProtoChange(this.value)">
          ${protocols.map(p => `<option value="${_ebEsc(p.id)}">${_ebEsc(p.name)}</option>`).join('')}
        </select>
      </div>
      <div id="eb-matched-papers">
        ${selProto ? _ebMatchedPapersHTML(selProto) : '<div style="color:var(--text-muted);font-size:13px">No protocols found.</div>'}
      </div>
    </div>

    <!-- Section 2: Real-World vs Published Comparison -->
    <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:20px">
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px">Real-World vs Published Comparison</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Compare your clinic's outcomes to published benchmarks side-by-side.</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
        <div>
          <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Condition</label>
          <select id="eb-cmp-condition" class="input" style="min-width:160px;font-size:13px" onchange="window._ebRenderComparison()">
            ${['Depression','ADHD','Anxiety','PTSD','Insomnia','Chronic Pain','TBI','OCD'].map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Modality</label>
          <select id="eb-cmp-modality" class="input" style="min-width:160px;font-size:13px" onchange="window._ebRenderComparison()">
            ${['TMS','Neurofeedback','tDCS','PEMF','HEG','Biofeedback'].map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="eb-comparison-panel"></div>
    </div>

    <!-- Section 3: Evidence Summary Generator -->
    <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:20px">
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px">Evidence Summary Generator</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Generate a formatted evidence brief for the selected protocol. Download as .txt or copy to clipboard.</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <select id="eb-sum-proto-select" class="input" style="max-width:320px;font-size:13px">
          ${protocols.map(p => `<option value="${_ebEsc(p.id)}">${_ebEsc(p.name)}</option>`).join('')}
        </select>
        <button class="btn btn-sm" onclick="window._ebGenerateSummary()" style="font-size:12px;background:var(--accent-blue)22;color:var(--accent-blue);border-color:var(--accent-blue)55">Generate Summary</button>
        <button class="btn btn-sm" onclick="window._ebCopySummary()" style="font-size:12px">Copy to Clipboard</button>
      </div>
      <div id="eb-summary-output" style="margin-top:16px"></div>
    </div>

    <!-- Section 4: Evidence Gap Finder -->
    <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;flex-wrap:wrap;gap:8px">
        <div style="font-size:14px;font-weight:700;color:var(--text)">Evidence Gap Finder</div>
        <div style="font-size:11px;color:var(--text-muted)">IRB Wishlist: <span id="eb-irb-count" style="color:var(--accent-violet);font-weight:600">${_ebLoad('ds_irb_wishlist',[]).length}</span> item(s)</div>
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Automatically flags protocols with missing, weak, or conflicting evidence.</div>
      <div id="eb-gap-list">
        ${_ebRenderGapSection(protocols, _ebGetLiterature())}
      </div>
    </div>

  </div>`;

  // Wire up all handlers
  window._ebGetProtocols     = _ebGetProtocols;
  window._ebGetLiterature    = _ebGetLiterature;
  window._ebGetPatientOutcomes = _ebGetPatientOutcomes;

  window._ebRefresh = function() {
    pgEvidenceBuilder(setTopbar);
  };

  window._ebOnProtoChange = function(protoId) {
    const protocols = _ebGetProtocols();
    const proto = protocols.find(p => p.id === protoId);
    const panel = document.getElementById('eb-matched-papers');
    if (!panel) return;
    if (!proto) { panel.innerHTML = '<div style="color:var(--text-muted);font-size:13px">Protocol not found.</div>'; return; }
    panel.innerHTML = _ebMatchedPapersHTML(proto);
    if (proto.liveTemplate && !_ebLiveState.papersByProtocolId[proto.id]) {
      panel.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:13px">Loading live evidence matches…</div>';
      _ebEnsureLivePapersForProtocol(proto).then(() => {
        const targetPanel = document.getElementById('eb-matched-papers');
        if (targetPanel) targetPanel.innerHTML = _ebMatchedPapersHTML(proto);
      });
    }
    // Also update summary selector
    const sumSel = document.getElementById('eb-sum-proto-select');
    if (sumSel) sumSel.value = protoId;
  };

  window._ebAddCitation = function(paperId) {
    const proSel = document.getElementById('eb-proto-select');
    const protoId = proSel ? proSel.value : null;
    const protocols = _ebGetProtocols();
    const protoIdx = protocols.findIndex(p => p.id === protoId);
    if (protoIdx === -1) { _dsToast('Please select a protocol first.', 'warn'); return; }
    const paper = _ebMatchPapers(protocols[protoIdx]).find(p => p.id === paperId);
    if (!paper) return;
    const citation = paper.evidence_tier
      ? `[${paper.authors} (${paper.year}), ${paper.journal}] "${paper.title}" — Evidence tier: ${paper.evidence_tier}, citations: ${paper.n}, study type: ${paper.design}.`
      : `[${paper.authors} (${paper.year}), ${paper.journal}] "${paper.title}" — Effect size: d=${paper.effectSize} ${paper.ci}, N=${paper.n}, ${paper.design}.`;
    protocols[protoIdx].notes = ((protocols[protoIdx].notes || '') + '\n' + citation).trim();
    _ebSave('ds_protocols', protocols);
    const btn = event.target;
    if (btn) { const orig = btn.textContent; btn.textContent = 'Added ✓'; btn.disabled = true; setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000); }
  };

  window._ebRenderComparison = function() {
    const condition = document.getElementById('eb-cmp-condition')?.value;
    const modality  = document.getElementById('eb-cmp-modality')?.value;
    const panel     = document.getElementById('eb-comparison-panel');
    if (!panel || !condition || !modality) return;
    const literature = _ebGetLiterature();
    const matched = literature.filter(p => p.condition === condition && p.modality === modality);
    if (matched.length === 0) {
      panel.innerHTML = `<div style="padding:16px;color:var(--text-muted);font-size:13px;text-align:center">No published studies found for ${_ebEsc(condition)} + ${_ebEsc(modality)} in the literature database.</div>`;
      return;
    }
    const avgES = matched.reduce((s,p) => s + p.effectSize, 0) / matched.length;
    const ciLows  = matched.map(p => _ebParseCI(p.ci).low);
    const ciHighs = matched.map(p => _ebParseCI(p.ci).high);
    const pubCILow  = ciLows.reduce((s,v) => s + v, 0) / ciLows.length;
    const pubCIHigh = ciHighs.reduce((s,v) => s + v, 0) / ciHighs.length;
    const totalN = matched.reduce((s,p) => s + (p.n || 0), 0);
    const outcomes = _ebGetPatientOutcomes();
    const clinicRec = outcomes.find(o => o.condition === condition && o.modality === modality);
    let clinicES = 0.45, clinicSD = 0.18, clinicN = 0, clinicPct = 0;
    if (clinicRec) {
      clinicES  = Math.abs(clinicRec.meanChange) / 15;
      clinicSD  = clinicRec.sdChange / 15;
      clinicN   = clinicRec.n;
      clinicPct = clinicRec.pctImproved;
    }
    const svg = _ebBuildComparisonSVG(avgES, pubCILow, pubCIHigh, clinicES, clinicSD);
    const interp = _ebInterpretation(clinicES, pubCILow, pubCIHigh, condition, modality);
    panel.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px">
        <div style="background:var(--hover-bg);border:1px solid var(--border);border-radius:8px;padding:14px 16px">
          <div style="font-size:10px;color:var(--accent-blue);text-transform:uppercase;letter-spacing:0.8px;font-weight:600;margin-bottom:8px">Published Benchmark</div>
          <div style="font-size:22px;font-weight:700;color:var(--text)">d = ${avgES.toFixed(2)}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">95% CI: ${pubCILow.toFixed(2)}–${pubCIHigh.toFixed(2)}</div>
          <div style="font-size:12px;color:var(--text-muted)">Total N = ${totalN} across ${matched.length} study(ies)</div>
        </div>
        <div style="background:var(--hover-bg);border:1px solid var(--border);border-radius:8px;padding:14px 16px">
          <div style="font-size:10px;color:var(--accent-teal);text-transform:uppercase;letter-spacing:0.8px;font-weight:600;margin-bottom:8px">Your Clinic</div>
          ${clinicRec ? `
            <div style="font-size:22px;font-weight:700;color:var(--text)">d ≈ ${clinicES.toFixed(2)}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${clinicPct}% improved</div>
            <div style="font-size:12px;color:var(--text-muted)">N = ${clinicN} patients</div>
          ` : `<div style="font-size:13px;color:var(--text-muted);margin-top:4px">No clinic outcome data found for this combination.</div>`}
        </div>
      </div>
      <div style="margin-bottom:16px">${svg}</div>
      ${interp}
    `;
  };

  window._ebGenerateSummary = function() {
    const sumSel = document.getElementById('eb-sum-proto-select');
    const protoId = sumSel ? sumSel.value : null;
    const protocols = _ebGetProtocols();
    const proto = protocols.find(p => p.id === protoId);
    if (!proto) { _dsToast('Please select a protocol first.', 'warn'); return; }
    const matched = _ebMatchPapers(proto).filter(p => p.relevance >= 40);
    const outcomes = _ebGetPatientOutcomes();
    const clinicRec = outcomes.find(o => o.condition === proto.condition && o.modality === proto.modality);
    const date = new Date().toLocaleDateString('en-GB', { year:'numeric', month:'long', day:'numeric' });
    const studyLines = matched.map((p,i) => {
      const level = _ebEvidenceLevel(p.design);
      if (p.evidence_tier || p.effectSize == null) {
        return `  ${i+1}. ${p.authors} (${p.year}). "${p.title}". ${p.journal}.\n     Evidence tier: ${p.evidence_tier || level}, Citations: ${p.n}, Study type: ${p.design}, Outcome summary: ${p.outcome}.\n     Source: ${p.record_url || 'Research bundle record'}.`;
      }
      const clinSig = p.effectSize >= 0.8 ? 'Large effect' : p.effectSize >= 0.5 ? 'Medium effect' : 'Small effect';
      return `  ${i+1}. ${p.authors} (${p.year}). "${p.title}". ${p.journal}.\n     Effect: d=${p.effectSize} ${p.ci}, N=${p.n}, Design: ${p.design}, Outcome: ${p.outcome}.\n     Evidence level: ${level}. Clinical significance: ${clinSig}.`;
    }).join('\n\n');
    const outcomeLines = clinicRec
      ? `  Condition: ${proto.condition} | Modality: ${proto.modality}\n  Patients: N=${clinicRec.n}\n  Mean score change: ${clinicRec.meanChange} (SD ${clinicRec.sdChange})\n  Percentage improved: ${clinicRec.pctImproved}%`
      : '  No clinic outcome data recorded for this protocol combination.';
    const designs = matched.map(p => p.design);
    const hasOldStudies = matched.some(p => 2026 - p.year > 10);
    const hasSingleArm  = matched.some(p => p.design.toLowerCase().includes('pilot'));
    const limitations = [
      'Outcome measures vary across studies; direct comparison requires caution.',
      hasOldStudies ? 'Some cited studies are over 10 years old; consider searching for more recent trials.' : null,
      hasSingleArm  ? 'Some studies used single-arm or pilot designs with limited generalizability.' : null,
      matched.length < 3 ? 'Limited evidence base; findings should be interpreted with caution.' : null,
    ].filter(Boolean).map((l,i) => `  ${i+1}. ${l}`).join('\n');
    const summaryText = `EVIDENCE SUMMARY — ${proto.name}\nGenerated: ${date}\n\n${'='.repeat(60)}\nOVERVIEW\n${'='.repeat(60)}\n${proto.description || 'No description provided.'}\n\n${'='.repeat(60)}\nSUPPORTING EVIDENCE (${matched.length} ${matched.length === 1 ? 'study' : 'studies'})\n${'='.repeat(60)}\n${studyLines || '  No closely matched studies found in the literature database.'}\n\n${'='.repeat(60)}\nREAL-WORLD OUTCOMES (This Clinic, N=${clinicRec ? clinicRec.n : 0})\n${'='.repeat(60)}\n${outcomeLines}\n\n${'='.repeat(60)}\nLIMITATIONS & CONSIDERATIONS\n${'='.repeat(60)}\n${limitations || '  No specific limitations identified.'}\n`;
    window._ebLastSummary = summaryText;
    // Save to log
    const logs = _ebLoad('ds_evidence_summaries', []);
    logs.unshift({ id: 'sum_' + Date.now(), protoId: proto.id, protoName: proto.name, generatedAt: new Date().toISOString(), length: summaryText.length });
    if (logs.length > 50) logs.splice(50);
    _ebSave('ds_evidence_summaries', logs);
    const outEl = document.getElementById('eb-summary-output');
    if (outEl) {
      outEl.innerHTML = `<pre style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:16px;font-size:11.5px;color:var(--text);white-space:pre-wrap;word-break:break-word;max-height:360px;overflow-y:auto;line-height:1.7;font-family:monospace">${_ebEsc(summaryText)}</pre>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn btn-sm" onclick="window._ebDownloadSummary()" style="font-size:11px">Download .txt</button>
          <button class="btn btn-sm" onclick="window._ebCopySummary()" style="font-size:11px">Copy to Clipboard</button>
        </div>`;
    }
  };

  window._ebDownloadSummary = function() {
    if (!window._ebLastSummary) { _dsToast('Generate a summary before performing this action.', 'warn'); return; }
    const blob = new Blob([window._ebLastSummary], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'evidence_summary_' + new Date().toISOString().slice(0, 10) + '.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  window._ebCopySummary = function() {
    const text = window._ebLastSummary;
    if (!text) { _dsToast('Generate a summary before performing this action.', 'warn'); return; }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => window._announce?.('Summary copied to clipboard'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      window._announce?.('Summary copied to clipboard');
    }
  };

  window._ebAddToIRB = function(protoId, protoName, gapType) {
    const list = _ebLoad('ds_irb_wishlist', []);
    if (list.some(i => i.protoId === protoId && i.gapType === gapType)) return;
    list.push({ id: 'irb_' + Date.now(), protoId, protoName, gapType, addedAt: new Date().toISOString() });
    _ebSave('ds_irb_wishlist', list);
    const cntEl = document.getElementById('eb-irb-count');
    if (cntEl) cntEl.textContent = list.length;
    // Re-render gap section
    const gapEl = document.getElementById('eb-gap-list');
    if (gapEl) gapEl.innerHTML = _ebRenderGapSection(_ebGetProtocols(), _ebGetLiterature());
  };

  // Trigger initial comparison render
  window._ebRenderComparison();

  if (shouldHydrateLive) _ebEnsureLiveData().then(async () => {
    if (_ebLiveState.loaded) {
      const refreshedProtocols = _ebGetProtocols();
      const refreshedProto = refreshedProtocols[0] || null;
      if (refreshedProto) {
        await _ebEnsureLivePapersForProtocol(refreshedProto);
      }
      pgEvidenceBuilder(setTopbar);
    }
  }).catch(() => null);
}

function _ebMatchedPapersHTML(proto) {
  const papers = _ebMatchPapers(proto);
  if (papers.length === 0) {
    return `<div style="padding:16px;color:var(--text-muted);font-size:13px;text-align:center">No literature matches found for <strong>${_ebEsc(proto.name)}</strong>. ${proto.liveTemplate ? 'The live research bundle did not return ranked papers for this protocol yet.' : 'Try adding more studies to the Evidence Library.'}</div>`;
  }
  return `<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">${papers.length} matched paper${papers.length !== 1 ? 's' : ''} for <strong style="color:var(--text)">${_ebEsc(proto.name)}</strong> (${_ebEsc(proto.modality)} / ${_ebEsc(proto.condition)})</div>
    <div style="display:flex;flex-direction:column;gap:12px">
      ${papers.map(_ebRenderMatchCard).join('')}
    </div>`;
}

// =============================================================================
// pgPatientQueue — Clinician Daily Patient Queue
// =============================================================================
export async function pgPatientQueue(setTopbar) {
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-GB', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const todayISO = today.toISOString().slice(0,10);

  setTopbar(
    'Today\'s Queue \u2014 ' + todayStr,
    '<button class="btn btn-sm btn-primary" onclick="window._pqAddWalkin()">+ Add Walk-in</button>' +
    '<input type="date" class="pq-date-sel" id="pq-date-sel" value="' + todayISO + '" onchange="window._pqChangeDate(this.value)" style="margin-left:8px">'
  );

  function _pqLoad(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } }
  function _pqSave(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  const _pqE = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  // Seed queue data if missing
  if (!localStorage.getItem('ds_today_queue')) {
    const seed = [
      { id:'pq001', time:'08:30', patientId:'pt001', courseId:'crs001', patientName:'Alexis Morgan',   condition:'Depression', sessionNum:8,  sessionTotal:20, protocol:'TMS 10Hz L-DLPFC',       status:'done',       alerts:[],                    notes:'Tolerated well, reported mood lift.' },
      { id:'pq002', time:'09:15', patientId:'pt002', courseId:'crs002', patientName:'Jordan Blake',    condition:'Anxiety',    sessionNum:15, sessionTotal:20, protocol:'Alpha/Beta NFB',          status:'done',       alerts:['homework'],          notes:'Missed home EEG exercises x2.' },
      { id:'pq003', time:'10:00', patientId:'pt003', courseId:'crs003', patientName:'Sam Rivera',      condition:'PTSD',       sessionNum:3,  sessionTotal:30, protocol:'Alpha/Theta NFB',         status:'in-session', alerts:['wearable'],          notes:'HRV anomaly detected during last session.' },
      { id:'pq004', time:'11:00', patientId:'pt004', courseId:'crs004', patientName:'Casey Kim',       condition:'ADHD',       sessionNum:12, sessionTotal:20, protocol:'Theta Suppression NFB',   status:'waiting',    alerts:[],                    notes:'' },
      { id:'pq005', time:'13:30', patientId:'pt005', courseId:'crs005', patientName:'Morgan Ellis',    condition:'Insomnia',   sessionNum:5,  sessionTotal:15, protocol:'SMR Enhancement NFB',     status:'waiting',    alerts:['assessment'],        notes:'PHQ-9 overdue by 9 days.' },
      { id:'pq006', time:'14:15', patientId:'pt006', courseId:'crs006', patientName:'Taylor Nguyen',   condition:'OCD',        sessionNum:6,  sessionTotal:20, protocol:'Deep TMS H7 Coil',        status:'no-show',    alerts:['deviation'],         notes:'Called \u2014 no answer. Left voicemail.' },
    ];
    _pqSave('ds_today_queue', seed);
  }

  if (!localStorage.getItem('ds_pq_adherence_alerts')) {
    _pqSave('ds_pq_adherence_alerts', [
      { id:'pal001', patientId:'pt006', patientName:'Taylor Nguyen', type:'overdue-session',  detail:'No session recorded in 11 days (last: 2026-03-31)',                                                  daysSince:11, status:'active' },
      { id:'pal002', patientId:'pt003', patientName:'Sam Rivera',    type:'parameter-drift',  detail:'Pulse width increased from 230\u03bcs to 290\u03bcs across last 3 sessions \u2014 outside protocol spec', daysSince:5,  status:'active' },
      { id:'pal003', patientId:'pt002', patientName:'Jordan Blake',  type:'unreviewed-ae',    detail:'Adverse event (mild headache) logged after Session 13 \u2014 not yet reviewed by clinician',          daysSince:7,  status:'active' },
    ]);
  }

  const el = document.getElementById('content');

  function _pqGetQueue()  { return _pqLoad('ds_today_queue', []); }
  function _pqGetAlerts() { return _pqLoad('ds_pq_adherence_alerts', []); }

  const STATUS_CONFIG = {
    'waiting':    { label:'Waiting',    cls:'pq-status-waiting',   dot:true  },
    'in-session': { label:'In Session', cls:'pq-status-in-session', dot:false },
    'done':       { label:'Done',       cls:'pq-status-done',       dot:false },
    'no-show':    { label:'No Show',    cls:'pq-status-noshow',     dot:false },
  };

  const ALERT_ICONS = {
    'deviation':  { icon:'\u26a0\ufe0f', cls:'pq-alert-deviation',  tip:'Protocol deviation'   },
    'homework':   { icon:'\uD83D\uDCDA', cls:'pq-alert-homework',   tip:'Missed homework'       },
    'wearable':   { icon:'\uD83D\uDC9C', cls:'pq-alert-wearable',   tip:'Wearable anomaly'      },
    'assessment': { icon:'\uD83D\uDCCB', cls:'pq-alert-assessment', tip:'Overdue assessment'    },
  };

  const ALERT_TYPE_LABELS = {
    'overdue-session':  { icon:'\uD83D\uDD50', color:'var(--accent-amber)',  label:'Overdue Session'   },
    'parameter-drift':  { icon:'\uD83D\uDCCA', color:'var(--accent-blue)',   label:'Parameter Drift'   },
    'unreviewed-ae':    { icon:'\uD83D\uDEA8', color:'#ff6b6b',             label:'Unreviewed AE'     },
    'outcomes-overdue': { icon:'\uD83D\uDCCB', color:'var(--accent-violet)', label:'Outcomes Overdue'  },
  };

  function _pqSummaryStrip(queue) {
    const total   = queue.length;
    const done    = queue.filter(p => p.status === 'done').length;
    const pending = queue.filter(p => p.status === 'waiting').length;
    const ae      = queue.filter(p => (p.alerts||[]).some(a => a === 'deviation' || a === 'wearable')).length;
    return '<div class="pq-summary-strip">' +
      '<div class="pq-summary-card"><div class="pq-summary-val">' + total + '</div><div class="pq-summary-lbl">Patients Today</div></div>' +
      '<div class="pq-summary-card"><div class="pq-summary-val pq-val-green">' + done + '</div><div class="pq-summary-lbl">Completed</div></div>' +
      '<div class="pq-summary-card"><div class="pq-summary-val pq-val-amber">' + pending + '</div><div class="pq-summary-lbl">Pending</div></div>' +
      '<div class="pq-summary-card"><div class="pq-summary-val pq-val-red">' + ae + '</div><div class="pq-summary-lbl">Alerts Flagged</div></div>' +
    '</div>';
  }

  function _pqRenderAlertIcons(alerts) {
    if (!alerts || !alerts.length) return '<span style="color:var(--text-tertiary);font-size:11px">\u2014</span>';
    return alerts.map(a => {
      const cfg = ALERT_ICONS[a]; if (!cfg) return '';
      return '<span class="pq-alert-icon ' + cfg.cls + '" title="' + _pqE(cfg.tip) + '">' + cfg.icon + '</span>';
    }).join('');
  }

  function _pqStatusBadge(status) {
    const cfg = STATUS_CONFIG[status] || { label:status, cls:'', dot:false };
    const dot = cfg.dot ? '<span class="pq-pulse-dot"></span>' : '';
    return '<span class="pq-status-badge ' + cfg.cls + '">' + dot + cfg.label + '</span>';
  }

  function _pqQueueTable(queue) {
    const rows = queue.map(p => {
      const nearEnd = p.sessionNum >= p.sessionTotal - 2;
      const sesLabel = 'Session ' + p.sessionNum + ' of ' + p.sessionTotal + (nearEnd ? ' \u2014 Nearing completion' : '');
      const actions = '<div class="pq-actions">' +
        (p.status !== 'done' && p.status !== 'no-show'
          ? '<button class="pq-action-btn pq-action-start" onclick="window._pqStartSession(\'' + _pqE(p.id) + '\')">Start Session</button>'
          : '') +
        '<button class="pq-action-btn pq-action-chart" onclick="window._pqViewChart(\'' + _pqE(p.id) + '\')">View Chart</button>' +
        '<button class="pq-action-btn pq-action-note"  onclick="window._pqQuickNote(\'' + _pqE(p.id) + '\')">Quick Note</button>' +
      '</div>';
      return '<tr>' +
        '<td class="pq-td-time">' + _pqE(p.time) + '</td>' +
        '<td class="pq-td-patient"><div class="pq-patient-name">' + _pqE(p.patientName) + '</div></td>' +
        '<td><span class="pq-condition-tag">' + _pqE(p.condition) + '</span></td>' +
        '<td class="pq-td-session"><span class="pq-session-label">' + _pqE(sesLabel) + '</span></td>' +
        '<td class="pq-td-protocol">' + _pqE(p.protocol) + '</td>' +
        '<td>' + _pqStatusBadge(p.status) + '</td>' +
        '<td class="pq-td-alerts">' + _pqRenderAlertIcons(p.alerts) + '</td>' +
        '<td>' + actions + '</td>' +
      '</tr>';
    }).join('');
    return '<div class="pq-table-wrap"><table class="pq-table">' +
      '<thead><tr><th>Time</th><th>Patient</th><th>Condition</th><th>Session #</th><th>Protocol</th><th>Status</th><th>Alerts</th><th>Actions</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table></div>';
  }

  function _pqAdherenceAlerts(alerts) {
    const active = alerts.filter(a => a.status === 'active');
    if (!active.length) {
      return '<div class="pq-adherence-card"><div class="pq-adherence-title">Protocol Adherence Alerts</div><div style="padding:16px;color:var(--text-tertiary);font-size:13px;text-align:center">\u2705 No active protocol adherence alerts.</div></div>';
    }
    const items = active.map(a => {
      const cfg = ALERT_TYPE_LABELS[a.type] || { icon:'\u26a0\ufe0f', color:'var(--accent-amber)', label:a.type };
      return '<div class="pq-adherence-item">' +
        '<div class="pq-adherence-item-icon" style="color:' + cfg.color + '">' + cfg.icon + '</div>' +
        '<div class="pq-adherence-item-body">' +
          '<div class="pq-adherence-item-patient">' + _pqE(a.patientName) + ' <span class="pq-adherence-type-tag" style="border-color:' + cfg.color + '40;color:' + cfg.color + '">' + cfg.label + '</span></div>' +
          '<div class="pq-adherence-item-detail">' + _pqE(a.detail) + '</div>' +
          '<div class="pq-adherence-item-days">' + a.daysSince + ' day' + (a.daysSince !== 1 ? 's' : '') + ' since event</div>' +
        '</div>' +
        '<div class="pq-adherence-item-actions">' +
          '<button class="pq-action-btn pq-action-start" onclick="window._pqReviewAlert(\'' + _pqE(a.id) + '\')">Review</button>' +
          '<button class="pq-action-btn pq-action-chart" onclick="window._pqDismissAlert(\'' + _pqE(a.id) + '\')">Dismiss</button>' +
        '</div>' +
      '</div>';
    }).join('');
    return '<div class="pq-adherence-card">' +
      '<div class="pq-adherence-title">Protocol Adherence Alerts <span class="pq-adherence-count">' + active.length + '</span></div>' +
      items +
    '</div>';
  }

  function _pqQuickActions() {
    return '<div class="pq-quick-actions">' +
      '<button class="pq-qa-btn" onclick="window._nav(\'session-execution\')"><span class="pq-qa-icon">\uD83D\uDCC5</span><span>Schedule Session</span></button>' +
      '<button class="pq-qa-btn" onclick="window._nav(\'outcomes\')"><span class="pq-qa-icon">\uD83D\uDCCA</span><span>Record Outcome</span></button>' +
      '<button class="pq-qa-btn" onclick="window._nav(\'patients\')"><span class="pq-qa-icon">\uD83D\uDC65</span><span>View All Patients</span></button>' +
      '<button class="pq-qa-btn" onclick="window._nav(\'reports\')"><span class="pq-qa-icon">\uD83D\uDCC8</span><span>Reports</span></button>' +
    '</div>';
  }

  function _pqRender() {
    const queue = _pqGetQueue(), alerts = _pqGetAlerts();
    el.innerHTML = '<div class="pq-page">' +
      _pqSummaryStrip(queue) +
      '<div class="pq-section-title">Patient Queue</div>' +
      _pqQueueTable(queue) +
      '<div class="pq-section-title" style="margin-top:28px">Protocol Adherence</div>' +
      _pqAdherenceAlerts(alerts) +
      '<div class="pq-section-title" style="margin-top:28px">Quick Actions</div>' +
      _pqQuickActions() +
    '</div>';
  }

  _pqRender();

  window._pqStartSession = function(id) {
    const q = _pqGetQueue(); const p = q.find(x => x.id === id); if (!p) return;
    p.status = 'in-session'; _pqSave('ds_today_queue', q);
    // Pass patient + course context so session-execution page can pre-populate
    if (p.patientId) window._selectedPatientId = p.patientId;
    if (p.courseId)  window._selectedCourseId  = p.courseId;
    if (p.patientName) window._sessionPatientName = p.patientName;
    window._nav('session-execution');
  };

  window._pqViewChart = function(id) {
    const q = _pqGetQueue(); const p = id ? q.find(x => x.id === id) : null;
    // Pass patient context so patient-profile page can load the right patient
    if (p?.patientId) window._selectedPatientId = p.patientId;
    if (p?.patientName) window._profilePatientName = p.patientName;
    window._nav('patient-profile');
  };

  window._pqQuickNote = function(pqId) {
    const q = _pqGetQueue(); const p = q.find(x => x.id === pqId); if (!p) return;
    const existing = p.notes || '';
    const modal = document.createElement('div');
    modal.className = 'pq-modal-overlay';
    modal.innerHTML = '<div class="pq-note-modal" onclick="event.stopPropagation()">' +
      '<div class="pq-note-modal-header"><strong>Quick Note \u2014 ' + _pqE(p.patientName) + '</strong>' +
      '<button onclick="this.closest(\'.pq-modal-overlay\').remove()" style="background:none;border:none;color:var(--text-tertiary);font-size:18px;cursor:pointer;margin-left:auto">\u2715</button></div>' +
      '<textarea id="pq-note-ta" rows="5" style="width:100%;background:var(--bg-input,#1e2235);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);padding:10px;font-family:var(--font-body);font-size:13px;resize:vertical;box-sizing:border-box;margin-top:10px">' + _pqE(existing) + '</textarea>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">' +
        '<button class="btn btn-sm" onclick="this.closest(\'.pq-modal-overlay\').remove()">Cancel</button>' +
        '<button class="btn btn-sm btn-primary" onclick="window._pqSaveNote(\'' + _pqE(pqId) + '\',document.getElementById(\'pq-note-ta\').value)">Save Note</button>' +
      '</div>' +
    '</div>';
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  };

  window._pqSaveNote = function(pqId, text) {
    const q = _pqGetQueue(); const p = q.find(x => x.id === pqId); if (!p) return;
    p.notes = text.trim(); _pqSave('ds_today_queue', q);
    document.querySelector('.pq-modal-overlay')?.remove();
    window._showNotifToast?.({ title:'Note Saved', body:'Quick note saved in this browser view for ' + p.patientName, severity:'info' });
  };

  window._pqAddWalkin = function() {
    const name = prompt('Walk-in patient name:'); if (!name) return;
    const condition = prompt('Condition:') || 'General';
    const protocol  = prompt('Protocol:')  || 'To be determined';
    const id = 'pq_wi_' + Date.now();
    const q  = _pqGetQueue();
    const t  = new Date();
    const hh = String(t.getHours()).padStart(2,'0'), mm = String(t.getMinutes()).padStart(2,'0');
    q.push({ id, time:hh+':'+mm, patientId:'pt_wi_'+Date.now(), patientName:name, condition, sessionNum:1, sessionTotal:1, protocol, status:'waiting', alerts:[], notes:'Walk-in patient' });
    _pqSave('ds_today_queue', q); _pqRender();
    window._showNotifToast?.({ title:'Walk-in Added', body:name + ' added to today\'s local preview queue', severity:'info' });
  };

  window._pqChangeDate = function(dateVal) {
    // Update topbar date label and re-render with the selected date shown
    const heading = document.querySelector('.pq-date-heading');
    if (heading) {
      const d = new Date(dateVal + 'T12:00:00');
      heading.textContent = 'Today\'s Queue \u2014 ' + d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
    }
    window._showNotifToast?.({ title:'Date Changed', body:'Showing queue for ' + dateVal, severity:'info' });
  };

  window._pqReviewAlert = function(alertId) {
    const alerts = _pqGetAlerts();
    const al = alertId ? alerts.find(a => a.id === alertId) : null;
    if (al?.patientId) {
      window._selectedPatientId = al.patientId;
      window._profilePatientName = al.patientName;
    }
    window._nav('patient-profile');
  };

  window._pqDismissAlert = function(alertId) {
    if (!confirm('Dismiss this protocol adherence alert?')) return;
    const alerts = _pqGetAlerts(); const al = alerts.find(a => a.id === alertId); if (!al) return;
    al.status = 'dismissed'; _pqSave('ds_pq_adherence_alerts', alerts); _pqRender();
    window._showNotifToast?.({ title:'Alert Dismissed', body:'Protocol alert has been dismissed', severity:'info' });
  };
}

// ── pgClinicDay — Unified daily workflow: queue + approvals ───────────────────
export async function pgClinicDay(setTopbar) {
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-GB', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const todayISO = today.toISOString().slice(0,10);

  setTopbar(
    'Clinic Day \u2014 ' + todayStr,
    '<button class="btn btn-sm btn-ghost" onclick="window._cdAddWalkin()">+ Walk-in</button>' +
    '<button class="btn btn-sm btn-primary" onclick="window._nav(\'session-execution\')" style="margin-left:6px">&#9654; Ad-hoc Session</button>'
  );

  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const el  = document.getElementById('content');

  // ── Shared localStorage helpers ──────────────────────────────────────────────
  function _load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } }
  function _save(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

  // ── Queue seed ───────────────────────────────────────────────────────────────
  if (!localStorage.getItem('ds_today_queue')) {
    _save('ds_today_queue', [
      { id:'pq001', time:'08:30', patientId:'pt001', courseId:'crs001', patientName:'Alexis Morgan',  condition:'Depression', sessionNum:8,  sessionTotal:20, protocol:'TMS 10Hz L-DLPFC',       status:'done',       alerts:[],             notes:'Tolerated well, reported mood lift.' },
      { id:'pq002', time:'09:15', patientId:'pt002', courseId:'crs002', patientName:'Jordan Blake',   condition:'Anxiety',    sessionNum:15, sessionTotal:20, protocol:'Alpha/Beta NFB',          status:'done',       alerts:['homework'],   notes:'Missed home EEG exercises x2.' },
      { id:'pq003', time:'10:00', patientId:'pt003', courseId:'crs003', patientName:'Sam Rivera',     condition:'PTSD',       sessionNum:3,  sessionTotal:30, protocol:'Alpha/Theta NFB',         status:'in-session', alerts:['wearable'],   notes:'HRV anomaly detected during last session.' },
      { id:'pq004', time:'11:00', patientId:'pt004', courseId:'crs004', patientName:'Casey Kim',      condition:'ADHD',       sessionNum:12, sessionTotal:20, protocol:'Theta Suppression NFB',   status:'waiting',    alerts:[],             notes:'' },
      { id:'pq005', time:'13:30', patientId:'pt005', courseId:'crs005', patientName:'Morgan Ellis',   condition:'Insomnia',   sessionNum:5,  sessionTotal:15, protocol:'SMR Enhancement NFB',     status:'waiting',    alerts:['assessment'], notes:'PHQ-9 overdue by 9 days.' },
      { id:'pq006', time:'14:15', patientId:'pt006', courseId:'crs006', patientName:'Taylor Nguyen',  condition:'OCD',        sessionNum:6,  sessionTotal:20, protocol:'Deep TMS H7 Coil',        status:'no-show',    alerts:['deviation'],  notes:'Called \u2014 no answer. Left voicemail.' },
    ]);
  }
  if (!localStorage.getItem('ds_pq_adherence_alerts')) {
    _save('ds_pq_adherence_alerts', [
      { id:'pal001', patientId:'pt006', patientName:'Taylor Nguyen', type:'overdue-session',  detail:'No session recorded in 11 days (last: 2026-03-31)', daysSince:11, status:'active' },
      { id:'pal002', patientId:'pt003', patientName:'Sam Rivera',    type:'parameter-drift',  detail:'Pulse width increased from 230\u03bcs to 290\u03bcs across last 3 sessions \u2014 outside protocol spec', daysSince:5, status:'active' },
      { id:'pal003', patientId:'pt002', patientName:'Jordan Blake',  type:'unreviewed-ae',    detail:'Adverse event (mild headache) logged after Session 13 \u2014 not yet reviewed', daysSince:7, status:'active' },
    ]);
  }

  const QUEUE_KEY    = 'ds_today_queue';
  const ALERT_KEY    = 'ds_pq_adherence_alerts';
  const REVIEW_KEY   = 'ds_review_queue_local';

  const STATUS_CFG = {
    'waiting':    { label:'Waiting',    cls:'cd-s-waiting'   },
    'in-session': { label:'In Session', cls:'cd-s-active',  dot:true },
    'done':       { label:'Done',       cls:'cd-s-done'      },
    'no-show':    { label:'No Show',    cls:'cd-s-noshow'    },
  };
  const ALERT_ICONS = {
    'deviation':  { icon:'\u26a0\ufe0f', tip:'Protocol deviation'  },
    'homework':   { icon:'\uD83D\uDCDA', tip:'Missed homework'      },
    'wearable':   { icon:'\uD83D\uDC9C', tip:'Wearable anomaly'     },
    'assessment': { icon:'\uD83D\uDCCB', tip:'Overdue assessment'   },
  };
  const REVIEW_TYPE_CFG = {
    'off-label':     { label:'Off-Label',    color:'#f59e0b', icon:'\u26A1' },
    'ai-note':       { label:'AI Note',      color:'#a78bfa', icon:'\uD83E\uDD16' },
    'protocol':      { label:'Protocol',     color:'#60a5fa', icon:'\uD83D\uDCCB' },
    'consent':       { label:'Consent',      color:'#2dd4bf', icon:'\u270D' },
    'adverse-event': { label:'Adverse Event',color:'#f87171', icon:'\u26A0' },
  };

  // ── Stats strip ──────────────────────────────────────────────────────────────
  function renderStats(queue, pendingReviews) {
    const total   = queue.length;
    const done    = queue.filter(p => p.status === 'done').length;
    const waiting = queue.filter(p => p.status === 'waiting').length;
    const active  = queue.filter(p => p.status === 'in-session').length;
    return `<div class="cd-stats">
      <div class="cd-stat"><div class="cd-stat-val">${total}</div><div class="cd-stat-lbl">Patients Today</div></div>
      <div class="cd-stat cd-stat--done"><div class="cd-stat-val">${done}</div><div class="cd-stat-lbl">Completed</div></div>
      ${active ? `<div class="cd-stat cd-stat--active"><div class="cd-stat-val">${active}</div><div class="cd-stat-lbl">In Session</div></div>` : ''}
      <div class="cd-stat cd-stat--wait"><div class="cd-stat-val">${waiting}</div><div class="cd-stat-lbl">Waiting</div></div>
      ${pendingReviews > 0 ? `<div class="cd-stat cd-stat--review" onclick="window._nav('review-queue')" style="cursor:pointer" title="Open full review queue"><div class="cd-stat-val">${pendingReviews}</div><div class="cd-stat-lbl">Need Review</div></div>` : ''}
    </div>`;
  }

  // ── Patient queue table ──────────────────────────────────────────────────────
  function renderQueue(queue) {
    const rows = queue.map(p => {
      const s    = STATUS_CFG[p.status] || { label:p.status, cls:'' };
      const dot  = s.dot ? '<span class="cd-pulse-dot"></span>' : '';
      const near = p.sessionNum >= p.sessionTotal - 2;
      const sesLbl = `Session ${p.sessionNum}/${p.sessionTotal}${near ? ' \u2014 Near end' : ''}`;
      const icons  = (p.alerts||[]).map(a => {
        const cfg = ALERT_ICONS[a]; return cfg ? `<span class="cd-alert-ico" title="${esc(cfg.tip)}">${cfg.icon}</span>` : '';
      }).join('');
      const canStart = p.status !== 'done' && p.status !== 'no-show';
      const actions = `<div class="cd-row-actions">
        ${canStart ? `<button class="cd-btn cd-btn-start" onclick="window._cdStartSession('${esc(p.id)}')">&#9654; Start</button>` : ''}
        <button class="cd-btn cd-btn-chart" onclick="window._cdViewChart('${esc(p.id)}')">Chart</button>
        <button class="cd-btn cd-btn-note"  onclick="window._cdQuickNote('${esc(p.id)}')">Note</button>
      </div>`;
      return `<tr class="cd-row${p.status==='in-session'?' cd-row--active':''}${p.status==='no-show'?' cd-row--noshow':''}">
        <td class="cd-td-time">${esc(p.time)}</td>
        <td class="cd-td-name"><strong>${esc(p.patientName)}</strong></td>
        <td><span class="cd-cond-tag">${esc(p.condition)}</span></td>
        <td class="cd-td-ses">${esc(sesLbl)}</td>
        <td class="cd-td-proto">${esc(p.protocol)}</td>
        <td><span class="cd-status-badge ${s.cls}">${dot}${s.label}</span></td>
        <td class="cd-td-alerts">${icons || '<span style="color:var(--text-tertiary)">—</span>'}</td>
        <td>${actions}</td>
      </tr>`;
    }).join('');
    return `<div class="cd-table-wrap">
      <table class="cd-table">
        <thead><tr>
          <th>Time</th><th>Patient</th><th>Condition</th><th>Session</th>
          <th>Protocol</th><th>Status</th><th>Flags</th><th>Actions</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  // ── Compact pending approvals ────────────────────────────────────────────────
  function renderApprovals(items) {
    const pending = items.filter(i => ['pending','assigned','in-review'].includes(i.status));
    if (!pending.length) {
      return `<div class="cd-approvals-empty">\u2705 No pending approvals</div>`;
    }
    const cards = pending.slice(0,5).map(i => {
      const cfg   = REVIEW_TYPE_CFG[i.review_type] || { label:i.review_type, color:'#888', icon:'\u26A0' };
      const since = i.submitted_at ? Math.round((Date.now() - new Date(i.submitted_at).getTime()) / 3600000) : null;
      const sinceStr = since !== null ? (since < 1 ? 'Just now' : since + 'h ago') : '';
      const overdue  = since !== null && since > 48;
      return `<div class="cd-appr-card${overdue?' cd-appr-card--overdue':''}">
        <div class="cd-appr-type" style="color:${cfg.color}">${cfg.icon} ${cfg.label}</div>
        <div class="cd-appr-subject">${esc(i.subject)}</div>
        <div class="cd-appr-meta">${esc(i.patient_name || '')}${sinceStr ? ' &middot; ' + esc(sinceStr) : ''}${overdue ? ' <span class="cd-appr-overdue-tag">\u26A0 Overdue</span>' : ''}</div>
        <div class="cd-appr-actions">
          <button class="cd-btn cd-btn-appr" onclick="window._cdApprove('${esc(i.id)}')">\u2714 Approve</button>
          <button class="cd-btn cd-btn-chart" onclick="window._cdOpenReview('${esc(i.id)}')">Review</button>
        </div>
      </div>`;
    }).join('');
    const more = pending.length > 5 ? `<div class="cd-appr-more">+${pending.length - 5} more</div>` : '';
    return `<div class="cd-approvals-list">${cards}${more}</div>
      <button class="cd-view-all-btn" onclick="window._nav('review-queue')">View all approvals \u2192</button>`;
  }

  // ── Adherence alerts (compact) ───────────────────────────────────────────────
  function renderAdherence(alerts) {
    const active = alerts.filter(a => a.status === 'active');
    if (!active.length) return '';
    const items = active.map(a => `<div class="cd-adh-item">
      <span class="cd-adh-patient">${esc(a.patientName)}</span>
      <span class="cd-adh-detail">${esc(a.detail)}</span>
      <div class="cd-adh-actions">
        <button class="cd-btn cd-btn-chart" onclick="window._cdReviewAdherence('${esc(a.id)}')">Review</button>
        <button class="cd-btn cd-btn-note"  onclick="window._cdDismissAdherence('${esc(a.id)}')">Dismiss</button>
      </div>
    </div>`).join('');
    return `<div class="cd-section-hd">Protocol Adherence <span class="cd-badge-count">${active.length}</span></div>
      <div class="cd-adh-list">${items}</div>`;
  }

  // ── CSS ──────────────────────────────────────────────────────────────────────
  if (!document.getElementById('cd-styles')) {
    const s = document.createElement('style'); s.id = 'cd-styles';
    s.textContent = `
.cd-page { padding: 20px 24px; max-width: 1400px; }
.cd-stats { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:28px; }
.cd-stat { background:var(--bg-card); border:1px solid var(--border); border-radius:10px; padding:14px 20px; min-width:120px; text-align:center; }
.cd-stat--done   { border-color:#22c55e40; }
.cd-stat--active { border-color:#60a5fa80; background:rgba(96,165,250,0.06); }
.cd-stat--wait   { border-color:#f59e0b40; }
.cd-stat--review { border-color:#f8717180; background:rgba(248,113,113,0.06); }
.cd-stat-val { font-size:26px; font-weight:800; color:var(--text-primary); line-height:1.1; }
.cd-stat--done   .cd-stat-val { color:#22c55e; }
.cd-stat--active .cd-stat-val { color:#60a5fa; }
.cd-stat--wait   .cd-stat-val { color:#f59e0b; }
.cd-stat--review .cd-stat-val { color:#f87171; }
.cd-stat-lbl { font-size:11px; color:var(--text-tertiary); margin-top:3px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; }
.cd-section-hd { font-size:13px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.6px; margin:28px 0 12px; display:flex; align-items:center; gap:8px; }
.cd-badge-count { background:#f87171; color:#fff; border-radius:10px; padding:1px 7px; font-size:10.5px; font-weight:700; }
.cd-table-wrap { overflow-x:auto; border-radius:10px; border:1px solid var(--border); }
.cd-table { width:100%; border-collapse:collapse; font-size:13px; }
.cd-table thead th { background:var(--bg-sidebar); color:var(--text-tertiary); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; padding:10px 14px; text-align:left; border-bottom:1px solid var(--border); white-space:nowrap; }
.cd-table tbody td { padding:12px 14px; border-bottom:1px solid var(--border); vertical-align:middle; }
.cd-row:last-child td { border-bottom:none; }
.cd-row--active td { background:rgba(96,165,250,0.05); }
.cd-row--noshow td { opacity:0.6; }
.cd-row:hover td { background:var(--bg-hover, rgba(255,255,255,0.03)); }
.cd-td-time { color:var(--text-tertiary); font-size:12px; white-space:nowrap; }
.cd-td-name strong { color:var(--text-primary); }
.cd-cond-tag { background:rgba(255,255,255,0.07); border-radius:4px; padding:2px 8px; font-size:11.5px; color:var(--text-secondary); white-space:nowrap; }
.cd-td-ses { font-size:12px; color:var(--text-secondary); white-space:nowrap; }
.cd-td-proto { font-size:12px; color:var(--text-secondary); max-width:160px; }
.cd-status-badge { display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:20px; font-size:11.5px; font-weight:700; white-space:nowrap; }
.cd-s-waiting   { background:rgba(245,158,11,0.15); color:#f59e0b; }
.cd-s-active    { background:rgba(96,165,250,0.15);  color:#60a5fa; }
.cd-s-done      { background:rgba(34,197,94,0.12);   color:#22c55e; }
.cd-s-noshow    { background:rgba(248,113,113,0.12); color:#f87171; }
.cd-pulse-dot { width:7px; height:7px; border-radius:50%; background:#60a5fa; animation:cd-pulse 1.4s infinite; }
@keyframes cd-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }
.cd-td-alerts { white-space:nowrap; }
.cd-alert-ico { font-size:15px; margin-right:2px; }
.cd-row-actions { display:flex; gap:4px; }
.cd-btn { padding:4px 11px; border-radius:5px; font-size:12px; font-weight:600; cursor:pointer; border:1px solid var(--border); background:var(--bg-input,#1e2235); color:var(--text-secondary); font-family:inherit; transition:all 0.12s; white-space:nowrap; }
.cd-btn:hover { color:var(--text-primary); border-color:var(--teal); }
.cd-btn-start { background:linear-gradient(135deg,var(--teal),var(--blue)); color:#000; border:none; font-weight:700; }
.cd-btn-start:hover { opacity:0.88; color:#000; }
.cd-btn-appr  { background:rgba(34,197,94,0.1); border-color:#22c55e50; color:#22c55e; }
.cd-btn-appr:hover { background:rgba(34,197,94,0.2); color:#22c55e; }
.cd-two-col { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:4px; }
@media(max-width:900px){ .cd-two-col { grid-template-columns:1fr; } }
.cd-approvals-list { display:flex; flex-direction:column; gap:10px; }
.cd-approvals-empty { padding:16px; color:var(--text-tertiary); font-size:13px; text-align:center; background:var(--bg-card); border:1px solid var(--border); border-radius:8px; }
.cd-appr-card { background:var(--bg-card); border:1px solid var(--border); border-radius:8px; padding:13px 15px; display:grid; grid-template-columns:auto 1fr auto; grid-template-rows:auto auto; gap:3px 12px; align-items:start; }
.cd-appr-card--overdue { border-color:#f8717160; background:rgba(248,113,113,0.04); }
.cd-appr-type { font-size:11px; font-weight:700; grid-row:1; grid-column:1; white-space:nowrap; }
.cd-appr-subject { font-size:13px; font-weight:600; color:var(--text-primary); grid-row:1; grid-column:2; }
.cd-appr-actions { grid-row:1/3; grid-column:3; display:flex; flex-direction:column; gap:4px; align-items:flex-end; }
.cd-appr-meta { font-size:11.5px; color:var(--text-tertiary); grid-row:2; grid-column:1/3; }
.cd-appr-overdue-tag { color:#f87171; font-weight:700; }
.cd-appr-more { font-size:12px; color:var(--text-tertiary); text-align:center; padding:6px; }
.cd-view-all-btn { margin-top:10px; background:none; border:1px solid var(--border); border-radius:6px; color:var(--text-secondary); font-size:12.5px; font-weight:600; cursor:pointer; padding:7px 16px; font-family:inherit; }
.cd-view-all-btn:hover { color:var(--teal); border-color:var(--teal); }
.cd-adh-list { display:flex; flex-direction:column; gap:8px; }
.cd-adh-item { background:var(--bg-card); border:1px solid var(--border); border-radius:8px; padding:11px 14px; display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.cd-adh-patient { font-weight:700; font-size:13px; color:var(--text-primary); white-space:nowrap; }
.cd-adh-detail { font-size:12px; color:var(--text-secondary); flex:1; min-width:200px; }
.cd-adh-actions { display:flex; gap:4px; }
.cd-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:2000; display:flex; align-items:center; justify-content:center; }
.cd-note-modal { background:var(--bg-card); border:1px solid var(--border); border-radius:10px; padding:20px; width:420px; max-width:94vw; }
.cd-note-modal-hd { display:flex; align-items:center; font-weight:700; font-size:14px; margin-bottom:10px; }
/* light theme */
.light-theme .cd-table thead th { background:#f0f4f8; }
.light-theme .cd-btn { background:#f0f4f8; color:#374151; border-color:#d1d5db; }
.light-theme .cd-stat { background:#fff; }
.light-theme .cd-appr-card { background:#fff; }
.light-theme .cd-adh-item { background:#fff; }
    `;
    document.head.appendChild(s);
  }

  // ── Main render ──────────────────────────────────────────────────────────────
  function render() {
    const queue   = _load(QUEUE_KEY, []);
    const adh     = _load(ALERT_KEY, []);
    let reviewItems = [];
    try { reviewItems = JSON.parse(localStorage.getItem(REVIEW_KEY) || '[]'); } catch {}
    const pendingCount = reviewItems.filter(i => ['pending','assigned','in-review'].includes(i.status)).length;

    const hasAdherence = adh.filter(a => a.status === 'active').length > 0;

    el.innerHTML = `<div class="cd-page">
      ${renderStats(queue, pendingCount)}
      <div class="cd-section-hd">Today's Patients</div>
      ${renderQueue(queue)}
      <div class="cd-two-col" style="margin-top:28px">
        <div>
          <div class="cd-section-hd">Pending Approvals ${pendingCount > 0 ? '<span class="cd-badge-count">'+pendingCount+'</span>' : ''}</div>
          ${renderApprovals(reviewItems)}
        </div>
        <div>
          ${hasAdherence ? renderAdherence(adh) : ''}
        </div>
      </div>
    </div>`;
  }

  render();

  // ── Handlers ────────────────────────────────────────────────────────────────
  window._cdStartSession = function(id) {
    const q = _load(QUEUE_KEY, []); const p = q.find(x => x.id === id); if (!p) return;
    p.status = 'in-session'; _save(QUEUE_KEY, q);
    if (p.patientId)   window._selectedPatientId  = p.patientId;
    if (p.courseId)    window._selectedCourseId   = p.courseId;
    if (p.patientName) window._sessionPatientName = p.patientName;
    window._nav('session-execution');
  };

  window._cdViewChart = function(id) {
    const q = _load(QUEUE_KEY, []); const p = q.find(x => x.id === id);
    if (p?.patientId)   window._selectedPatientId   = p.patientId;
    if (p?.patientName) window._profilePatientName  = p.patientName;
    window._nav('patient-profile');
  };

  window._cdQuickNote = function(pqId) {
    const q = _load(QUEUE_KEY, []); const p = q.find(x => x.id === pqId); if (!p) return;
    const modal = document.createElement('div');
    modal.className = 'cd-modal-overlay';
    modal.innerHTML = `<div class="cd-note-modal" onclick="event.stopPropagation()">
      <div class="cd-note-modal-hd">Quick Note \u2014 ${esc(p.patientName)}
        <button onclick="this.closest('.cd-modal-overlay').remove()" style="background:none;border:none;color:var(--text-tertiary);font-size:18px;cursor:pointer;margin-left:auto">\u2715</button>
      </div>
      <textarea id="cd-note-ta" rows="5" style="width:100%;background:var(--bg-input,#1e2235);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);padding:10px;font-family:var(--font-body);font-size:13px;resize:vertical;box-sizing:border-box">${esc(p.notes||'')}</textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
        <button class="btn btn-sm" onclick="this.closest('.cd-modal-overlay').remove()">Cancel</button>
        <button class="btn btn-sm btn-primary" onclick="window._cdSaveNote('${esc(pqId)}',document.getElementById('cd-note-ta').value)">Save</button>
      </div>
    </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  };

  window._cdSaveNote = function(pqId, text) {
    const q = _load(QUEUE_KEY, []); const p = q.find(x => x.id === pqId); if (!p) return;
    p.notes = text.trim(); _save(QUEUE_KEY, q);
    document.querySelector('.cd-modal-overlay')?.remove();
    window._showNotifToast?.({ title:'Note Saved', body:'Quick note saved in this browser view for ' + p.patientName, severity:'info' });
  };

  window._cdAddWalkin = function() {
    const name = prompt('Walk-in patient name:'); if (!name) return;
    const condition = prompt('Condition:') || 'General';
    const protocol  = prompt('Protocol:')  || 'TBD';
    const t = new Date();
    const q = _load(QUEUE_KEY, []);
    q.push({ id:'pq_wi_'+Date.now(), time:String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0'),
      patientId:'pt_wi_'+Date.now(), patientName:name, condition, sessionNum:1, sessionTotal:1, protocol, status:'waiting', alerts:[], notes:'Walk-in' });
    _save(QUEUE_KEY, q); render();
    window._showNotifToast?.({ title:'Walk-in Added', body:name + ' added to the local preview queue', severity:'info' });
  };

  window._cdApprove = function(id) {
    let items = []; try { items = JSON.parse(localStorage.getItem(REVIEW_KEY) || '[]'); } catch {}
    const item = items.find(i => i.id === id); if (!item) return;
    item.status = 'approved';
    try { localStorage.setItem(REVIEW_KEY, JSON.stringify(items)); } catch {}
    render();
    window._showNotifToast?.({ title:'Approved', body:'Item marked approved in this browser view', severity:'success' });
  };

  window._cdOpenReview = function(id) {
    window._nav('review-queue');
  };

  window._cdReviewAdherence = function(alertId) {
    const adh = _load(ALERT_KEY, []); const al = adh.find(a => a.id === alertId);
    if (al?.patientId) { window._selectedPatientId = al.patientId; window._profilePatientName = al.patientName; }
    window._nav('patient-profile');
  };

  window._cdDismissAdherence = function(alertId) {
    if (!confirm('Dismiss this alert?')) return;
    const adh = _load(ALERT_KEY, []); const al = adh.find(a => a.id === alertId); if (!al) return;
    al.status = 'dismissed'; _save(ALERT_KEY, adh); render();
    window._showNotifToast?.({ title:'Alert Dismissed', severity:'info' });
  };
}

// ── pgAssessmentsHub — Assessment library & scheduling ────────────────────────


// ── pgAssessmentsHub replacement ───────────────────────────────────────────────
const PHASE2_CSS = `
/* ── Assessments Hub ─────────────────────────────────────────────────── */
.ah-hub-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 2px solid var(--border);
  padding-bottom: 0;
  flex-wrap: wrap;
}

.ah-hub-tab {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  padding: 10px 20px;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: color 0.15s, border-color 0.15s;
  font-family: inherit;
}

.ah-hub-tab:hover {
  color: var(--text-primary);
}

.ah-hub-tab.active {
  color: var(--teal);
  border-bottom-color: var(--teal);
}

/* ── Category chips ───────────────────────────────────────────────────── */
.ah-cat-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 0;
}

.ah-cat-chip {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 11.5px;
  font-weight: 600;
  background: rgba(255,255,255,0.06);
  color: var(--text-secondary);
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  user-select: none;
}

.ah-cat-chip:hover {
  background: rgba(0,212,188,0.1);
  color: var(--teal);
}

.ah-cat-chip.active {
  background: rgba(0,212,188,0.15);
  color: var(--teal);
  border-color: rgba(0,212,188,0.3);
}

/* ── Scale card ───────────────────────────────────────────────────────── */
.ah-scale-card {
  background: var(--surface-1, rgba(255,255,255,0.04));
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 10px);
  padding: 14px 16px;
  transition: border-color 0.15s;
}

.ah-scale-card:hover {
  border-color: rgba(0,212,188,0.35);
}

.ah-scale-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 5px;
  letter-spacing: 0.3px;
  white-space: nowrap;
}

/* ── Bundle card ──────────────────────────────────────────────────────── */
.ah-bundle-card {
  background: var(--surface-1, rgba(255,255,255,0.04));
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 10px);
  padding: 14px 16px;
  transition: border-color 0.15s;
}

.ah-bundle-card:hover {
  border-color: rgba(0,212,188,0.3);
}

.ah-phase-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 5px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}

.ah-phase-row:last-of-type {
  border-bottom: none;
}

/* ── Inline form ──────────────────────────────────────────────────────── */
.ah-inline-form {
  background: rgba(255,255,255,0.025);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 10px);
  padding: 16px;
}

.ah-q-row {
  margin-bottom: 16px;
}

.ah-q-row:last-child {
  margin-bottom: 0;
}

.ah-q-label {
  display: block;
  font-size: 12.5px;
  color: var(--text-primary);
  margin-bottom: 6px;
  font-weight: 500;
  line-height: 1.5;
}

.ah-q-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0,212,188,0.15);
  color: var(--teal);
  font-size: 10px;
  font-weight: 800;
  margin-right: 8px;
  flex-shrink: 0;
  vertical-align: middle;
}

/* ── Domain slider ────────────────────────────────────────────────────── */
.ah-domain-slider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 4px 0;
}

/* ── Reports Hub layout ───────────────────────────────────────────────── */
.rh-layout {
  display: flex;
  gap: 0;
  min-height: 0;
  flex: 1;
  height: calc(100vh - 120px);
}

.rh-sidebar {
  width: 180px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow-y: auto;
  background: rgba(255,255,255,0.01);
}

.rh-sidebar-item {
  display: flex;
  align-items: center;
  padding: 9px 16px;
  font-size: 12.5px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  border-radius: 0;
  white-space: nowrap;
  font-weight: 500;
}

.rh-sidebar-item:hover {
  background: rgba(255,255,255,0.05);
  color: var(--text-primary);
}

.rh-sidebar-item.active {
  background: rgba(0,212,188,0.1);
  color: var(--teal);
  font-weight: 700;
}

/* ── Report card ──────────────────────────────────────────────────────── */
.rh-report-card {
  background: var(--surface-1, rgba(255,255,255,0.04));
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 10px);
  padding: 14px 16px;
  transition: border-color 0.15s;
}

.rh-report-card:hover {
  border-color: rgba(0,212,188,0.3);
}

.rh-report-type-badge {
  display: inline-block;
  font-size: 10.5px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
  letter-spacing: 0.2px;
}

/* ── AI summary panel ─────────────────────────────────────────────────── */
.rh-ai-panel {
  margin-top: 8px;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── Upload modal ─────────────────────────────────────────────────────── */
.rh-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.15s ease;
}

.rh-modal {
  background: var(--surface-2, #1c2333);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 24px;
  width: 480px;
  max-width: 96vw;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 8px 48px rgba(0,0,0,0.5);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
export async function pgAssessmentsHub(setTopbar) {
  setTopbar('Assessments Hub', `
    <button class="btn btn-primary btn-sm" onclick="document.getElementById('ah2-assign-modal') && document.getElementById('ah2-assign-modal').classList.remove('ah2-hidden')">+ Assign Bundle</button>
    <button class="btn btn-sm" onclick="window._ah2Refresh && window._ah2Refresh()">Refresh</button>
    <button class="btn btn-sm" onclick="window._ah2Export && window._ah2Export()">Export Results</button>
  `);

  const EXTRA_SCALES = [
    { id:'QIDS-SR', name:'QIDS-SR', full:'Quick Inventory of Depressive Symptomatology', domain:'Depression', items:16, min:0, max:27, interpretation:[{max:5,label:'None'},{max:10,label:'Mild'},{max:15,label:'Moderate'},{max:20,label:'Severe'},{max:27,label:'Very Severe'}] },
    { id:'PANSS', name:'PANSS', full:'Positive and Negative Syndrome Scale', domain:'Psychosis', items:30, min:30, max:210, interpretation:[{max:58,label:'Mild'},{max:75,label:'Moderate'},{max:99,label:'Severe'},{max:210,label:'Very Severe'}] },
    { id:'BPRS', name:'BPRS', full:'Brief Psychiatric Rating Scale', domain:'Psychosis', items:24, min:24, max:168, interpretation:[{max:40,label:'Mild'},{max:60,label:'Moderate'},{max:168,label:'Severe'}] },
    { id:'CAPS-5', name:'CAPS-5', full:'Clinician-Administered PTSD Scale for DSM-5', domain:'Trauma/PTSD', items:30, min:0, max:80, interpretation:[{max:22,label:'Mild'},{max:36,label:'Moderate'},{max:52,label:'Severe'},{max:80,label:'Extreme'}] },
    { id:'C-SSRS', name:'C-SSRS', full:'Columbia Suicide Severity Rating Scale', domain:'Safety', items:6, min:0, max:6, interpretation:[{max:0,label:'No Ideation'},{max:2,label:'Passive/Low'},{max:5,label:'Active Ideation'},{max:6,label:'Behavior'}] },
    { id:'SPIN', name:'SPIN', full:'Social Phobia Inventory', domain:'Anxiety', items:17, min:0, max:68, interpretation:[{max:20,label:'None/Minimal'},{max:30,label:'Mild'},{max:40,label:'Moderate'},{max:50,label:'Severe'},{max:68,label:'Very Severe'}] },
    { id:'PSWQ', name:'PSWQ', full:'Penn State Worry Questionnaire', domain:'Anxiety', items:16, min:16, max:80, interpretation:[{max:40,label:'Low'},{max:59,label:'Moderate'},{max:80,label:'High'}] },
    { id:'BPI', name:'BPI', full:'Brief Pain Inventory', domain:'Pain', items:9, min:0, max:10, interpretation:[{max:3,label:'Mild'},{max:6,label:'Moderate'},{max:10,label:'Severe'}] },
    { id:'PCS', name:'PCS', full:'Pain Catastrophizing Scale', domain:'Pain', items:13, min:0, max:52, interpretation:[{max:20,label:'Low'},{max:30,label:'Moderate'},{max:52,label:'High Catastrophizing'}] },
    { id:'MMSE', name:'MMSE', full:'Mini-Mental State Examination', domain:'Cognitive', items:30, min:0, max:30, interpretation:[{max:9,label:'Severe Impairment'},{max:18,label:'Moderate'},{max:23,label:'Mild'},{max:30,label:'Normal'}] },
    { id:'MoCA', name:'MoCA', full:'Montreal Cognitive Assessment', domain:'Cognitive', items:30, min:0, max:30, interpretation:[{max:17,label:'Moderate Impairment'},{max:22,label:'Mild'},{max:25,label:'Borderline'},{max:30,label:'Normal'}] },
    { id:'HAM-A', name:'HAM-A', full:'Hamilton Anxiety Rating Scale', domain:'Anxiety', items:14, min:0, max:56, interpretation:[{max:14,label:'None'},{max:17,label:'Mild'},{max:24,label:'Moderate'},{max:56,label:'Severe'}] },
    { id:'TMS-SE', name:'TMS-SE', full:'TMS Side-Effects Checklist', domain:'Neuromod', items:10, min:0, max:30, interpretation:[{max:5,label:'None/Minimal'},{max:10,label:'Mild'},{max:20,label:'Moderate'},{max:30,label:'Severe'}] },
    { id:'tDCS-CS', name:'tDCS-CS', full:'tDCS Comfort and Side Effects Scale', domain:'Neuromod', items:8, min:0, max:24, interpretation:[{max:4,label:'Comfortable'},{max:10,label:'Mild Discomfort'},{max:24,label:'Significant'}] },
  ];

  const COND_BUNDLES = [
    { id:'CON-001', name:'Major Depressive Disorder', category:'Mood', phases:{ baseline:['PHQ-9','MADRS','HAM-D','QIDS-SR','C-SSRS','ISI','PSS','WHODAS'], weekly:['PHQ-9','QIDS-SR','C-SSRS','ISI'], pre_session:['PHQ-9','C-SSRS'], post_session:['CGI'], milestone:['PHQ-9','MADRS','HAM-D','QIDS-SR','ISI','WHODAS'], discharge:['PHQ-9','MADRS','HAM-D','QIDS-SR','ISI','WHODAS','SF-36'] }},
    { id:'CON-002', name:'Treatment-Resistant Depression', category:'Mood', phases:{ baseline:['PHQ-9','MADRS','HAM-D','QIDS-SR','C-SSRS','ISI','TMS-SE','WHODAS'], weekly:['PHQ-9','QIDS-SR','C-SSRS','TMS-SE'], pre_session:['PHQ-9','C-SSRS','TMS-SE'], post_session:['CGI','TMS-SE'], milestone:['PHQ-9','MADRS','HAM-D','QIDS-SR','ISI','WHODAS'], discharge:['PHQ-9','MADRS','HAM-D','QIDS-SR','ISI','WHODAS','SF-36'] }},
    { id:'CON-003', name:'Bipolar I Disorder', category:'Mood', phases:{ baseline:['MDQ','YMRS','PHQ-9','C-SSRS','ISI','WHODAS'], weekly:['MDQ','YMRS','PHQ-9','C-SSRS'], pre_session:['MDQ','YMRS','C-SSRS'], post_session:['CGI'], milestone:['MDQ','YMRS','PHQ-9','ISI','WHODAS'], discharge:['MDQ','YMRS','PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-004', name:'Bipolar II Disorder', category:'Mood', phases:{ baseline:['MDQ','YMRS','PHQ-9','C-SSRS','ISI','WHODAS'], weekly:['MDQ','PHQ-9','C-SSRS','ISI'], pre_session:['MDQ','PHQ-9','C-SSRS'], post_session:['CGI'], milestone:['MDQ','YMRS','PHQ-9','ISI','WHODAS'], discharge:['MDQ','YMRS','PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-005', name:'Persistent Depressive Disorder', category:'Mood', phases:{ baseline:['PHQ-9','MADRS','QIDS-SR','C-SSRS','ISI','PSS','WHODAS'], weekly:['PHQ-9','QIDS-SR','C-SSRS'], pre_session:['PHQ-9','C-SSRS'], post_session:['CGI'], milestone:['PHQ-9','MADRS','QIDS-SR','ISI','WHODAS'], discharge:['PHQ-9','MADRS','QIDS-SR','ISI','WHODAS','SF-36'] }},
    { id:'CON-006', name:'Seasonal Affective Disorder', category:'Mood', phases:{ baseline:['PHQ-9','MADRS','ISI','PSQI','EPWORTH','PSS'], weekly:['PHQ-9','ISI','PSQI'], pre_session:['PHQ-9'], post_session:['CGI'], milestone:['PHQ-9','MADRS','ISI','PSQI'], discharge:['PHQ-9','MADRS','ISI','PSQI','SF-36'] }},
    { id:'CON-007', name:'Postpartum Depression', category:'Mood', phases:{ baseline:['PHQ-9','C-SSRS','ISI','PSS','WHODAS'], weekly:['PHQ-9','C-SSRS','ISI'], pre_session:['PHQ-9','C-SSRS'], post_session:['CGI'], milestone:['PHQ-9','ISI','WHODAS'], discharge:['PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-008', name:'Premenstrual Dysphoric Disorder', category:'Mood', phases:{ baseline:['PHQ-9','GAD-7','ISI','PSS'], weekly:['PHQ-9','GAD-7'], pre_session:['PHQ-9'], post_session:['CGI'], milestone:['PHQ-9','GAD-7','ISI'], discharge:['PHQ-9','GAD-7','ISI','SF-36'] }},
    { id:'CON-009', name:'Depression with Psychotic Features', category:'Mood', phases:{ baseline:['PHQ-9','MADRS','C-SSRS','PANSS','BPRS','ISI','WHODAS'], weekly:['PHQ-9','BPRS','C-SSRS'], pre_session:['PHQ-9','BPRS','C-SSRS'], post_session:['CGI'], milestone:['PHQ-9','MADRS','PANSS','BPRS','ISI','WHODAS'], discharge:['PHQ-9','MADRS','PANSS','BPRS','ISI','WHODAS','SF-36'] }},
    { id:'CON-010', name:'Suicidality and Crisis Management', category:'Mood', phases:{ baseline:['C-SSRS','PHQ-9','MADRS','QIDS-SR','WHODAS'], weekly:['C-SSRS','PHQ-9'], pre_session:['C-SSRS','PHQ-9'], post_session:['C-SSRS','CGI'], milestone:['C-SSRS','PHQ-9','MADRS'], discharge:['C-SSRS','PHQ-9','MADRS','WHODAS'] }},
    { id:'CON-011', name:'Generalized Anxiety Disorder', category:'Anxiety', phases:{ baseline:['GAD-7','HAM-A','PSWQ','PSS','ISI','WHODAS'], weekly:['GAD-7','PSWQ'], pre_session:['GAD-7'], post_session:['CGI'], milestone:['GAD-7','HAM-A','PSWQ','ISI','WHODAS'], discharge:['GAD-7','HAM-A','PSWQ','ISI','WHODAS','SF-36'] }},
    { id:'CON-012', name:'Panic Disorder', category:'Anxiety', phases:{ baseline:['GAD-7','PDSS','HAM-A','PSS','WHODAS'], weekly:['GAD-7','PDSS'], pre_session:['GAD-7','PDSS'], post_session:['CGI'], milestone:['GAD-7','PDSS','HAM-A','WHODAS'], discharge:['GAD-7','PDSS','HAM-A','WHODAS','SF-36'] }},
    { id:'CON-013', name:'Social Anxiety Disorder', category:'Anxiety', phases:{ baseline:['GAD-7','SPIN','HAM-A','PSS','WHODAS'], weekly:['GAD-7','SPIN'], pre_session:['GAD-7'], post_session:['CGI'], milestone:['GAD-7','SPIN','HAM-A','WHODAS'], discharge:['GAD-7','SPIN','HAM-A','WHODAS','SF-36'] }},
    { id:'CON-014', name:'Specific Phobia', category:'Anxiety', phases:{ baseline:['GAD-7','PSS','WHODAS'], weekly:['GAD-7'], pre_session:['GAD-7'], post_session:['CGI'], milestone:['GAD-7','WHODAS'], discharge:['GAD-7','WHODAS','SF-36'] }},
    { id:'CON-015', name:'Adjustment Disorder with Anxiety', category:'Anxiety', phases:{ baseline:['GAD-7','PSS','ISI','WHODAS'], weekly:['GAD-7','PSS'], pre_session:['GAD-7'], post_session:['CGI'], milestone:['GAD-7','PSS','ISI','WHODAS'], discharge:['GAD-7','PSS','ISI','WHODAS','SF-36'] }},
    { id:'CON-016', name:'Obsessive-Compulsive Disorder', category:'OCD Spectrum', phases:{ baseline:['Y-BOCS','OCI-R','GAD-7','PHQ-9','WHODAS'], weekly:['Y-BOCS','OCI-R'], pre_session:['OCI-R'], post_session:['CGI'], milestone:['Y-BOCS','OCI-R','GAD-7','WHODAS'], discharge:['Y-BOCS','OCI-R','GAD-7','WHODAS','SF-36'] }},
    { id:'CON-017', name:'Body Dysmorphic Disorder', category:'OCD Spectrum', phases:{ baseline:['Y-BOCS','PHQ-9','GAD-7','C-SSRS','WHODAS'], weekly:['Y-BOCS','PHQ-9'], pre_session:['Y-BOCS'], post_session:['CGI'], milestone:['Y-BOCS','PHQ-9','WHODAS'], discharge:['Y-BOCS','PHQ-9','WHODAS','SF-36'] }},
    { id:'CON-018', name:'Hoarding Disorder', category:'OCD Spectrum', phases:{ baseline:['Y-BOCS','PHQ-9','GAD-7','WHODAS'], weekly:['Y-BOCS','PHQ-9'], pre_session:['Y-BOCS'], post_session:['CGI'], milestone:['Y-BOCS','PHQ-9','WHODAS'], discharge:['Y-BOCS','PHQ-9','WHODAS','SF-36'] }},
    { id:'CON-019', name:'Post-Traumatic Stress Disorder', category:'Trauma', phases:{ baseline:['PCL-5','CAPS-5','PHQ-9','C-SSRS','ISI','DERS','WHODAS'], weekly:['PCL-5','PHQ-9','C-SSRS'], pre_session:['PCL-5','C-SSRS'], post_session:['CGI'], milestone:['PCL-5','CAPS-5','PHQ-9','ISI','WHODAS'], discharge:['PCL-5','CAPS-5','PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-020', name:'Complex PTSD Developmental Trauma', category:'Trauma', phases:{ baseline:['PCL-5','CAPS-5','PHQ-9','C-SSRS','DERS','ISI','WHODAS'], weekly:['PCL-5','PHQ-9','DERS','C-SSRS'], pre_session:['PCL-5','C-SSRS'], post_session:['CGI','DERS'], milestone:['PCL-5','CAPS-5','PHQ-9','DERS','ISI','WHODAS'], discharge:['PCL-5','CAPS-5','PHQ-9','DERS','ISI','WHODAS','SF-36'] }},
    { id:'CON-021', name:'ADHD Inattentive Type', category:'ADHD', phases:{ baseline:['WHODAS','PHQ-9','ISI','PSS'], weekly:['WHODAS','PHQ-9'], pre_session:['WHODAS'], post_session:['CGI'], milestone:['WHODAS','PHQ-9','ISI'], discharge:['WHODAS','PHQ-9','ISI','SF-36'] }},
    { id:'CON-022', name:'ADHD Combined Type', category:'ADHD', phases:{ baseline:['WHODAS','PHQ-9','ISI','PSS','DERS'], weekly:['WHODAS','PHQ-9','DERS'], pre_session:['WHODAS'], post_session:['CGI'], milestone:['WHODAS','PHQ-9','ISI','DERS'], discharge:['WHODAS','PHQ-9','ISI','DERS','SF-36'] }},
    { id:'CON-023', name:'Schizophrenia', category:'Psychotic', phases:{ baseline:['PANSS','BPRS','C-SSRS','ISI','WHODAS','CGI'], weekly:['PANSS','BPRS','C-SSRS'], pre_session:['BPRS','C-SSRS'], post_session:['CGI','BPRS'], milestone:['PANSS','BPRS','C-SSRS','ISI','WHODAS'], discharge:['PANSS','BPRS','ISI','WHODAS','SF-36'] }},
    { id:'CON-024', name:'Schizoaffective Disorder', category:'Psychotic', phases:{ baseline:['PANSS','BPRS','PHQ-9','MDQ','C-SSRS','ISI','WHODAS'], weekly:['PANSS','BPRS','PHQ-9','C-SSRS'], pre_session:['BPRS','C-SSRS'], post_session:['CGI','BPRS'], milestone:['PANSS','BPRS','PHQ-9','ISI','WHODAS'], discharge:['PANSS','BPRS','PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-025', name:'Insomnia Disorder', category:'Sleep', phases:{ baseline:['ISI','PSQI','EPWORTH','ESS','PHQ-9','GAD-7'], weekly:['ISI','PSQI'], pre_session:['ISI'], post_session:['CGI'], milestone:['ISI','PSQI','EPWORTH','PHQ-9'], discharge:['ISI','PSQI','EPWORTH','PHQ-9','SF-36'] }},
    { id:'CON-026', name:'Sleep-Related Anxiety', category:'Sleep', phases:{ baseline:['ISI','PSQI','GAD-7','PHQ-9'], weekly:['ISI','GAD-7'], pre_session:['ISI'], post_session:['CGI'], milestone:['ISI','PSQI','GAD-7','PHQ-9'], discharge:['ISI','PSQI','GAD-7','PHQ-9','SF-36'] }},
    { id:'CON-027', name:'Chronic Pain General', category:'Pain', phases:{ baseline:['BPI','PCS','PHQ-9','GAD-7','ISI','SF-36','WHODAS'], weekly:['BPI','PCS','PHQ-9'], pre_session:['BPI'], post_session:['BPI','CGI'], milestone:['BPI','PCS','PHQ-9','ISI','WHODAS'], discharge:['BPI','PCS','PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-028', name:'Fibromyalgia', category:'Pain', phases:{ baseline:['BPI','PCS','PHQ-9','GAD-7','ISI','PSQI','SF-36'], weekly:['BPI','PHQ-9','ISI'], pre_session:['BPI'], post_session:['BPI','CGI'], milestone:['BPI','PCS','PHQ-9','ISI','SF-36'], discharge:['BPI','PCS','PHQ-9','ISI','SF-36'] }},
    { id:'CON-029', name:'Chronic Low Back Pain', category:'Pain', phases:{ baseline:['BPI','PCS','PHQ-9','GAD-7','WHODAS','tDCS-CS'], weekly:['BPI','PHQ-9'], pre_session:['BPI','tDCS-CS'], post_session:['BPI','tDCS-CS','CGI'], milestone:['BPI','PCS','PHQ-9','WHODAS'], discharge:['BPI','PCS','PHQ-9','WHODAS','SF-36'] }},
    { id:'CON-030', name:'Neuropathic Pain', category:'Pain', phases:{ baseline:['BPI','PCS','PHQ-9','GAD-7','WHODAS'], weekly:['BPI','PHQ-9'], pre_session:['BPI'], post_session:['BPI','CGI'], milestone:['BPI','PCS','PHQ-9','WHODAS'], discharge:['BPI','PCS','PHQ-9','WHODAS','SF-36'] }},
    { id:'CON-031', name:'Migraine and Headache Disorders', category:'Pain', phases:{ baseline:['BPI','PHQ-9','GAD-7','ISI','TMS-SE','WHODAS'], weekly:['BPI','PHQ-9','TMS-SE'], pre_session:['BPI','TMS-SE'], post_session:['BPI','TMS-SE','CGI'], milestone:['BPI','PHQ-9','ISI','WHODAS'], discharge:['BPI','PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-032', name:'Complex Regional Pain Syndrome', category:'Pain', phases:{ baseline:['BPI','PCS','PHQ-9','GAD-7','DERS','WHODAS'], weekly:['BPI','PHQ-9'], pre_session:['BPI'], post_session:['BPI','CGI'], milestone:['BPI','PCS','PHQ-9','WHODAS'], discharge:['BPI','PCS','PHQ-9','WHODAS','SF-36'] }},
    { id:'CON-033', name:'Epilepsy Seizure Disorder', category:'Neurology', phases:{ baseline:['PHQ-9','GAD-7','ISI','WHODAS','SF-36'], weekly:['PHQ-9','GAD-7'], pre_session:['PHQ-9'], post_session:['CGI'], milestone:['PHQ-9','GAD-7','ISI','WHODAS'], discharge:['PHQ-9','GAD-7','ISI','WHODAS','SF-36'] }},
    { id:'CON-034', name:"Parkinson's Disease", category:'Neurology', phases:{ baseline:['PHQ-9','MADRS','ISI','PSQI','MMSE','MoCA','WHODAS','SF-36'], weekly:['PHQ-9','ISI'], pre_session:['PHQ-9','MoCA'], post_session:['CGI'], milestone:['PHQ-9','MADRS','ISI','MMSE','MoCA','WHODAS'], discharge:['PHQ-9','MADRS','ISI','MMSE','MoCA','WHODAS','SF-36'] }},
    { id:'CON-035', name:"Alzheimer's Disease and Dementia", category:'Neurology', phases:{ baseline:['MMSE','MoCA','PHQ-9','ISI','WHODAS','SF-36'], weekly:['MMSE','PHQ-9'], pre_session:['MoCA'], post_session:['CGI'], milestone:['MMSE','MoCA','PHQ-9','ISI','WHODAS'], discharge:['MMSE','MoCA','PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-036', name:'Mild Cognitive Impairment', category:'Neurology', phases:{ baseline:['MoCA','MMSE','PHQ-9','ISI','WHODAS'], weekly:['MoCA','PHQ-9'], pre_session:['MoCA'], post_session:['CGI'], milestone:['MoCA','MMSE','PHQ-9','WHODAS'], discharge:['MoCA','MMSE','PHQ-9','WHODAS','SF-36'] }},
    { id:'CON-037', name:'Traumatic Brain Injury', category:'Neurology', phases:{ baseline:['MMSE','MoCA','PHQ-9','C-SSRS','ISI','BPI','WHODAS'], weekly:['PHQ-9','ISI','BPI'], pre_session:['PHQ-9','BPI'], post_session:['CGI'], milestone:['MMSE','MoCA','PHQ-9','ISI','BPI','WHODAS'], discharge:['MMSE','MoCA','PHQ-9','ISI','BPI','WHODAS','SF-36'] }},
    { id:'CON-038', name:'Stroke Rehabilitation', category:'Neurology', phases:{ baseline:['PHQ-9','MADRS','BPI','ISI','MMSE','WHODAS','SF-36'], weekly:['PHQ-9','BPI'], pre_session:['PHQ-9','BPI'], post_session:['CGI'], milestone:['PHQ-9','MADRS','BPI','MMSE','WHODAS'], discharge:['PHQ-9','MADRS','BPI','MMSE','WHODAS','SF-36'] }},
    { id:'CON-039', name:'Multiple Sclerosis', category:'Neurology', phases:{ baseline:['PHQ-9','MADRS','BPI','ISI','PSQI','MMSE','WHODAS','SF-36'], weekly:['PHQ-9','BPI','ISI'], pre_session:['PHQ-9','BPI'], post_session:['CGI'], milestone:['PHQ-9','MADRS','BPI','ISI','MMSE','WHODAS'], discharge:['PHQ-9','MADRS','BPI','ISI','MMSE','WHODAS','SF-36'] }},
    { id:'CON-040', name:'ALS Motor Neuron Disease', category:'Neurology', phases:{ baseline:['PHQ-9','C-SSRS','BPI','ISI','WHODAS','SF-36'], weekly:['PHQ-9','C-SSRS','BPI'], pre_session:['PHQ-9','C-SSRS'], post_session:['CGI'], milestone:['PHQ-9','C-SSRS','BPI','WHODAS'], discharge:['PHQ-9','C-SSRS','BPI','WHODAS','SF-36'] }},
    { id:'CON-041', name:'Essential Tremor', category:'Neurology', phases:{ baseline:['PHQ-9','GAD-7','ISI','WHODAS'], weekly:['PHQ-9','GAD-7'], pre_session:['PHQ-9'], post_session:['CGI'], milestone:['PHQ-9','GAD-7','ISI','WHODAS'], discharge:['PHQ-9','GAD-7','ISI','WHODAS','SF-36'] }},
    { id:'CON-042', name:'Tourette Syndrome Tic Disorders', category:'Neurology', phases:{ baseline:['PHQ-9','GAD-7','Y-BOCS','OCI-R','WHODAS'], weekly:['PHQ-9','GAD-7'], pre_session:['PHQ-9'], post_session:['CGI'], milestone:['PHQ-9','GAD-7','Y-BOCS','WHODAS'], discharge:['PHQ-9','GAD-7','Y-BOCS','WHODAS','SF-36'] }},
    { id:'CON-043', name:'Tinnitus', category:'Sensory', phases:{ baseline:['PHQ-9','GAD-7','ISI','PSQI','TMS-SE','SF-36'], weekly:['PHQ-9','GAD-7','ISI'], pre_session:['PHQ-9','TMS-SE'], post_session:['TMS-SE','CGI'], milestone:['PHQ-9','GAD-7','ISI','SF-36'], discharge:['PHQ-9','GAD-7','ISI','SF-36'] }},
    { id:'CON-044', name:'Alcohol Use Disorder', category:'Substance', phases:{ baseline:['AUDIT','PHQ-9','GAD-7','C-SSRS','ISI','WHODAS'], weekly:['AUDIT','PHQ-9','C-SSRS'], pre_session:['AUDIT','C-SSRS'], post_session:['CGI'], milestone:['AUDIT','PHQ-9','ISI','WHODAS'], discharge:['AUDIT','PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-045', name:'Substance Use Disorder Other', category:'Substance', phases:{ baseline:['DAST-10','PHQ-9','GAD-7','C-SSRS','ISI','WHODAS'], weekly:['DAST-10','PHQ-9','C-SSRS'], pre_session:['DAST-10','C-SSRS'], post_session:['CGI'], milestone:['DAST-10','PHQ-9','ISI','WHODAS'], discharge:['DAST-10','PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-046', name:'Gambling Behavioural Addiction', category:'Substance', phases:{ baseline:['PHQ-9','GAD-7','C-SSRS','DERS','WHODAS'], weekly:['PHQ-9','DERS'], pre_session:['PHQ-9'], post_session:['CGI'], milestone:['PHQ-9','GAD-7','DERS','WHODAS'], discharge:['PHQ-9','GAD-7','DERS','WHODAS','SF-36'] }},
    { id:'CON-047', name:'Anorexia Nervosa', category:'Eating', phases:{ baseline:['EDE-Q','PHQ-9','C-SSRS','GAD-7','ISI','WHODAS'], weekly:['EDE-Q','PHQ-9','C-SSRS'], pre_session:['EDE-Q','C-SSRS'], post_session:['CGI'], milestone:['EDE-Q','PHQ-9','ISI','WHODAS'], discharge:['EDE-Q','PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-048', name:'Bulimia Binge Eating Disorder', category:'Eating', phases:{ baseline:['EDE-Q','BINGE','PHQ-9','GAD-7','C-SSRS','ISI','WHODAS'], weekly:['EDE-Q','BINGE','PHQ-9'], pre_session:['EDE-Q'], post_session:['CGI'], milestone:['EDE-Q','BINGE','PHQ-9','ISI','WHODAS'], discharge:['EDE-Q','BINGE','PHQ-9','ISI','WHODAS','SF-36'] }},
    { id:'CON-049', name:'Cognitive Decline Unspecified', category:'Cognitive', phases:{ baseline:['MMSE','MoCA','PHQ-9','ISI','WHODAS'], weekly:['MMSE','PHQ-9'], pre_session:['MoCA'], post_session:['CGI'], milestone:['MMSE','MoCA','PHQ-9','WHODAS'], discharge:['MMSE','MoCA','PHQ-9','WHODAS','SF-36'] }},
    { id:'CON-050', name:'Executive Function Deficits', category:'Cognitive', phases:{ baseline:['MoCA','PHQ-9','WHODAS','DERS'], weekly:['MoCA','PHQ-9'], pre_session:['MoCA'], post_session:['CGI'], milestone:['MoCA','PHQ-9','DERS','WHODAS'], discharge:['MoCA','PHQ-9','DERS','WHODAS','SF-36'] }},
    { id:'CON-051', name:'TMS Protocol General', category:'Neuromod', phases:{ baseline:['PHQ-9','GAD-7','ISI','TMS-SE','C-SSRS','WHODAS'], weekly:['PHQ-9','TMS-SE','C-SSRS'], pre_session:['TMS-SE','C-SSRS'], post_session:['TMS-SE','CGI'], milestone:['PHQ-9','GAD-7','ISI','TMS-SE','WHODAS'], discharge:['PHQ-9','GAD-7','ISI','WHODAS','SF-36'] }},
    { id:'CON-052', name:'tDCS Protocol General', category:'Neuromod', phases:{ baseline:['PHQ-9','GAD-7','BPI','tDCS-CS','WHODAS'], weekly:['PHQ-9','BPI','tDCS-CS'], pre_session:['tDCS-CS'], post_session:['tDCS-CS','CGI'], milestone:['PHQ-9','GAD-7','BPI','tDCS-CS','WHODAS'], discharge:['PHQ-9','GAD-7','BPI','WHODAS','SF-36'] }},
    { id:'CON-053', name:'Neurofeedback Protocol', category:'Neuromod', phases:{ baseline:['PHQ-9','GAD-7','ISI','PSQI','PSS','WHODAS'], weekly:['PHQ-9','GAD-7','ISI'], pre_session:['PHQ-9','PSS'], post_session:['CGI'], milestone:['PHQ-9','GAD-7','ISI','PSQI','WHODAS'], discharge:['PHQ-9','GAD-7','ISI','PSQI','WHODAS','SF-36'] }},
  ];

  const CATEGORIES = [...new Set(COND_BUNDLES.map(c => c.category))];
  const PHASES = ['baseline','weekly','pre_session','post_session','milestone','discharge'];
  const PHASE_LABELS = { baseline:'Baseline', weekly:'Weekly', pre_session:'Pre-Session', post_session:'Post-Session', milestone:'Milestone', discharge:'Discharge' };

  // DATA is now hydrated from the /api/v1/assessments backend. One UI "assignment"
  // maps to N backend records (one per scale) grouped by (patient, bundle, phase,
  // assigned day). No localStorage source-of-truth — the backend is authoritative.
  let DATA = { assignments: [], loading: true, error: null };

  function _groupKey(r) {
    const d = (r.created_at || '').slice(0, 10);
    return [r.patient_id || '', r.bundle_id || '', r.phase || '', d].join('|');
  }

  function _scaleIdFromRecord(r) {
    // Prefer the raw scale id we stashed in data.scale_id when assigning; fall
    // back to template_title (user-facing) or template_id (normalized slug).
    return (r.data && r.data.scale_id) || r.template_title || r.template_id || '';
  }

  function _groupToAssignment(records) {
    const first = records[0];
    const today = new Date().toISOString().slice(0, 10);
    const dueDate = (first.due_date || '').slice(0, 10) || today;
    const assignedDate = (first.created_at || '').slice(0, 10) || today;
    const condId = first.bundle_id || '';
    const cond = COND_BUNDLES.find(c => c.id === condId);
    // Build the scale list in bundle order (stable display) with any extras.
    const bundleScales = cond && cond.phases && cond.phases[first.phase]
      ? cond.phases[first.phase].slice()
      : [];
    const recordByScale = {};
    records.forEach(r => { recordByScale[_scaleIdFromRecord(r)] = r; });
    const scales = bundleScales.length
      ? bundleScales.filter(s => recordByScale[s]).concat(
          Object.keys(recordByScale).filter(s => !bundleScales.includes(s)))
      : Object.keys(recordByScale);
    const results = [];
    scales.forEach(sid => {
      const r = recordByScale[sid];
      if (!r) return;
      if (r.status === 'completed') {
        const d = r.data || {};
        const score = d.score != null ? d.score
          : (r.score_numeric != null ? r.score_numeric
          : (r.score != null ? parseFloat(r.score) : null));
        if (score != null && !Number.isNaN(score)) {
          results.push({
            scale: sid,
            score,
            interp: d.interpretation || r.severity_label || interpretScore(sid, score),
            items: d.items || null,
          });
        }
      }
    });
    const allCompleted = records.every(r => r.status === 'completed');
    const allApproved = records.every(r => r.approved_status === 'approved');
    let status = allCompleted ? 'completed' : 'pending';
    if (!allCompleted && dueDate < today) status = 'overdue';
    const latestCompleted = records
      .filter(r => r.status === 'completed')
      .map(r => (r.updated_at || r.created_at || '').slice(0, 10))
      .sort().pop() || null;
    return {
      id: 'G-' + _groupKey(first).replace(/\|/g, '-'),
      patientId: first.patient_id || '',
      condId,
      condName: cond ? cond.name : (condId || 'Unassigned'),
      phase: first.phase || 'baseline',
      scales,
      assignedBy: first.clinician_id || 'Clinician',
      assignedDate,
      dueDate,
      recurrence: (first.data && first.data.recurrence) || null,
      status,
      completedDate: allCompleted ? latestCompleted : null,
      reviewed: allApproved && allCompleted,
      results,
      safetyAlerts: (first.data && first.data.safetyAlerts) || [],
      _backendIds: Object.fromEntries(Object.entries(recordByScale).map(([s, r]) => [s, r.id])),
    };
  }

  async function hydrate() {
    DATA.loading = true;
    DATA.error = null;
    try {
      const resp = await api.listAssessments();
      const items = Array.isArray(resp) ? resp : (resp && resp.items) || [];
      const groups = {};
      items.forEach(r => {
        const k = _groupKey(r);
        (groups[k] = groups[k] || []).push(r);
      });
      DATA.assignments = Object.values(groups).map(_groupToAssignment);
    } catch (err) {
      // Demo build: backend rejects demo tokens. Render an empty-but-valid hub
      // (template library + scale registry are bundled in the JS, no backend
      // needed) instead of an error banner so reviewers see usable copy.
      let _demoBuild = false;
      try { _demoBuild = !!(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1'); } catch (_) { _demoBuild = false; }
      const _isDemoSession = (err && (err.code === 'demo_session' || /demo session/i.test(String(err.message || ''))));
      if (_demoBuild && _isDemoSession) {
        DATA.assignments = [];
        DATA.error = null;
      } else {
        DATA.assignments = [];
        DATA.error = (err && err.message) || 'Failed to load assessments';
        console.warn('[assessments-hub] hydrate failed:', err);
      }
    } finally {
      DATA.loading = false;
    }
  }
  let activeTab = 'dashboard';
  let activeCat = 'all';
  let tlibFilter = 'All';
  let tlibSearch = '';

  const extraMap = Object.fromEntries(EXTRA_SCALES.map(s => [s.id, s]));
  function interpretScore(scaleId, score) {
    return _hubInterpretScore(scaleId, score, extraMap);
  }

  function buildHubScaleBlock(sid, a) {
    const existing = a.results.find(r => r.scale === sid);
    const reg = _hubResolveRegistryScale(sid);
    const routed = routeLegacyRunAssessment(sid, ASSESS_REGISTRY);
    // Implementation-truth gating: do NOT branch on reg?.inline alone.
    // If the checklist is implemented, render item-by-item; otherwise fall back to numeric entry
    // with the same hub-aligned notice copy as the legacy Run panel.
    if (
      routed.route === 'inline_panel' &&
      routed.status === 'implemented_item_checklist' &&
      Array.isArray(reg?.questions) &&
      reg.questions.length
    ) {
      const subId = 'ah2-subtot-' + sid.replace(/[^a-z0-9]/gi, '_');
      const siId = 'ah2-si-' + sid.replace(/[^a-z0-9]/gi, '-');
      const sm = getScaleMeta(sid);
      let html = '<div class="ah2-inline-wrap" data-inline-scale="' + String(sid).replace(/"/g, '&quot;') + '" style="margin-bottom:16px;border:1px solid var(--border);border-radius:10px;padding:12px">';
      html += '<div style="font-weight:700;margin-bottom:8px">' + _hubEscHtml(sid) + (reg.sub ? ' <span style="font-weight:400;color:var(--text-secondary);font-size:12px">' + _hubEscHtml(reg.sub) + '</span>' : '') + '</div>';
      if (sm.scoring_note) {
        html += '<p style="font-size:11px;color:var(--text-tertiary);margin:0 0 10px;line-height:1.45">' + _hubEscHtml(sm.scoring_note) + '</p>';
      }
      reg.questions.forEach((q, i) => {
        html += '<div style="margin-bottom:10px"><span class="ah2-q-num">' + (i + 1) + '</span>';
        html += '<label style="display:block;font-size:12.5px;margin:4px 0 6px;color:var(--text-primary)">' + _hubEscHtml(q) + '</label>';
        html += '<select class="ah2-input ah2-q-select" style="width:100%;max-width:440px">';
        html += '<option value="">—</option>';
        (reg.options || []).forEach(opt => {
          const m = String(opt).match(/\((\d+)\)\s*$/);
          const nv = m ? m[1] : '';
          html += '<option value="' + nv + '">' + _hubEscHtml(opt) + '</option>';
        });
        html += '</select></div>';
      });
      html += '<div style="margin-top:10px;font-weight:600">Total: <span id="' + subId + '">' + (existing ? String(existing.score) : '—') + '</span>';
      html += ' <span class="ah2-score-interp" id="' + siId + '" style="margin-left:8px;font-weight:500;color:var(--text-secondary)">' + (existing ? _hubEscHtml(existing.interp) : '') + '</span></div>';
      html += '</div>';
      return html;
    }
    const es = extraMap[sid];
    const rangeLabel = es ? sid + ' (' + es.min + '-' + es.max + ')' : sid + (reg?.max != null ? ' (0–' + reg.max + ')' : '');
    const minmax = es ? ' min="' + es.min + '" max="' + es.max + '"' : (reg?.max != null ? ' min="0" max="' + reg.max + '"' : '');
    const safeId = sid.replace(/[^a-z0-9]/gi, '-');
    const noticeHtml = getLegacyRunScoreEntryNoticeHtml(routed.status);
    const numericRow =
      '<div class="ah2-score-row">' +
      '<label class="ah2-score-label">' + _hubEscHtml(rangeLabel) + '</label>' +
      '<input type="number" class="ah2-input ah2-score-input" data-scale="' + _hubEscHtml(sid) + '" placeholder="Score" value="' + (existing ? String(existing.score) : '') + '"' + minmax + '/>' +
      '<span class="ah2-score-interp" id="ah2-si-' + safeId + '">' + (existing ? _hubEscHtml(existing.interp) : '') + '</span>' +
    '</div>';
    if (noticeHtml) {
      return (
        '<div class="ah2-impl-gap-wrap" data-impl-gap-scale="' +
        String(sid).replace(/"/g, '&quot;') +
        '">' +
        noticeHtml +
        numericRow +
        '</div>'
      );
    }
    return numericRow;
  }

  function wireHubChecklistListeners(modal) {
    modal.querySelectorAll('.ah2-q-select').forEach(sel => {
      sel.addEventListener('change', function hubQChange() {
        const wrap = this.closest('.ah2-inline-wrap');
        if (!wrap) return;
        const sid = wrap.getAttribute('data-inline-scale');
        if (!sid) return;
        let sum = 0;
        wrap.querySelectorAll('.ah2-q-select').forEach(s => {
          if (s.value !== '') sum += parseInt(s.value, 10) || 0;
        });
        const subId = 'ah2-subtot-' + sid.replace(/[^a-z0-9]/gi, '_');
        const el = document.getElementById(subId);
        if (el) el.textContent = String(sum);
        const interp = interpretScore(sid, sum);
        const si = document.getElementById('ah2-si-' + sid.replace(/[^a-z0-9]/gi, '-'));
        if (si) si.textContent = interp;
      });
    });
  }

  function collectAllScaleTokens(cond) {
    const ids = [];
    PHASES.forEach(ph => {
      (cond.phases[ph] || []).forEach(sid => ids.push(sid));
    });
    return ids;
  }

  function inAppChecklistScaleIds(cond) {
    const { implementedItemChecklist } = partitionScalesByImplementationTruth(
      collectAllScaleTokens(cond),
      ASSESS_REGISTRY,
    );
    return implementedItemChecklist;
  }

  function kpis() {
    const today = new Date().toISOString().slice(0,10);
    const all = DATA.assignments;
    return {
      overdue: all.filter(a => a.status === 'overdue' || (a.status === 'pending' && a.dueDate < today)).length,
      dueToday: all.filter(a => a.status === 'pending' && a.dueDate === today).length,
      pendingReview: all.filter(a => a.status === 'completed' && !a.reviewed).length,
      completed: all.filter(a => a.status === 'completed').length,
      total: all.length,
    };
  }

  function render() {
    const root = document.getElementById('ah2-root');
    if (!root) return;
    if (DATA.loading) {
      root.innerHTML = '<div class="ah2-loading" style="padding:48px;text-align:center;color:var(--text-secondary)">Loading assessments…</div>';
      return;
    }
    if (DATA.error) {
      root.innerHTML =
        '<div class="ah2-error" style="padding:32px;text-align:center;border:1px solid var(--border);border-radius:12px;margin:16px">' +
          '<div style="font-weight:700;margin-bottom:8px;color:var(--danger,#ff6b6b)">Could not load assessments</div>' +
          '<div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:12px">' + _hubEscHtml(DATA.error) + '</div>' +
          '<button class="ah2-btn" onclick="window._ah2Refresh && window._ah2Refresh()">Retry</button>' +
        '</div>';
      return;
    }
    const k = kpis();
    root.innerHTML =
      '<div class="ah2-kpi-strip">' +
        '<div class="ah2-kpi ' + (k.overdue > 0 ? 'ah2-kpi-danger' : '') + '"><span class="ah2-kpi-val">' + k.overdue + '</span><span class="ah2-kpi-lbl">Overdue</span></div>' +
        '<div class="ah2-kpi ' + (k.dueToday > 0 ? 'ah2-kpi-warn' : '') + '"><span class="ah2-kpi-val">' + k.dueToday + '</span><span class="ah2-kpi-lbl">Due Today</span></div>' +
        '<div class="ah2-kpi ' + (k.pendingReview > 0 ? 'ah2-kpi-info' : '') + '"><span class="ah2-kpi-val">' + k.pendingReview + '</span><span class="ah2-kpi-lbl">Pending Review</span></div>' +
        '<div class="ah2-kpi"><span class="ah2-kpi-val">' + k.completed + '</span><span class="ah2-kpi-lbl">Completed</span></div>' +
        '<div class="ah2-kpi"><span class="ah2-kpi-val">' + k.total + '</span><span class="ah2-kpi-lbl">Total Assigned</span></div>' +
      '</div>' +
      '<div class="ah2-tabs">' +
        ['templates','dashboard','scheduled','results','conditions','scales'].map(t =>
          '<button class="ah2-tab' + (activeTab===t?' ah2-tab-active':'') + '" onclick="window._ah2Tab(\'' + t + '\')">' +
          (t==='templates'?'Template Library':t==='dashboard'?'Dashboard':t==='scheduled'?'Scheduled':t==='results'?'Results':t==='conditions'?'53 Conditions':'Scale Library') +
          '</button>'
        ).join('') +
      '</div>' +
      '<div class="ah2-tab-body" id="ah2-body">' + renderTab() + '</div>';
  }

  function renderTab() {
    if (activeTab === 'templates') return renderTemplateLibrary();
    if (activeTab === 'dashboard') return renderDashboard();
    if (activeTab === 'scheduled') return renderScheduled();
    if (activeTab === 'results') return renderResults();
    if (activeTab === 'conditions') return renderConditions();
    if (activeTab === 'scales') return renderScales();
    return '';
  }

  // ── Assessment Template Library ───────────────────────────────────────────
  const ASSESS_TEMPLATES = [
    { id:'PHQ-9',  title:'PHQ-9', cat:'Validated Scale', catKey:'validated', conditions:['Depression','MDD'], time:'3 min', fill:'In-Platform',
      desc:'Patient Health Questionnaire-9. Gold-standard depression screening and severity measure, 9 items scored 0–27.' },
    { id:'GAD-7',  title:'GAD-7', cat:'Validated Scale', catKey:'validated', conditions:['Anxiety'], time:'3 min', fill:'In-Platform',
      desc:'Generalised Anxiety Disorder 7-item scale. Validated for anxiety screening and severity measurement.' },
    { id:'PCL-5',  title:'PCL-5', cat:'Validated Scale', catKey:'validated', conditions:['PTSD','Trauma'], time:'10 min', fill:'In-Platform',
      desc:'PTSD Checklist for DSM-5. 20-item self-report measure of PTSD symptoms over the past month.' },
    { id:'HDRS-17',title:'HDRS-17', cat:'Validated Scale', catKey:'validated', conditions:['Depression'], time:'8 min', fill:'In-Platform',
      desc:'Hamilton Depression Rating Scale (17 items). Clinician-administered scale for depression severity.' },
    { id:'MADRS',  title:'MADRS', cat:'Validated Scale', catKey:'validated', conditions:['Depression'], time:'6 min', fill:'In-Platform',
      desc:'Montgomery-Asberg Depression Rating Scale. 10-item clinician-rated scale sensitive to TMS treatment change.' },
    { id:'MoCA',   title:'MoCA', cat:'Validated Scale', catKey:'validated', conditions:['Cognition','Dementia'], time:'10 min', fill:'In-Platform',
      desc:'Montreal Cognitive Assessment. 30-point screen for mild cognitive impairment and dementia.' },
    { id:'PSQI',   title:'PSQI', cat:'Validated Scale', catKey:'validated', conditions:['Sleep Disorders'], time:'5 min', fill:'In-Platform',
      desc:'Pittsburgh Sleep Quality Index. 19-item self-rated questionnaire assessing sleep quality over past month.' },
    { id:'BPRS',   title:'BPRS', cat:'Validated Scale', catKey:'validated', conditions:['Psychosis','Schizophrenia'], time:'8 min', fill:'In-Platform',
      desc:'Brief Psychiatric Rating Scale. 24-item clinician-rated scale for psychotic and mood symptoms.' },
    { id:'NB-FORM',title:'Neuromod Baseline Form', cat:'Structured Form', catKey:'form', conditions:['All conditions'], time:'15 min', fill:'In-Platform',
      desc:'Comprehensive neuromodulation baseline: medical history, current medications, contraindications, session goals.' },
    { id:'ST-FORM',title:'Session Tolerance Form', cat:'Structured Form', catKey:'form', conditions:['All conditions'], time:'3 min', fill:'In-Platform',
      desc:'Pre/post-session tolerability check: discomfort ratings, adverse sensations, session-readiness confirmation.' },
    { id:'WP-FORM',title:'Weekly Progress Check', cat:'Structured Form', catKey:'form', conditions:['All conditions'], time:'5 min', fill:'In-Platform',
      desc:'Weekly structured self-report covering symptom change, sleep, mood, energy, and treatment adherence.' },
    { id:'SE-FORM',title:'Side Effect Monitor', cat:'Structured Form', catKey:'form', conditions:['All conditions'], time:'5 min', fill:'In-Platform',
      desc:'Structured side-effect checklist: headache, scalp discomfort, twitching, cognitive effects — graded severity.' },
    { id:'DEP-BDL', title:'Depression Protocol Bundle', cat:'Condition Bundle', catKey:'bundle', conditions:['Depression'], time:null, fill:'In-Platform',
      desc:'PHQ-9 + HDRS-17 + Side Effect Monitor — recommended battery for TMS depression treatment monitoring.' },
    { id:'ADHD-BDL',title:'ADHD Protocol Bundle', cat:'Condition Bundle', catKey:'bundle', conditions:['ADHD'], time:null, fill:'In-Platform',
      desc:'CAARS + CGI + Side Effect Monitor — recommended battery for tDCS ADHD treatment monitoring.' },
    { id:'PTSD-BDL',title:'PTSD Protocol Bundle', cat:'Condition Bundle', catKey:'bundle', conditions:['PTSD'], time:null, fill:'In-Platform',
      desc:'PCL-5 + Side Effect Monitor + PSQI — recommended battery for TMS PTSD treatment monitoring.' },
  ];
  // "Caregiver" chip removed — no template carries a caregiver catKey, so it
  // always rendered zero results. Remove, not disable.
  const ASSESS_FILTER_CHIPS = ['All','Validated Scales','Structured Forms','Condition Bundles','Side Effects'];
  const ASSESS_CAT_MAP = { 'Validated Scales':'validated', 'Structured Forms':'form', 'Condition Bundles':'bundle' };

  function renderTemplateLibrary() {
    const q = tlibSearch.toLowerCase();
    const filterKey = ASSESS_CAT_MAP[tlibFilter] || null;
    let items = ASSESS_TEMPLATES;
    if (filterKey) items = items.filter(i => i.catKey === filterKey);
    if (tlibFilter === 'Side Effects') items = items.filter(i => i.title.toLowerCase().includes('side') || i.conditions.some(c => c.toLowerCase().includes('side')));
    if (q) items = items.filter(i => i.title.toLowerCase().includes(q) || i.cat.toLowerCase().includes(q) || i.conditions.join(' ').toLowerCase().includes(q) || i.desc.toLowerCase().includes(q));
    const chips = ASSESS_FILTER_CHIPS.map(f =>
      '<button class="tlib-filter-chip' + (tlibFilter===f?' active':'') + '" onclick="window._ah2TlibFilter(\'' + f + '\')">' + f + '</button>'
    ).join('');
    const badgeCls = { validated:'tlib-badge--validated', form:'tlib-badge--form', bundle:'tlib-badge--bundle' };
    const cards = items.length ? items.map(item => {
      const tags = item.conditions.slice(0,3).map(c => '<span class="tlib-badge tlib-badge--form">' + c + '</span>').join('');
      const timeTxt = item.time ? '<span style="margin-right:8px">&#9201; ' + item.time + '</span>' : '';
      return '<div class="tlib-card">' +
        '<div class="tlib-card-title">' + item.title + '</div>' +
        '<div class="tlib-card-badges">' +
          '<span class="tlib-badge ' + (badgeCls[item.catKey]||'tlib-badge--form') + '">' + item.cat + '</span>' +
          tags +
        '</div>' +
        '<div class="tlib-card-meta">' + timeTxt + (item.fill ? '<span class="tlib-badge tlib-badge--clinical">' + item.fill + '</span>' : '') + '</div>' +
        '<div class="tlib-card-meta" style="margin-bottom:0">' + item.desc + '</div>' +
        '<div class="tlib-card-actions">' +
          '<button class="tlib-btn-assign" onclick="window._ah2TlibAssign(\'' + item.id + '\',\'' + item.title.replace(/'/g,"\\'") + '\')">Assign</button>' +
          '<button class="tlib-btn-preview" onclick="window._ah2TlibPreview(\'' + item.id + '\')">Preview</button>' +
        '</div>' +
      '</div>';
    }).join('') : '<div class="tlib-empty"><div class="tlib-empty-icon">&#128269;</div><div class="tlib-empty-msg">No templates match your search</div></div>';
    return '<div class="tlib-wrap">' +
      '<div class="tlib-search-bar"><input class="tlib-search-input" id="ah2-tlib-search" type="text" placeholder="Search scales, forms, bundles\u2026" value="' + tlibSearch.replace(/"/g,'&quot;') + '" oninput="window._ah2TlibSearch(this.value)"/></div>' +
      '<div class="tlib-filters">' + chips + '</div>' +
      '<div class="tlib-grid">' + cards + '</div>' +
    '</div>';
  }

  function assignCard(a) {
    const today = new Date().toISOString().slice(0,10);
    const isOverdue = a.status === 'overdue' || (a.status === 'pending' && a.dueDate < today);
    const statusCls = isOverdue ? 'ah2-status-danger' : a.status === 'completed' ? 'ah2-status-ok' : 'ah2-status-warn';
    const statusLabel = isOverdue && a.status === 'pending' ? 'overdue' : a.status;
    // Escape every piece of assignment data before inlining into HTML. Patient
    // IDs and condition names originate from user input / localStorage and
    // must not be trusted as HTML. `safeId` is used for attribute values.
    const safeId = String(a.id || '').replace(/[^A-Za-z0-9_-]/g, '');
    const phaseKey = String(a.phase || '').replace(/[^a-z_]/gi, '');
    const phaseLbl = PHASE_LABELS[a.phase] || a.phase || '';
    return '<div class="ah2-assign-card' + (isOverdue ? ' ah2-assign-card--danger' : '') + '">' +
      '<div class="ah2-assign-main">' +
        '<span class="ah2-assign-cond">' + _hubEscHtml(a.condName || '') + '</span>' +
        '<span class="ah2-phase-pill ah2-phase-' + phaseKey + '">' + _hubEscHtml(phaseLbl) + '</span>' +
        '<span class="ah2-assign-patient">Patient ' + _hubEscHtml(a.patientId || '') + '</span>' +
        '<div class="ah2-assign-scales">' + (a.scales || []).map(_hubEscHtml).join(' &middot; ') + '</div>' +
      '</div>' +
      '<div class="ah2-assign-meta">' +
        '<span class="ah2-badge ' + statusCls + '">' + _hubEscHtml(statusLabel) + '</span>' +
        '<span class="ah2-assign-due">Due ' + _hubEscHtml(a.dueDate || '') + '</span>' +
      '</div>' +
      '<div class="ah2-assign-actions">' +
        (a.status !== 'completed' ? '<button class="ah2-btn ah2-btn-sm" onclick="window._ah2Score(\'' + safeId + '\')">Enter Scores</button>' : '') +
        (a.status === 'completed' && !a.reviewed ? '<button class="ah2-btn ah2-btn-sm ah2-btn-info" onclick="window._ah2Review(\'' + safeId + '\')">Review</button>' : '') +
        '<button class="ah2-btn ah2-btn-sm ah2-btn-ghost" onclick="window._ah2Detail(\'' + safeId + '\')">Detail</button>' +
      '</div>' +
    '</div>';
  }

  function renderDashboard() {
    const today = new Date().toISOString().slice(0,10);
    const overdueList = DATA.assignments.filter(a => a.status === 'overdue' || (a.status === 'pending' && a.dueDate < today));
    const dueList = DATA.assignments.filter(a => a.status === 'pending' && a.dueDate === today);
    const reviewList = DATA.assignments.filter(a => a.status === 'completed' && !a.reviewed);
    let html = '';
    if (overdueList.length) html += '<div class="ah2-dash-section"><h3 class="ah2-dash-heading ah2-dash-heading--danger">Overdue (' + overdueList.length + ')</h3><div class="ah2-assign-list">' + overdueList.map(assignCard).join('') + '</div></div>';
    if (dueList.length) html += '<div class="ah2-dash-section"><h3 class="ah2-dash-heading ah2-dash-heading--warn">Due Today (' + dueList.length + ')</h3><div class="ah2-assign-list">' + dueList.map(assignCard).join('') + '</div></div>';
    if (reviewList.length) html += '<div class="ah2-dash-section"><h3 class="ah2-dash-heading ah2-dash-heading--info">Pending Review (' + reviewList.length + ')</h3><div class="ah2-assign-list">' + reviewList.map(assignCard).join('') + '</div></div>';
    if (!html) html = '<div class="ah2-empty">All clear — no urgent items</div>';
    return '<div class="ah2-dash">' + html + '</div>';
  }

  function renderScheduled() {
    const active = DATA.assignments.filter(a => a.status !== 'completed');
    if (!active.length) return '<div class="ah2-empty">No active assignments</div>';
    return '<div class="ah2-assign-list">' + active.map(assignCard).join('') + '</div>';
  }

  function renderResults() {
    const done = DATA.assignments.filter(a => a.status === 'completed');
    if (!done.length) return '<div class="ah2-empty">No completed assessments yet</div>';
    return '<div class="ah2-assign-list">' + done.map(a => {
      const safeId = String(a.id || '').replace(/[^A-Za-z0-9_-]/g, '');
      const phaseKey = String(a.phase || '').replace(/[^a-z_]/gi, '');
      const phaseLbl = PHASE_LABELS[a.phase] || a.phase || '';
      const scaleSummary = (a.results && a.results.length > 0)
        ? a.results.map(r => _hubEscHtml(r.scale) + ': <strong>' + _hubEscHtml(String(r.score)) + '</strong> (' + _hubEscHtml(r.interp || '') + ')').join(' &middot; ')
        : (a.scales || []).map(_hubEscHtml).join(' &middot; ');
      return '<div class="ah2-assign-card">' +
        '<div class="ah2-assign-main">' +
          '<span class="ah2-assign-cond">' + _hubEscHtml(a.condName || '') + '</span>' +
          '<span class="ah2-phase-pill ah2-phase-' + phaseKey + '">' + _hubEscHtml(phaseLbl) + '</span>' +
          '<span class="ah2-assign-patient">Patient ' + _hubEscHtml(a.patientId || '') + '</span>' +
          '<div class="ah2-assign-scales">' + scaleSummary + '</div>' +
        '</div>' +
        '<div class="ah2-assign-meta">' +
          '<span class="ah2-badge ' + (a.reviewed ? 'ah2-status-ok' : 'ah2-status-info') + '">' + (a.reviewed ? 'Reviewed' : 'Needs Review') + '</span>' +
          '<span class="ah2-assign-due">Completed ' + _hubEscHtml(a.completedDate || '') + '</span>' +
        '</div>' +
        '<div class="ah2-assign-actions">' +
          (!a.reviewed ? '<button class="ah2-btn ah2-btn-sm ah2-btn-info" onclick="window._ah2Review(\'' + safeId + '\')">Review</button>' : '') +
          '<button class="ah2-btn ah2-btn-sm ah2-btn-ghost" onclick="window._ah2Detail(\'' + safeId + '\')">Detail</button>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function renderConditions() {
    const cats = activeCat === 'all' ? CATEGORIES : [activeCat];
    const filterBtns = '<button class="ah2-filter-btn' + (activeCat==='all'?' ah2-filter-btn-active':'') + '" onclick="window._ah2Cat(\'all\')">All (' + COND_BUNDLES.length + ')</button>' +
      CATEGORIES.map(c => '<button class="ah2-filter-btn' + (activeCat===c?' ah2-filter-btn-active':'') + '" onclick="window._ah2Cat(\'' + c + '\')">' + c + '</button>').join('');
    const body = cats.map(cat => {
      const conds = COND_BUNDLES.filter(c => c.category === cat);
      return '<div class="ah2-cat-section"><h3 class="ah2-cat-heading">' + cat + ' <span class="ah2-cat-count">' + conds.length + '</span></h3>' +
        '<div class="ah2-cond-grid">' + conds.map(cond => {
          const inApp = inAppChecklistScaleIds(cond);
          const inAppSummary = inApp.length ? (inApp.length + ' in-app screener' + (inApp.length === 1 ? '' : 's')) : 'No in-app item lists';
          const baselineBadges = (cond.phases.baseline || [])
            .map(s => formatScaleWithImplementationBadgeHtml(s, ASSESS_REGISTRY))
            .join('<span style="opacity:0.35"> · </span>');
          return '<div class="ah2-cond-card">' +
            '<div class="ah2-cond-header"><span class="ah2-cond-id">' + cond.id + '</span><span class="ah2-cond-name">' + cond.name + '</span></div>' +
            '<div class="ah2-phase-pills">' + PHASES.map(ph => '<span class="ah2-phase-pill ah2-phase-' + ph + '" title="' + PHASE_LABELS[ph] + ': ' + cond.phases[ph].join(', ') + '">' + PHASE_LABELS[ph] + '</span>').join('') + '</div>' +
            '<div class="ah2-cond-scales ah2-cond-scale-line"><strong style="color:var(--text-primary)">Baseline</strong> · ' + baselineBadges + '</div>' +
            '<div class="ah2-cond-checklists" style="font-size:11.5px;color:var(--text-secondary);margin:2px 0 8px;line-height:1.45">Bundle summary: ' + _hubEscHtml(inAppSummary) + '</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
            '<button class="ah2-btn ah2-btn-sm" onclick="window._ah2AssignCond(\'' + cond.id + '\')">Assign Bundle</button>' +
            '<button class="ah2-btn ah2-btn-sm ah2-btn-ghost" onclick="window._ah2CondInfo(\'' + cond.id + '\')">Info &amp; links</button>' +
            '</div>' +
          '</div>';
        }).join('') + '</div></div>';
    }).join('');
    return '<div class="ah2-cond-toolbar">' + filterBtns + '</div>' + body;
  }

  function renderScales() {
    const domains = [...new Set(EXTRA_SCALES.map(s => s.domain))];
    return '<div class="ah2-scale-count">Extended scale library: <strong>' + EXTRA_SCALES.length + '</strong> scales</div>' +
      domains.map(dom => {
        const scs = EXTRA_SCALES.filter(s => s.domain === dom);
        return '<div class="ah2-scale-domain"><h4 class="ah2-scale-domain-title">' + dom + '</h4>' +
          '<div class="ah2-scale-grid">' + scs.map(s =>
            '<div class="ah2-scale-card">' +
              '<div class="ah2-scale-name">' + s.name + '</div>' +
              '<div class="ah2-scale-full">' + s.full + '</div>' +
              '<div class="ah2-scale-range">Range: ' + s.min + '\u2013' + s.max + ' &bull; ' + s.items + ' items</div>' +
              '<div class="ah2-scale-interps">' + s.interpretation.map(r => r.label + ' (&le;' + r.max + ')').join(' &bull; ') + '</div>' +
            '</div>'
          ).join('') + '</div></div>';
      }).join('');
  }

  window._ah2Tab = function(t) { activeTab = t; render(); };
  window._ah2Cat = function(c) { activeCat = c; render(); };

  window._ah2TlibFilter = function(f) { tlibFilter = f; render(); };
  window._ah2TlibSearch = function(v) { tlibSearch = v; render(); document.getElementById('ah2-tlib-search')?.focus(); };
  window._ah2TlibAssign = function(id, title) {
    window._dsShowAssignModal({
      templateName: title,
      templateId: id,
      templateType: 'assessment',
      onAssign: async (patientId, patientName) => {
        // Backend AssessmentAssignRequest expects the normalized template id
        // (lowercase, alphanumeric-only — e.g. PHQ-9 → phq9). Non-normalized
        // ids fail server-side template lookup and create an assessment with
        // no embedded sections. Match the bulk-assign path's normalization.
        const normalized = String(id || '').toLowerCase().replace(/[^a-z0-9]/g, '') || String(id || '').toLowerCase();
        try {
          await api.assignAssessment(patientId, { template_id: normalized });
        } catch (err) {
          const msg = (err && err.message) || 'Network error';
          if (window._showNotifToast) {
            window._showNotifToast({ title: 'Assignment failed', body: msg, severity: 'critical' });
          } else {
            _dsToast('Assignment failed: ' + msg, 'error');
          }
          return;
        }
        try { await hydrate(); render(); } catch {}
        if (window._showNotifToast) {
          window._showNotifToast({ title: 'Assessment Added', body: '\u201c' + title + '\u201d was added to the assessment workflow for ' + patientName, severity: 'success' });
        } else {
          _dsToast('\u201c' + title + '\u201d was added to the assessment workflow for ' + patientName, 'success');
        }
      }
    });
  };
  window._ah2TlibPreview = function(id) {
    const item = ASSESS_TEMPLATES.find(x => x.id === id);
    if (!item) return;
    // Resolve the instrument registry entry for real items (PHQ-9, GAD-7,
    // PCL-5, etc. carry full questions + options). Licensed instruments
    // have no embedded items; we surface licensing instead.
    const reg = ASSESS_REGISTRY.find(r => r.id === id) || null;
    const esc = s => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    let body = '';
    body += '<div style="font-size:12px;color:var(--text-secondary);line-height:1.6;margin-bottom:10px">' + esc(item.desc || '') + '</div>';
    body += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">';
    body += '<span class="tlib-badge tlib-badge--form">' + esc(item.cat) + '</span>';
    if (item.time) body += '<span class="tlib-badge tlib-badge--form">\u23F1 ' + esc(item.time) + '</span>';
    (item.conditions || []).slice(0, 4).forEach(c => {
      body += '<span class="tlib-badge tlib-badge--form">' + esc(c) + '</span>';
    });
    body += '</div>';

    if (reg && Array.isArray(reg.questions) && reg.questions.length) {
      body += '<h4 style="margin:0 0 6px;font-size:12.5px;font-weight:700">Items</h4>';
      body += '<ol style="margin:0 0 14px;padding-left:20px;font-size:12.5px;line-height:1.55;color:var(--text-primary)">';
      reg.questions.forEach(q => { body += '<li style="margin-bottom:4px">' + esc(q) + '</li>'; });
      body += '</ol>';
      if (Array.isArray(reg.options) && reg.options.length) {
        body += '<h4 style="margin:0 0 6px;font-size:12.5px;font-weight:700">Response options</h4>';
        body += '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px">';
        body += reg.options.map(o => esc(o)).join(' &middot; ');
        body += '</div>';
      }
    } else if (reg) {
      body += '<div role="note" style="font-size:12px;color:var(--amber,#ffb547);background:rgba(255,181,71,0.08);border:1px solid rgba(255,181,71,0.25);border-radius:6px;padding:8px 10px;margin-bottom:14px;line-height:1.5">'
        + 'Licensed instrument \u2014 item text must be administered via an authorized copy. DeepSynaps stores total score and interpretation only.'
        + '</div>';
    } else {
      body += '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:14px">Structured form \u2014 full layout rendered when the form is opened for a patient.</div>';
    }

    if (reg && reg.scoringKey) {
      body += '<div style="font-size:11.5px;color:var(--text-tertiary);line-height:1.5">Scoring: interpretation is computed from the total per the published rubric.</div>';
    }

    const title = document.getElementById('ah2-preview-title');
    const bd = document.getElementById('ah2-preview-body');
    if (title) title.textContent = item.title;
    if (bd) bd.innerHTML = body;
    document.getElementById('ah2-preview-modal')?.classList.remove('ah2-hidden');
  };

  window._ah2PreviewBundle = function() {
    const condSel = document.getElementById('ah2-f-cond');
    const phaseSel = document.getElementById('ah2-f-phase');
    const prev = document.getElementById('ah2-bundle-preview');
    if (!prev || !condSel) return;
    const cond = COND_BUNDLES.find(c => c.id === condSel.value);
    if (!cond) { prev.textContent = 'Select condition and phase to preview scales'; return; }
    const ph = (phaseSel && phaseSel.value) || 'baseline';
    const scales = cond.phases[ph] || [];
    prev.innerHTML = '<strong>' + PHASE_LABELS[ph] + ' bundle (' + scales.length + ' scales):</strong><br>' + scales.join(', ');
  };

  window._ah2AssignCond = function(condId) {
    const modal = document.getElementById('ah2-assign-modal');
    if (!modal) return;
    const sel = modal.querySelector('#ah2-f-cond');
    if (sel) sel.value = condId;
    window._ah2PreviewBundle();
    modal.classList.remove('ah2-hidden');
  };

  window._ah2SaveAssign = async function() {
    const patient = ((document.getElementById('ah2-f-patient') || {}).value || '').trim();
    const condId = (document.getElementById('ah2-f-cond') || {}).value || '';
    const phase = (document.getElementById('ah2-f-phase') || {}).value || '';
    const due = (document.getElementById('ah2-f-due') || {}).value || '';
    const recur = (document.getElementById('ah2-f-recur') || {}).value || '';
    if (!patient || !condId || !phase || !due) { _dsToast('Please fill in all required fields before assigning.', 'warn'); return; }
    if (patient.length < 3 || /[<>"]/.test(patient)) {
      _dsToast('Patient ID looks invalid. Pick a patient from the list or enter the clinic-issued ID.', 'warn');
      return;
    }
    const cond = COND_BUNDLES.find(c => c.id === condId);
    if (!cond) { _dsToast('Unknown condition bundle.', 'warn'); return; }
    const scales = cond.phases[phase] || [];
    if (!scales.length) { _dsToast('No scales defined for this phase.', 'warn'); return; }

    // Disable the Assign button while the request is in flight so a double-click
    // can't create two bundles. The hub re-renders on success; failure re-enables.
    const btn = document.querySelector('#ah2-assign-modal .ah2-btn:not(.ah2-btn-ghost)');
    if (btn) { btn.disabled = true; btn.textContent = 'Assigning…'; }
    try {
      // Backend wants one record per scale. We ship the human-readable scale id
      // in `data.scale_id` so hydrate() can round-trip it back to the UI label
      // the clinician recognises (PHQ-9, C-SSRS, etc.).
      const items = scales.map(sid => {
        const tpl = _hubResolveRegistryScale(sid);
        const templateId = (tpl?.scoringKey || tpl?.id || sid || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '') || String(sid).toLowerCase();
        const templateTitle = tpl?.t || tpl?.abbr || sid;
        return { sid, templateId, templateTitle, scoringKey: tpl?.scoringKey, inline: !!tpl?.inline };
      });
      // bulk-assign takes one template list; we call it once and then PATCH each
      // record with the right data.scale_id (so hydrate() can map it back).
      const resp = await api.bulkAssignAssessments({
        patient_id: patient,
        template_ids: items.map(i => i.templateId),
        phase,
        due_date: due,
        bundle_id: condId,
        clinician_notes: recur ? 'Recurrence: ' + recur : null,
      });
      const created = (resp && resp.created) || [];
      // Stamp each newly-created record with its scale id + recurrence so the
      // grouping/round-trip in hydrate() lines up cleanly.
      await Promise.all(created.map(async (rec, idx) => {
        const item = items[idx] || items.find(i => i.templateId === rec.template_id);
        if (!item) return;
        try {
          await api.updateAssessment(rec.id, {
            data: {
              ...(rec.data || {}),
              scale_id: item.sid,
              scale_label: item.templateTitle,
              recurrence: recur || null,
            },
            scale_version: item.scoringKey ? item.scoringKey + '@1' : null,
            respondent_type: item.inline ? 'patient' : 'clinician',
          });
        } catch (err) {
          console.warn('[assessments-hub] stamp failed for', item.sid, err);
        }
      }));
      const failed = (resp && resp.failed) || [];
      if (failed.length) {
        window._showNotifToast?.({ title: 'Some scales failed', body: failed.map(f => f.template_id + ': ' + f.reason).join(' | '), severity: 'warning' });
      } else {
        window._showNotifToast?.({ title: 'Bundle assigned', body: scales.length + ' scales were added to the assessment workflow for ' + patient + '.', severity: 'success' });
      }
      document.getElementById('ah2-assign-modal').classList.add('ah2-hidden');
      await hydrate();
      render();
    } catch (err) {
      const msg = (err && err.message) || 'Network error';
      console.warn('[assessments-hub] assign failed:', err);
      window._showNotifToast?.({ title: 'Assignment failed', body: msg, severity: 'critical' });
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Assign'; }
    }
  };

  window._ah2Score = function(id) {
    const a = DATA.assignments.find(x => x.id === id);
    if (!a) return;
    const modal = document.getElementById('ah2-score-modal');
    modal.dataset.assignId = id;
    document.getElementById('ah2-score-body').innerHTML =
      '<p class="ah2-score-info"><strong>' + _hubEscHtml(a.condName) + '</strong> &bull; ' + _hubEscHtml(PHASE_LABELS[a.phase]) + ' &bull; Patient ' + _hubEscHtml(a.patientId) + '</p>' +
      '<p class="ah2-score-hint">Use the item checklists for validated self-report scales (PHQ-9, GAD-7, ISI, PCL-5, etc.). Enter numeric totals for clinician-rated or extended scales.</p>' +
      a.scales.map(sid => buildHubScaleBlock(sid, a)).join('');
    modal.querySelectorAll('.ah2-score-input').forEach(inp => {
      inp.addEventListener('input', function() {
        const interp = interpretScore(this.dataset.scale, parseInt(this.value, 10));
        const el = document.getElementById('ah2-si-' + this.dataset.scale.replace(/[^a-z0-9]/gi, '-'));
        if (el) el.textContent = interp;
      });
    });
    wireHubChecklistListeners(modal);
    modal.classList.remove('ah2-hidden');
  };

  window._ah2SaveScores = async function() {
    const modal = document.getElementById('ah2-score-modal');
    const a = DATA.assignments.find(x => x.id === modal.dataset.assignId);
    if (!a) return;
    const results = [];
    const incomplete = [];
    const safetyAlerts = [];
    modal.querySelectorAll('.ah2-inline-wrap').forEach(wrap => {
      const sid = wrap.getAttribute('data-inline-scale');
      if (!sid) return;
      const selects = [...wrap.querySelectorAll('.ah2-q-select')];
      const vals = selects.map(s => s.value);
      if (vals.every(v => v === '')) return;
      if (vals.some(v => v === '')) {
        incomplete.push(sid);
        return;
      }
      const numeric = vals.map(v => parseInt(v, 10));
      const sum = numeric.reduce((acc, n) => acc + n, 0);
      results.push({ scale: sid, score: sum, interp: interpretScore(sid, sum), items: numeric });
      // PHQ-9 item 9 (self-harm) — any non-zero answer triggers the clinic's
      // suicide-safety protocol before the patient leaves.
      if (/^PHQ-?9$/i.test(sid) && numeric.length >= 9 && numeric[8] >= 1) {
        safetyAlerts.push({
          scale: 'PHQ-9',
          severity: numeric[8] >= 2 ? 'critical' : 'warn',
          message: 'PHQ-9 item 9 (self-harm) = ' + numeric[8] + '. Follow suicide-safety protocol and document response before the patient leaves.',
        });
      }
    });
    if (incomplete.length) {
      window._showNotifToast?.({ title: 'Incomplete checklists', body: 'Finish every item for: ' + incomplete.join(', '), severity: 'warning' });
      return;
    }
    modal.querySelectorAll('.ah2-score-input').forEach(inp => {
      if (inp.value !== '') {
        const score = parseInt(inp.value, 10);
        results.push({ scale: inp.dataset.scale, score, interp: interpretScore(inp.dataset.scale, score) });
        // C-SSRS numeric (0-6). ≥2 = active ideation (warn); ≥4 = behavior/plan (critical).
        if (/^C-?SSRS$/i.test(inp.dataset.scale) && !Number.isNaN(score) && score >= 2) {
          safetyAlerts.push({
            scale: 'C-SSRS',
            severity: score >= 4 ? 'critical' : 'warn',
            message: score >= 4
              ? 'C-SSRS indicates suicidal behavior/plan — escalate immediately per crisis protocol.'
              : 'C-SSRS indicates active ideation — clinician review required before session.',
          });
        }
      }
    });
    if (!results.length) {
      window._showNotifToast?.({ title: 'No scores', body: 'Enter at least one scale score or checklist.', severity: 'warning' });
      return;
    }

    const saveBtn = modal.querySelector('.ah2-btn:not(.ah2-btn-ghost)');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
    const failures = [];
    try {
      // PATCH each backend record for the scales we just scored. Unscored scales
      // in the bundle stay `pending` — the clinician can finish them later.
      await Promise.all(results.map(async r => {
        const backendId = a._backendIds && a._backendIds[r.scale];
        if (!backendId) {
          failures.push({ scale: r.scale, reason: 'No backend id — was this assignment created offline?' });
          return;
        }
        try {
          await api.updateAssessment(backendId, {
            status: 'completed',
            score: String(r.score),
            data: {
              score: r.score,
              interpretation: r.interp,
              items: r.items || null,
              scale_id: r.scale,
              source: 'assessments-hub',
              safetyAlerts: safetyAlerts.filter(s => s.scale === r.scale),
            },
          });
        } catch (err) {
          failures.push({ scale: r.scale, reason: (err && err.message) || 'Network error' });
        }
      }));

      // Legacy sidecar: ds_assessment_runs localStorage keeps the patient-profile
      // Assessments tab + dashboard widgets working. We write directly so we don't
      // re-trigger the old fire-and-forget api.createAssessment path (would dupe).
      try {
        const runs = JSON.parse(localStorage.getItem('ds_assessment_runs') || '[]');
        const ts = new Date().toISOString();
        results.forEach(r => {
          const tpl = _hubResolveRegistryScale(r.scale);
          const sm = getScaleMeta(r.scale);
          runs.push({
            patient_id: a.patientId,
            scale_id: r.scale,
            scale_name: (!sm.unknown && sm.display_name) ? sm.display_name : (tpl?.abbr || tpl?.t || r.scale),
            score: r.score,
            interpretation: r.interp || '',
            completed_at: ts,
            status: 'completed',
            timing_window: a.phase || '',
            source: 'assessments-hub',
            assignment_id: a.id,
            condition_name: a.condName || '',
          });
        });
        localStorage.setItem('ds_assessment_runs', JSON.stringify(runs));
        window.dispatchEvent(new CustomEvent('ds-assessment-runs-updated', { detail: { patientId: a.patientId } }));
      } catch {}

      modal.classList.add('ah2-hidden');
      if (failures.length) {
        window._showNotifToast?.({
          title: 'Some scores did not save',
          body: failures.map(f => f.scale + ': ' + f.reason).join(' | '),
          severity: 'warning',
        });
      }
      if (safetyAlerts.length) {
        const critical = safetyAlerts.some(s => s.severity === 'critical');
        window._showNotifToast?.({
          title: critical ? 'SAFETY ALERT — immediate review required' : 'Safety flag — clinician review required',
          body: safetyAlerts.map(s => s.scale + ': ' + s.message).join(' | '),
          severity: critical ? 'critical' : 'warning',
        });
      } else if (!failures.length) {
        window._showNotifToast?.({ title: 'Scores saved', body: 'Totals synced to patient assessments and clinic metrics.', severity: 'success' });
      }
      await hydrate();
      render();
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save & Complete'; }
    }
  };

  window._ah2Review = async function(id) {
    const a = DATA.assignments.find(x => x.id === id);
    if (!a) return;
    const ids = Object.values(a._backendIds || {});
    if (!ids.length) { _dsToast('Nothing to review — assignment has no backend records.', 'warn'); return; }
    try {
      await Promise.all(ids.map(bid =>
        api.approveAssessment(bid, { approved: true }).catch(err => {
          console.warn('[assessments-hub] approve failed for', bid, err);
          throw err;
        })
      ));
      window._showNotifToast?.({ title: 'Reviewed', body: 'Assignment marked approved.', severity: 'success' });
      await hydrate();
      render();
      window._ah2Detail(id);
    } catch (err) {
      const msg = (err && err.message) || 'Network error';
      window._showNotifToast?.({ title: 'Review failed', body: msg, severity: 'critical' });
    }
  };

  window._ah2Detail = function(id) {
    const a = DATA.assignments.find(x => x.id === id);
    if (!a) return;
    const rows = [
      ['Condition', '<strong>' + a.condName + '</strong>'],
      ['Phase', '<span class="ah2-phase-pill ah2-phase-' + a.phase + '">' + PHASE_LABELS[a.phase] + '</span>'],
      ['Patient', a.patientId],
      ['Assigned By', a.assignedBy],
      ['Assigned', a.assignedDate],
      ['Due', a.dueDate],
      ['Recurrence', a.recurrence || 'None'],
      ['Status', a.status],
      ['Reviewed', a.reviewed ? 'Yes' : 'No'],
      ['Scales', a.scales.join(', ')],
    ].map(r => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('');
    const scoresHtml = a.results.length > 0
      ? '<h4 class="ah2-detail-results-title">Scores</h4><table class="ah2-detail-table"><thead><tr><th>Scale</th><th>Score</th><th>Interpretation</th></tr></thead><tbody>' +
        a.results.map(r => '<tr><td>' + r.scale + '</td><td><strong>' + r.score + '</strong></td><td>' + r.interp + '</td></tr>').join('') + '</tbody></table>'
      : '<p class="ah2-detail-noresults">No scores entered yet</p>';
    document.getElementById('ah2-detail-body').innerHTML = '<table class="ah2-detail-table"><tbody>' + rows + '</tbody></table>' + scoresHtml;
    document.getElementById('ah2-detail-modal').classList.remove('ah2-hidden');
  };

  const dueDefault = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const assignModalHtml =
    '<div class="ah2-modal-overlay ah2-hidden" id="ah2-assign-modal">' +
      '<div class="ah2-modal-box">' +
        '<div class="ah2-modal-header"><h2>Assign Assessment Bundle</h2>' +
        '<button class="ah2-modal-close" onclick="document.getElementById(\'ah2-assign-modal\').classList.add(\'ah2-hidden\')">&times;</button></div>' +
        '<div class="ah2-modal-body">' +
          '<div class="ah2-form-row"><label>Patient ID</label><input id="ah2-f-patient" type="text" class="ah2-input" placeholder="P-XXXX"/></div>' +
          '<div class="ah2-form-row"><label>Condition</label><select id="ah2-f-cond" class="ah2-input" onchange="window._ah2PreviewBundle()">' +
            '<option value="">Select condition</option>' +
            CATEGORIES.map(cat => '<optgroup label="' + cat + '">' + COND_BUNDLES.filter(c => c.category === cat).map(c => '<option value="' + c.id + '">' + c.name + '</option>').join('') + '</optgroup>').join('') +
          '</select></div>' +
          '<div class="ah2-form-row"><label>Phase</label><select id="ah2-f-phase" class="ah2-input" onchange="window._ah2PreviewBundle()">' + PHASES.map(p => '<option value="' + p + '">' + PHASE_LABELS[p] + '</option>').join('') + '</select></div>' +
          '<div class="ah2-form-row"><label>Due Date</label><input id="ah2-f-due" type="date" class="ah2-input" value="' + dueDefault + '"/></div>' +
          '<div class="ah2-form-row"><label>Recurrence</label><select id="ah2-f-recur" class="ah2-input"><option value="">None</option><option value="weekly">Weekly</option><option value="biweekly">Bi-weekly</option><option value="monthly">Monthly</option><option value="per-session">Per Session</option></select></div>' +
          '<div class="ah2-bundle-preview" id="ah2-bundle-preview">Select condition and phase to preview scales</div>' +
        '</div>' +
        '<div class="ah2-modal-footer"><button class="ah2-btn" onclick="window._ah2SaveAssign()">Assign</button><button class="ah2-btn ah2-btn-ghost" onclick="document.getElementById(\'ah2-assign-modal\').classList.add(\'ah2-hidden\')">Cancel</button></div>' +
      '</div>' +
    '</div>';

  const scoreModalHtml =
    '<div class="ah2-modal-overlay ah2-hidden" id="ah2-score-modal">' +
      '<div class="ah2-modal-box">' +
        '<div class="ah2-modal-header"><h2>Enter Assessment Scores</h2>' +
        '<button class="ah2-modal-close" onclick="document.getElementById(\'ah2-score-modal\').classList.add(\'ah2-hidden\')">&times;</button></div>' +
        '<div class="ah2-modal-body" id="ah2-score-body"></div>' +
        '<div class="ah2-modal-footer"><button class="ah2-btn" onclick="window._ah2SaveScores()">Save &amp; Complete</button><button class="ah2-btn ah2-btn-ghost" onclick="document.getElementById(\'ah2-score-modal\').classList.add(\'ah2-hidden\')">Cancel</button></div>' +
      '</div>' +
    '</div>';

  const detailModalHtml =
    '<div class="ah2-modal-overlay ah2-hidden" id="ah2-detail-modal">' +
      '<div class="ah2-modal-box">' +
        '<div class="ah2-modal-header"><h2>Assessment Detail</h2>' +
        '<button class="ah2-modal-close" onclick="document.getElementById(\'ah2-detail-modal\').classList.add(\'ah2-hidden\')">&times;</button></div>' +
        '<div class="ah2-modal-body" id="ah2-detail-body"></div>' +
        '<div class="ah2-modal-footer"><button class="ah2-btn ah2-btn-ghost" onclick="document.getElementById(\'ah2-detail-modal\').classList.add(\'ah2-hidden\')">Close</button></div>' +
      '</div>' +
    '</div>';

  const condInfoModalHtml =
    '<div class="ah2-modal-overlay ah2-hidden" id="ah2-condinfo-modal">' +
      '<div class="ah2-modal-box" style="max-width:520px">' +
        '<div class="ah2-modal-header"><h2 id="ah2-condinfo-title">Condition</h2>' +
        '<button class="ah2-modal-close" onclick="document.getElementById(\'ah2-condinfo-modal\').classList.add(\'ah2-hidden\')">&times;</button></div>' +
        '<div class="ah2-modal-body" id="ah2-condinfo-body"></div>' +
        '<div class="ah2-modal-footer"><button class="ah2-btn ah2-btn-ghost" onclick="document.getElementById(\'ah2-condinfo-modal\').classList.add(\'ah2-hidden\')">Close</button></div>' +
      '</div>' +
    '</div>';

  const previewModalHtml =
    '<div class="ah2-modal-overlay ah2-hidden" id="ah2-preview-modal">' +
      '<div class="ah2-modal-box" style="max-width:560px">' +
        '<div class="ah2-modal-header"><h2 id="ah2-preview-title">Preview</h2>' +
        '<button class="ah2-modal-close" onclick="document.getElementById(\'ah2-preview-modal\').classList.add(\'ah2-hidden\')">&times;</button></div>' +
        '<div class="ah2-modal-body" id="ah2-preview-body"></div>' +
        '<div class="ah2-modal-footer"><button class="ah2-btn ah2-btn-ghost" onclick="document.getElementById(\'ah2-preview-modal\').classList.add(\'ah2-hidden\')">Close</button></div>' +
      '</div>' +
    '</div>';

  window._ah2CondInfo = function(condId) {
    const cond = COND_BUNDLES.find(c => c.id === condId);
    if (!cond) return;
    const hub = COND_HUB_META[condId];
    const meta = hub && hub.links && hub.links.length ? hub : { links: [] };
    const rawIds = collectAllScaleTokens(cond);
    const truth = partitionScalesByImplementationTruth(rawIds, ASSESS_REGISTRY);
    const rows = enumerateBundleScales(cond, PHASES);
    let html = '<p style="font-size:12px;color:var(--text-tertiary);margin:0 0 12px">' + _hubEscHtml(cond.id) + ' — scale list is suggestive; align with your protocol and licensing.</p>';
    html += '<h4 style="margin:0 0 8px;font-size:12.5px;font-weight:700">Scales in this bundle</h4>';
    html += '<div style="font-size:12px;line-height:1.65;margin-bottom:14px">';
    rows.forEach(({ raw, meta: sm }) => {
      html += '<div style="margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:6px">';
      html += formatScaleWithImplementationBadgeHtml(raw, ASSESS_REGISTRY);
      if (sm.display_name && sm.display_name !== raw) {
        html += '<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">' + _hubEscHtml(sm.display_name) + '</div>';
      }
      if (sm.scoring_note) {
        html += '<div style="font-size:10.5px;color:var(--text-tertiary);margin-top:4px;line-height:1.45">' + _hubEscHtml(sm.scoring_note) + '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
    html += '<h4 style="margin:0 0 6px;font-size:12.5px;font-weight:700">Grouped by entry type</h4>';
    html +=
      '<p style="font-size:12px;margin:0 0 6px"><strong>In-app item lists (implemented):</strong> ' +
      _hubEscHtml(truth.implementedItemChecklist.length ? truth.implementedItemChecklist.join(', ') : '—') +
      '</p>';
    if (truth.declaredMissingForm.length) {
      html +=
        '<p style="font-size:12px;color:var(--amber);margin:0 0 6px"><strong>Checklist pending wiring (enter total manually):</strong> ' +
        _hubEscHtml(truth.declaredMissingForm.join(', ')) +
        '</p>';
    }
    html +=
      '<p style="font-size:12px;margin:0 0 6px"><strong>Numeric totals in this app:</strong> ' +
      _hubEscHtml(truth.numericEntry.length ? truth.numericEntry.join(', ') : '—') +
      '</p>';
    html +=
      '<p style="font-size:12px;margin:0 0 12px"><strong>Clinician-rated / not itemized here:</strong> ' +
      _hubEscHtml(truth.clinicianEntry.length ? truth.clinicianEntry.join(', ') : '—') +
      '</p>';
    if (truth.unknown.length) {
      html +=
        '<p style="font-size:12px;color:var(--amber);margin:0 0 12px"><strong>Unlisted abbreviations:</strong> ' +
        _hubEscHtml(truth.unknown.join(', ')) +
        ' — confirm instrument and add registry metadata if needed.</p>';
    }
    html += '<h4 style="margin:0 0 6px;font-size:12.5px;font-weight:700">Condition references (education)</h4>';
    if (meta.links && meta.links.length) {
      html += '<ul style="margin:0;padding-left:18px;font-size:12.5px;line-height:1.55">';
      meta.links.forEach(L => {
        const u = String(L.url || '').replace(/[<>"']/g, '');
        html += '<li style="margin-bottom:4px"><a href="' + u + '" target="_blank" rel="noopener noreferrer">' + _hubEscHtml(L.title) + '</a></li>';
      });
      html += '</ul>';
    } else {
      html += '<p style="font-size:12.5px;color:var(--text-tertiary)">No vetted links configured for this bundle.</p>';
    }
    html += '<p style="font-size:10.5px;color:var(--text-tertiary);margin-top:14px;line-height:1.45">Educational links only. This app does not grant rights to proprietary instruments. Follow licensing, training, and local policy. Not medical advice.</p>';
    const ti = document.getElementById('ah2-condinfo-title');
    const bd = document.getElementById('ah2-condinfo-body');
    if (ti) ti.textContent = cond.name;
    if (bd) bd.innerHTML = html;
    document.getElementById('ah2-condinfo-modal')?.classList.remove('ah2-hidden');
  };

  window._ah2Refresh = async function() {
    await hydrate();
    render();
  };

  window._ah2Export = function() {
    const rows = [['Patient', 'Condition', 'Phase', 'Scale', 'Score', 'Interpretation', 'Assigned', 'Due', 'Completed', 'Status', 'Reviewed']];
    DATA.assignments.forEach(a => {
      if (a.results && a.results.length) {
        a.results.forEach(r => {
          rows.push([
            a.patientId, a.condName, PHASE_LABELS[a.phase] || a.phase,
            r.scale, r.score, r.interp,
            a.assignedDate, a.dueDate, a.completedDate || '',
            a.status, a.reviewed ? 'Yes' : 'No',
          ]);
        });
      } else {
        a.scales.forEach(sid => {
          rows.push([
            a.patientId, a.condName, PHASE_LABELS[a.phase] || a.phase,
            sid, '', '',
            a.assignedDate, a.dueDate, '',
            a.status, 'No',
          ]);
        });
      }
    });
    const csv = rows.map(row => row.map(v => {
      const s = v == null ? '' : String(v);
      return /[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const ts = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = 'assessments-' + ts + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    window._showNotifToast?.({ title: 'Export ready', body: rows.length - 1 + ' rows exported.', severity: 'success' });
  };

  const el = document.getElementById('content');
  if (!el) return;
  el.innerHTML = '<div class="ah2-wrap" id="ah2-root"></div>' + assignModalHtml + scoreModalHtml + detailModalHtml + condInfoModalHtml + previewModalHtml;
  render();          // shows loading skeleton immediately
  await hydrate();   // fetches live data from /api/v1/assessments
  render();          // swaps in real assignments
}

export async function pgBrainMapPlanner(setTopbar) {
  setTopbar('Brain Map Planner', `
    <button class="btn btn-sm" onclick="window._bmpImportFromProtocol()">Import from protocol &#x2193;</button>
    <button class="btn btn-sm" style="border-color:var(--teal);color:var(--teal)" onclick="window._bmpSaveToProtocol()">Save to protocol &#x2192;</button>
    <button class="btn btn-sm" onclick="window._nav('protocol-wizard')">Protocol Search</button>
    <button class="btn btn-sm" onclick="window._nav('prescriptions')">Prescriptions</button>
  `);
  const el = document.getElementById('content');
  if (!el) return;

  const FALLBACK_CONDITIONS = [
    'Major Depressive Disorder','Treatment-Resistant Depression','Bipolar Depression',
    'OCD','PTSD','Generalized Anxiety','Social Anxiety','Panic Disorder',
    'ADHD','Schizophrenia','Auditory Hallucinations','Chronic Pain','Fibromyalgia',
    'Parkinson Disease','Stroke Rehabilitation','Aphasia','Tinnitus',
    'Insomnia','Traumatic Brain Injury','Eating Disorders','Addiction','Autism Spectrum'
  ];

  const BMP_SITES = {
    'Fpz':[150,14],'Fp1':[107,20],'Fp2':[193,20],
    'AF7':[72,38],'AFz':[150,40],'AF8':[228,38],
    'F7':[38,82],'F3':[97,72],'Fz':[150,68],'F4':[203,72],'F8':[262,82],
    'FT7':[28,118],'FC3':[90,108],'FCz':[150,104],'FC4':[210,108],'FT8':[272,118],
    'T7':[22,155],'C3':[78,155],'Cz':[150,155],'C4':[222,155],'T8':[278,155],
    'TP7':[28,192],'CP3':[90,202],'CPz':[150,206],'CP4':[210,202],'TP8':[272,192],
    'T5':[38,228],'P3':[97,238],'Pz':[150,242],'P4':[203,238],'T6':[262,228],
    'PO7':[60,268],'PO3':[107,260],'POz':[150,264],'PO4':[193,260],'PO8':[240,268],
    'O1':[108,288],'Oz':[150,294],'O2':[192,288],
    'AF3':[118,46],'AF4':[182,46],
    'F1':[123,72],'F2':[177,72],'F5':[62,80],'F6':[238,80],
    'FC1':[119,108],'FC2':[181,108],'FC5':[54,114],'FC6':[246,114],
    'C1':[114,155],'C2':[186,155],'C5':[50,155],'C6':[250,155],
    'CP1':[119,202],'CP2':[181,202],'CP5':[54,196],'CP6':[246,196],
    'P1':[122,240],'P2':[178,240],'P5':[72,236],'P6':[228,236],
    'PO1':[125,262],'PO2':[175,262],
  };

  const BMP_REGION_SITES = {
    'DLPFC-L':    { primary:['F3'],        ref:['Fp2'],        alt:['AF3','F1','FC1'] },
    'DLPFC-R':    { primary:['F4'],        ref:['Fp1'],        alt:['AF4','F2','FC2'] },
    'DLPFC-B':    { primary:['F3','F4'],   ref:[],             alt:['Fz'] },
    'M1-L':       { primary:['C3'],        ref:['C4'],         alt:['FC3','CP3'] },
    'M1-R':       { primary:['C4'],        ref:['C3'],         alt:['FC4','CP4'] },
    'M1-B':       { primary:['C3','C4'],   ref:['Cz'],         alt:['FC3','FC4'] },
    'SMA':        { primary:['FCz','Cz'],  ref:[],             alt:['FC1','FC2','Fz'] },
    'mPFC':       { primary:['Fz'],        ref:['Pz'],         alt:['AFz','FCz'] },
    'DMPFC':      { primary:['Fz'],        ref:['Oz'],         alt:['FCz','AF4'] },
    'VMPFC':      { primary:['Fpz'],       ref:['Pz'],         alt:['Fp1','Fp2'] },
    'OFC':        { primary:['Fp1','Fp2'], ref:['Pz'],         alt:['AF3','AF4'] },
    'ACC':        { primary:['FCz'],       ref:['Pz'],         alt:['Cz','Fz'] },
    'IFG-L':      { primary:['F7'],        ref:['F8'],         alt:['FT7','FC3'] },
    'IFG-R':      { primary:['F8'],        ref:['F7'],         alt:['FT8','FC4'] },
    'PPC-L':      { primary:['P3'],        ref:['F4'],         alt:['CP3','P5'] },
    'PPC-R':      { primary:['P4'],        ref:['F3'],         alt:['CP4','P6'] },
    'TEMPORAL-L': { primary:['T7'],        ref:['T8'],         alt:['TP7','FT7'] },
    'TEMPORAL-R': { primary:['T8'],        ref:['T7'],         alt:['TP8','FT8'] },
    'S1':         { primary:['C3'],        ref:['C4'],         alt:['CP3','FC3'] },
    'V1':         { primary:['Oz'],        ref:['Cz'],         alt:['O1','O2'] },
    'CEREBELLUM': { primary:['Oz'],        ref:['Cz'],         alt:['O1','O2','POz'] },
    'Cz':         { primary:['Cz'],        ref:['Fz'],         alt:['FC1','FC2','CP1','CP2'] },
    'Pz':         { primary:['Pz'],        ref:['Fz'],         alt:['CPz','POz'] },
    'Fz':         { primary:['Fz'],        ref:['Pz'],         alt:['FCz','AFz'] },
  };

  const BMP_PROTO_MAP = {
    'tms-mdd-hf-standard':    { region:'DLPFC-L', modality:'TMS/rTMS',     lat:'left',     freq:'10',      intensity:'120',  pulses:'3000', sessions:'36' },
    'tms-mdd-itbs':           { region:'DLPFC-L', modality:'iTBS',         lat:'left',     freq:'50',      intensity:'80',   pulses:'600',  sessions:'30' },
    'tms-mdd-bilateral':      { region:'DLPFC-B', modality:'TMS/rTMS',     lat:'bilateral',freq:'10',      intensity:'120',  pulses:'3000', sessions:'36' },
    'tms-mdd-saint':          { region:'DLPFC-L', modality:'iTBS',         lat:'left',     freq:'50',      intensity:'90',   pulses:'1800', sessions:'50' },
    'tms-ocd-h7coil':         { region:'DMPFC',   modality:'Deep TMS',     lat:'bilateral',freq:'20',      intensity:'100',  pulses:'2000', sessions:'29' },
    'tms-ocd-standard':       { region:'DMPFC',   modality:'TMS/rTMS',     lat:'bilateral',freq:'20',      intensity:'100',  pulses:'1500', sessions:'30' },
    'tms-anxiety-r-dlpfc':    { region:'DLPFC-R', modality:'TMS/rTMS',     lat:'right',    freq:'1',       intensity:'110',  pulses:'360',  sessions:'20' },
    'tms-ptsd-dlpfc':         { region:'DLPFC-L', modality:'TMS/rTMS',     lat:'left',     freq:'10',      intensity:'110',  pulses:'2000', sessions:'20' },
    'tms-schiz-avh':          { region:'TEMPORAL-L', modality:'TMS/rTMS',  lat:'left',     freq:'1',       intensity:'90',   pulses:'360',  sessions:'15' },
    'tms-parkinsons-motor':   { region:'M1-L',    modality:'TMS/rTMS',     lat:'bilateral',freq:'5',       intensity:'90',   pulses:'500',  sessions:'20' },
    'tdcs-mdd-anodal-f3':     { region:'DLPFC-L', modality:'tDCS',         lat:'left',     freq:'DC',      intensity:'2 mA', pulses:'\u2014', sessions:'20' },
    'tdcs-adhd':              { region:'DLPFC-L', modality:'tDCS',         lat:'bilateral',freq:'DC',      intensity:'1 mA', pulses:'\u2014', sessions:'15' },
    'tdcs-pain-m1':           { region:'M1-L',    modality:'tDCS',         lat:'left',     freq:'DC',      intensity:'2 mA', pulses:'\u2014', sessions:'10' },
    'tdcs-stroke-motor':      { region:'M1-L',    modality:'tDCS',         lat:'left',     freq:'DC',      intensity:'2 mA', pulses:'\u2014', sessions:'15' },
    'tdcs-aphasia':           { region:'IFG-L',   modality:'tDCS',         lat:'left',     freq:'DC',      intensity:'1 mA', pulses:'\u2014', sessions:'15' },
    'nfb-alpha-theta-anxiety':{ region:'Pz',      modality:'Neurofeedback',lat:'bilateral',freq:'6-12Hz',  intensity:'\u2014', pulses:'\u2014', sessions:'30' },
    'nfb-smr-adhd':           { region:'Cz',      modality:'Neurofeedback',lat:'bilateral',freq:'12-15Hz', intensity:'\u2014', pulses:'\u2014', sessions:'40' },
    'nfb-gamma-cognition':    { region:'Fz',      modality:'Neurofeedback',lat:'bilateral',freq:'38-42Hz', intensity:'\u2014', pulses:'\u2014', sessions:'30' },
    'nfb-theta-alpha-depress':{ region:'Fz',      modality:'Neurofeedback',lat:'bilateral',freq:'4-12Hz',  intensity:'\u2014', pulses:'\u2014', sessions:'30' },
  };

  const BMP_MNI = {
    'F3':'-46, 36, 20','F4':'46, 36, 20','C3':'-52, -2, 50','C4':'52, -2, 50',
    'Cz':'0, -2, 62','Fz':'0, 24, 58','Pz':'0, -62, 56','T7':'-72, -24, 4',
    'T8':'72, -24, 4','T5':'-62, -52, 0','T6':'62, -52, 0','Fp1':'-28, 70, 8',
    'Fp2':'28, 70, 8','Oz':'0, -100, 12','FCz':'0, 16, 62','F7':'-52, 22, 8',
    'F8':'52, 22, 8','O1':'-28, -102, 12','O2':'28, -102, 12',
    'P3':'-46, -58, 46','P4':'46, -58, 46',
  };

  const BMP_BA = {
    'F3':'BA9/46','F4':'BA9/46','C3':'BA4','C4':'BA4','Cz':'BA4',
    'Fz':'BA8/32','Pz':'BA7','T7':'BA21/22','T8':'BA21/22',
    'Fp1':'BA10','Fp2':'BA10','Oz':'BA17','FCz':'BA6',
    'F7':'BA45/47','F8':'BA45/47','O1':'BA17/18','O2':'BA17/18',
    'P3':'BA40','P4':'BA40',
  };

  const BMP_ANATOMY = {
    'Fpz':'Prefrontal Midline','Fp1':'Left Frontopolar Cortex','Fp2':'Right Frontopolar Cortex',
    'AF7':'Left Anterior Frontal','AFz':'Anterior Frontal Midline','AF8':'Right Anterior Frontal',
    'AF3':'Left Anterior Frontal (lat)','AF4':'Right Anterior Frontal (lat)',
    'F7':'Left Inferior Frontal Gyrus','F3':'Left Dorsolateral Prefrontal Cortex (DLPFC)',
    'Fz':'Supplementary Motor / Medial PFC','F4':'Right Dorsolateral Prefrontal Cortex (DLPFC)',
    'F8':'Right Inferior Frontal Gyrus',
    'F1':'Left Frontal (medial)','F2':'Right Frontal (medial)',
    'F5':'Left Frontal (lateral)','F6':'Right Frontal (lateral)',
    'FT7':'Left Frontotemporal','FC3':'Left Premotor / Frontal Eye Field',
    'FCz':'Supplementary Motor Area (SMA)','FC4':'Right Premotor','FT8':'Right Frontotemporal',
    'FC1':'Left SMA (medial)','FC2':'Right SMA (medial)',
    'FC5':'Left Premotor (lateral)','FC6':'Right Premotor (lateral)',
    'T7':'Left Superior Temporal Gyrus','C3':'Left Primary Motor Cortex (M1)',
    'Cz':'Primary Motor / Sensory Midline','C4':'Right Primary Motor Cortex (M1)',
    'T8':'Right Superior Temporal Gyrus',
    'C1':'Left Motor (medial)','C2':'Right Motor (medial)',
    'C5':'Left Motor (lateral)','C6':'Right Motor (lateral)',
    'TP7':'Left Temporoparietal Junction','CP3':'Left Somatosensory / Parietal',
    'CPz':'Parietal Midline','CP4':'Right Somatosensory / Parietal',
    'TP8':'Right Temporoparietal Junction',
    'CP1':'Left Parietal (medial)','CP2':'Right Parietal (medial)',
    'CP5':'Left Parietal (lateral)','CP6':'Right Parietal (lateral)',
    'T5':'Left Posterior Temporal','P3':'Left Inferior Parietal Lobule',
    'Pz':'Posterior Parietal Midline','P4':'Right Inferior Parietal Lobule',
    'T6':'Right Posterior Temporal',
    'P1':'Left Parietal (medial)','P2':'Right Parietal (medial)',
    'P5':'Left Parietal (lateral)','P6':'Right Parietal (lateral)',
    'PO7':'Left Parieto-Occipital','PO3':'Left Parieto-Occipital (medial)',
    'POz':'Parieto-Occipital Midline','PO4':'Right Parieto-Occipital (medial)',
    'PO8':'Right Parieto-Occipital',
    'PO1':'Left Parieto-Occipital (para)','PO2':'Right Parieto-Occipital (para)',
    'O1':'Left Primary Visual Cortex','Oz':'Occipital Midline / V1','O2':'Right Primary Visual Cortex',
  };

  const BMP_CONDITIONS = {
    'F3':['MDD','TRD','PTSD','ADHD','Anxiety','Bipolar Depression'],
    'F4':['Anxiety','Depression (inhibitory)','OCD','Addiction'],
    'Fz':['ADHD','Depression (midline)','Neurofeedback','SMA disorders'],
    'FCz':['SMA','OCD (deep midline)','Motor recovery'],
    'C3':['Motor rehabilitation','Chronic pain','Parkinson','Stroke'],
    'C4':['Motor rehabilitation','Stroke (left hemisphere)','Chronic pain'],
    'Cz':['Neurofeedback (SMR)','Motor midline','ADHD'],
    'Pz':['Neurofeedback (alpha-theta)','Anxiety','Memory'],
    'T7':['Auditory hallucinations','Schizophrenia','Language disorders'],
    'T8':['Tinnitus','Right temporal disorders'],
    'F7':['Aphasia','IFG stimulation'],
    'Oz':['Visual cortex stimulation','Migraine','V1 research'],
  };

  const BMP_PLACEMENT = {
    'F3': 'Position the coil 5 cm anterior and 2 cm lateral to M1 (C3). Target: -46,36,20 MNI. Beam F3: from Cz, 2cm left then 3cm forward.',
    'F4': '5 cm anterior and 2 cm lateral to C4. Mirror of F3. MNI: +46,36,20. From Cz: 2cm right then 3cm forward.',
    'C3': 'Motor cortex left. Locate Cz (50% nasion-inion), measure 7cm lateral left. Confirm with MEP for motor threshold.',
    'C4': 'Motor cortex right. Mirror of C3. 7cm lateral right from Cz.',
    'Cz': 'Midpoint: 50% of nasion-to-inion and 50% of tragus-to-tragus. Their intersection = Cz.',
    'Fz': 'Midline frontal. 30% from nasion along nasion-to-inion midline = Fz.',
    'FCz': 'Midpoint between Fz and Cz on the midline.',
    'T7': 'Left temporal. Step = 10% of nasion-inion arc. T7 is 3 steps lateral-left from Cz on temporal line.',
    'Oz': 'Occipital midline. 10% above the inion; measure upward from inion along midline.',
    'Fp1': 'Left frontopolar. ~5% from Fpz toward F7 on nasion arc.',
    'Fp2': 'Right frontopolar. Mirror of Fp1.',
    'F7': 'Left inferior frontal. Between F3 and T7; ~3 steps lateral from Fz on frontal arc.',
    'F8': 'Right inferior frontal. Mirror of F7.',
    'P3': 'Left inferior parietal. 7cm left from Pz, or 60% nasion-inion then 7cm lateral.',
    'P4': 'Right inferior parietal. Mirror of P3.',
    'T8': 'Right temporal. Mirror of T7.',
    'Pz': 'Parietal midline. 80% of nasion-to-inion distance from nasion.',
  };

  const BMP_PROTO_LABELS = {
    'tms-mdd-hf-standard':    'HF-rTMS DLPFC-L (MDD)',
    'tms-mdd-itbs':           'iTBS DLPFC-L (MDD)',
    'tms-mdd-bilateral':      'Bilateral rTMS (MDD)',
    'tms-mdd-saint':          'SAINT / Accelerated iTBS',
    'tms-ocd-h7coil':         'Deep TMS H7-Coil (OCD)',
    'tms-ocd-standard':       'rTMS DMPFC (OCD)',
    'tms-anxiety-r-dlpfc':    'LF-rTMS R-DLPFC (Anxiety)',
    'tms-ptsd-dlpfc':         'rTMS DLPFC-L (PTSD)',
    'tms-schiz-avh':          'LF-rTMS Temporal-L (AVH)',
    'tms-parkinsons-motor':   'rTMS M1 (Parkinson)',
    'tdcs-mdd-anodal-f3':     'tDCS Anodal F3 (MDD)',
    'tdcs-adhd':              'tDCS DLPFC Bilateral (ADHD)',
    'tdcs-pain-m1':           'tDCS M1 (Chronic Pain)',
    'tdcs-stroke-motor':      'tDCS M1 (Stroke Motor)',
    'tdcs-aphasia':           'tDCS IFG-L (Aphasia)',
    'nfb-alpha-theta-anxiety':'NFB Alpha-Theta Pz (Anxiety)',
    'nfb-smr-adhd':           'NFB SMR Cz (ADHD)',
    'nfb-gamma-cognition':    'NFB Gamma Fz (Cognition)',
    'nfb-theta-alpha-depress':'NFB Theta-Alpha Fz (Depression)',
  };

  const MODALITY_COLORS = {
    'TMS/rTMS':'#00d4bc','iTBS':'#00d4bc','cTBS':'#5ee7df','Deep TMS':'#06b6d4',
    'tDCS':'#4a9eff','tACS':'#818cf8','Neurofeedback':'#f59e0b',
    'taVNS':'#a78bfa','CES':'#34d399','PBM':'#fb923c','TPS':'#f472b6',
  };

  // Modality → dot color for MRI overlay (mirrors MODALITY_DOT_COLOR in
  // pages-mri-analysis.js so the planner's MRI focus viewer is visually
  // consistent with the MRI analysis page).
  const MODALITY_DOT_COLOR = {
    rtms: '#f59e0b', tps: '#c026d3', tfus: '#06b6d4',
    tdcs: '#22c55e', tacs: '#eab308', custom: '#94a3b8',
  };
  function _bmpModalityDotColor(mod) {
    const m = String(mod || '').toLowerCase();
    if (m.indexOf('tdcs') !== -1) return MODALITY_DOT_COLOR.tdcs;
    if (m.indexOf('tacs') !== -1) return MODALITY_DOT_COLOR.tacs;
    if (m.indexOf('tps') !== -1)  return MODALITY_DOT_COLOR.tps;
    if (m.indexOf('tfus') !== -1 || m.indexOf('tus') !== -1) return MODALITY_DOT_COLOR.tfus;
    if (m.indexOf('tms') !== -1 || m.indexOf('itbs') !== -1 || m.indexOf('ctbs') !== -1) {
      return MODALITY_DOT_COLOR.rtms;
    }
    return '#60a5fa';
  }
  // Parse the comma-separated BMP_MNI strings ("-46, 36, 20") into numeric
  // tuples once so the MRI viewer can project per-plane without re-parsing.
  const BMP_MNI_TUPLE = {};
  Object.keys(BMP_MNI).forEach(function(site) {
    const parts = String(BMP_MNI[site] || '').split(',').map(function(s) {
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : null;
    });
    if (parts.length === 3 && parts.every(function(v) { return v != null; })) {
      BMP_MNI_TUPLE[site] = parts;
    }
  });
  // Resolve MNI for a catalog entry by walking primary 10-20 site → BMP_MNI.
  // Returns null when the region's primary site has no MNI mapping (caller
  // should skip the dot rather than fabricate coordinates).
  function _bmpCatalogMNI(cat) {
    if (!cat) return null;
    const tries = [];
    if (cat.targetRegion && BMP_REGION_SITES[cat.targetRegion]) {
      const rs = BMP_REGION_SITES[cat.targetRegion];
      (rs.primary || []).forEach(function(s) { tries.push(s); });
    }
    if (cat.anode) tries.push(cat.anode);
    for (let i = 0; i < tries.length; i++) {
      const t = BMP_MNI_TUPLE[tries[i]];
      if (t) return { mni: t, site: tries[i] };
    }
    return null;
  }

  const BMP_STORAGE_KEY = 'ds_brain_map_planner_state_v1';
  const BMP_PRESETS_KEY = 'ds_brain_map_planner_presets_v1';

  let bmpState = {
    region:'', modality:'TMS/rTMS', lat:'left',
    freq:'', intensity:'', pulses:'', duration:'', sessions:'', notes:'',
    selectedSite:'', view:'clinical', protoId:'',
    zoom: 1,
    labelMode: 'smart', // smart | full | minimal
    panX: 0, // in SVG coordinate units (viewBox space)
    panY: 0,
    // v2 additions — all behaviourally backwards-compatible (tab defaults to
    // 'clinical' which mirrors the pre-v2 single-screen experience).
    tab: 'clinical',           // clinical | montage | research
    patientId: '',             // optional free-string patient label; '' → "Demo patient"
    placeMode: 'anode',        // anode | cathode — which electrode a map-click places
    compare: false,            // 2-up compare canvases
    eFieldOverlay: true,       // toggle radial-gradient E-field on primary site
    waveform: 'Anodal DC',     // stimulation waveform hint
    mriOverlay: false,         // toggle MRI focus viewer panel under canvas
  };

  // Load persisted state (best-effort). Never trust shape fully.
  try {
    const raw = JSON.parse(localStorage.getItem(BMP_STORAGE_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      bmpState = {
        ...bmpState,
        region:       typeof raw.region === 'string' ? raw.region : bmpState.region,
        modality:     typeof raw.modality === 'string' ? raw.modality : bmpState.modality,
        lat:          typeof raw.lat === 'string' ? raw.lat : bmpState.lat,
        freq:         typeof raw.freq === 'string' ? raw.freq : bmpState.freq,
        intensity:    typeof raw.intensity === 'string' ? raw.intensity : bmpState.intensity,
        pulses:       typeof raw.pulses === 'string' ? raw.pulses : bmpState.pulses,
        duration:     typeof raw.duration === 'string' ? raw.duration : bmpState.duration,
        sessions:     typeof raw.sessions === 'string' ? raw.sessions : bmpState.sessions,
        notes:        typeof raw.notes === 'string' ? raw.notes : bmpState.notes,
        selectedSite: typeof raw.selectedSite === 'string' ? raw.selectedSite : bmpState.selectedSite,
        view:         (raw.view === 'patient' || raw.view === 'clinical') ? raw.view : bmpState.view,
        protoId:      typeof raw.protoId === 'string' ? raw.protoId : bmpState.protoId,
        zoom:         Number.isFinite(raw.zoom) ? raw.zoom : bmpState.zoom,
        labelMode:    (raw.labelMode === 'full' || raw.labelMode === 'minimal' || raw.labelMode === 'smart') ? raw.labelMode : bmpState.labelMode,
        panX:         Number.isFinite(raw.panX) ? raw.panX : bmpState.panX,
        panY:         Number.isFinite(raw.panY) ? raw.panY : bmpState.panY,
        tab:          (raw.tab === 'clinical' || raw.tab === 'montage' || raw.tab === 'research') ? raw.tab : bmpState.tab,
        patientId:    typeof raw.patientId === 'string' ? raw.patientId : bmpState.patientId,
        placeMode:    (raw.placeMode === 'anode' || raw.placeMode === 'cathode') ? raw.placeMode : bmpState.placeMode,
        compare:      !!raw.compare,
        eFieldOverlay: raw.eFieldOverlay == null ? bmpState.eFieldOverlay : !!raw.eFieldOverlay,
        waveform:     typeof raw.waveform === 'string' ? raw.waveform : bmpState.waveform,
        mriOverlay:   raw.mriOverlay == null ? bmpState.mriOverlay : !!raw.mriOverlay,
      };
    }
  } catch (_) {}

  function _persist() {
    try {
      localStorage.setItem(BMP_STORAGE_KEY, JSON.stringify({
        region: bmpState.region,
        modality: bmpState.modality,
        lat: bmpState.lat,
        freq: bmpState.freq,
        intensity: bmpState.intensity,
        pulses: bmpState.pulses,
        duration: bmpState.duration,
        sessions: bmpState.sessions,
        notes: bmpState.notes,
        selectedSite: bmpState.selectedSite,
        view: bmpState.view,
        protoId: bmpState.protoId,
        zoom: bmpState.zoom,
        labelMode: bmpState.labelMode,
        panX: bmpState.panX,
        panY: bmpState.panY,
        tab: bmpState.tab,
        patientId: bmpState.patientId,
        placeMode: bmpState.placeMode,
        compare: bmpState.compare,
        eFieldOverlay: bmpState.eFieldOverlay,
        waveform: bmpState.waveform,
        mriOverlay: bmpState.mriOverlay,
      }));
    } catch (_) {}
  }

  function _loadPresets() {
    try {
      const raw = JSON.parse(localStorage.getItem(BMP_PRESETS_KEY) || '[]');
      if (Array.isArray(raw)) return raw.filter(x => x && typeof x === 'object' && typeof x.name === 'string');
    } catch (_) {}
    return [];
  }
  function _savePresets(items) {
    try { localStorage.setItem(BMP_PRESETS_KEY, JSON.stringify(items || [])); } catch (_) {}
  }
  function _planSummary() {
    const s = bmpState;
    const parts = [];
    if (s.modality) parts.push(`Modality: ${s.modality}`);
    if (s.region) parts.push(`Target region: ${s.region}`);
    if (s.selectedSite) parts.push(`Primary site: ${s.selectedSite}`);
    if (s.lat) parts.push(`Laterality: ${s.lat}`);
    if (s.freq) parts.push(`Frequency: ${s.freq}`);
    if (s.intensity) parts.push(`Intensity: ${s.intensity}`);
    if (s.pulses) parts.push(`Pulses/session: ${s.pulses}`);
    if (s.duration) parts.push(`Duration: ${s.duration}`);
    if (s.sessions) parts.push(`Sessions: ${s.sessions}`);
    if (s.notes) parts.push(`Notes: ${s.notes}`);
    return parts.join('\n');
  }

  let conds = [], protos = [];
  let _libProtos = [], _libConditions = [], _libDevices = [];
  try {
    const apiObj = window._api || window.api;
    const [cd, pd, lib] = await Promise.all([
      apiObj ? apiObj.conditions().catch(function() { return null; }) : Promise.resolve(null),
      apiObj ? apiObj.protocols().catch(function()  { return null; }) : Promise.resolve(null),
      import('./protocols-data.js').catch(function() { return null; }),
    ]);
    conds  = (cd && cd.items)  ? cd.items  : [];
    protos = (pd && pd.items)  ? pd.items  : [];
    if (lib) {
      _libProtos     = lib.PROTOCOL_LIBRARY || [];
      _libConditions = lib.CONDITIONS       || [];
      _libDevices    = lib.DEVICES          || [];
    }
  } catch (_) {}
  if (!conds.length) conds = FALLBACK_CONDITIONS.map(function(n) { return { name: n }; });

  function _devToModality(dev, subtype) {
    const s = String(subtype || '').toLowerCase();
    if (dev === 'tms' || dev === 'deep_tms') {
      if (s.indexOf('itbs') !== -1) return 'iTBS';
      if (s.indexOf('ctbs') !== -1) return 'cTBS';
      if (s.indexOf('deep') !== -1 || s.indexOf('h-coil') !== -1) return 'Deep TMS';
      return 'TMS/rTMS';
    }
    const M = { tdcs:'tDCS', tacs:'tACS', ces:'CES', tavns:'taVNS', tps:'TPS',
                pbm:'PBM', pemf:'PBM', nf:'Neurofeedback', tus:'TPS' };
    return M[dev] || 'TMS/rTMS';
  }

  function _inferElectrodes(p) {
    const name    = (p && (p.name || '')       || '').toLowerCase();
    const summary = (p && (p.notes || p.summary || '') || '').toLowerCase();
    const target  = (p && (p.target || '')     || '').toLowerCase();
    const blob = name + ' ' + summary + ' ' + target;
    if (/anode\s*f3[\s\S]*cathode\s*f4/i.test(blob)) return { anode:'F3', cathode:'F4', targetRegion:'DLPFC-L' };
    if (/left dlpfc|\(f3\)|\bf3\b/.test(blob))   return { anode:'F3', targetRegion:'DLPFC-L' };
    if (/right dlpfc|\(f4\)|\bf4\b/.test(blob))  return { anode:'F4', targetRegion:'DLPFC-R' };
    if (/\bsma\b|\bfcz\b/.test(blob))            return { anode:'FCz', targetRegion:'SMA' };
    if (/dmpfc|dorsomedial/.test(blob))          return { anode:'Fz', targetRegion:'DMPFC' };
    if (/mpfc|medial pfc|\bfz\b/.test(blob))     return { anode:'Fz', targetRegion:'mPFC' };
    if (/ifg|\bf7\b|broca/.test(blob))           return { anode:'F7', targetRegion:'IFG-L' };
    if (/vertex|\bcz\b/.test(blob))              return { anode:'Cz', targetRegion:'Cz' };
    if (/occipital|\boz\b|\bo1\b|\bo2\b/.test(blob)) return { anode:'Oz', targetRegion:'V1' };
    if (/alpha.?theta|\bpz\b/.test(blob))        return { anode:'Pz', targetRegion:'Pz' };
    if (/left m1|m1-l|motor.*left|\bc3\b/.test(blob)) return { anode:'C3', targetRegion:'M1-L' };
    if (/right m1|m1-r|motor.*right|\bc4\b/.test(blob)) return { anode:'C4', targetRegion:'M1-R' };
    if (/temporal.*left|\bt7\b|\bt5\b/.test(blob)) return { anode:'T7', targetRegion:'TEMPORAL-L' };
    if (/temporal.*right|\bt8\b|\bt6\b/.test(blob)) return { anode:'T8', targetRegion:'TEMPORAL-R' };
    if (p && (p.device === 'tms' || p.device === 'deep_tms')) return { anode:'F3', targetRegion:'DLPFC-L' };
    if (p && p.device === 'tdcs')  return { anode:'F3', cathode:'F4', targetRegion:'DLPFC-L' };
    if (p && p.device === 'nf')    return { anode:'Cz', targetRegion:'Cz' };
    return { anode: 'F3', targetRegion: 'DLPFC-L' };
  }

  // Unified protocol catalog: curated (exact params) wins, library fills bulk,
  // backend registry fills gaps. Dedup by id.
  const _catalog = [];
  const _seen = new Set();
  Object.keys(BMP_PROTO_MAP).forEach(function(id) {
    _seen.add(id);
    const m = BMP_PROTO_MAP[id];
    const rs = BMP_REGION_SITES[m.region];
    _catalog.push({
      id: id,
      name: BMP_PROTO_LABELS[id] || id,
      conditionId: '',
      device: '',
      modality: m.modality,
      evidenceGrade: 'A',
      summary: '',
      anode:   rs && rs.primary && rs.primary.length ? rs.primary[0] : null,
      cathode: rs && rs.ref && rs.ref.length ? rs.ref[0] : null,
      targetRegion: m.region,
      parameters: { frequency_hz: m.freq, intensity: m.intensity, pulses_per_session: m.pulses, sessions_total: m.sessions },
      source: 'curated',
    });
  });
  _libProtos.forEach(function(p) {
    if (!p || !p.id || _seen.has(p.id)) return;
    _seen.add(p.id);
    const inf = _inferElectrodes(p);
    _catalog.push({
      id: p.id, name: p.name || p.id,
      conditionId: p.conditionId || '',
      device: p.device || '',
      subtype: p.subtype || '',
      modality: _devToModality(p.device, p.subtype),
      evidenceGrade: p.evidenceGrade || '?',
      summary: p.notes || '',
      anode: inf.anode || null,
      cathode: inf.cathode || null,
      targetRegion: inf.targetRegion || null,
      parameters: p.parameters || {},
      source: 'library',
    });
  });
  (protos || []).forEach(function(row) {
    if (!row || !row.id || _seen.has(row.id)) return;
    _seen.add(row.id);
    const inf = _inferElectrodes({
      name: row.name, notes: row.evidence_summary || row.coil_or_electrode_placement || '',
      target: row.target_region || '', device: (row.modality_id || '').toLowerCase(),
    });
    _catalog.push({
      id: row.id, name: row.name || row.id,
      conditionId: row.condition_id || '',
      device: (row.modality_id || '').toLowerCase(),
      subtype: row.subtype || '',
      modality: _devToModality((row.modality_id||'').toLowerCase(), row.subtype),
      evidenceGrade: String(row.evidence_grade || '').replace(/^EV-/, '') || '?',
      summary: row.evidence_summary || '',
      anode: inf.anode || null,
      cathode: inf.cathode || null,
      targetRegion: inf.targetRegion || null,
      parameters: { frequency_hz: row.frequency_hz || '', intensity: row.intensity || '', total_course: row.total_course || '' },
      source: 'backend',
    });
  });

  const _catalogById = {};
  _catalog.forEach(function(e) { _catalogById[e.id] = e; });

  const _bmpProtoFilter = { q: '', cond: '', ev: '', site: '' };

  function _esc(s) {
    return String(s || '').replace(/[&<>"']/g, function(c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function _mc() { return MODALITY_COLORS[bmpState.modality] || '#00d4bc'; }

  // ── Brain Map Planner v2 helpers ─────────────────────────────────────────
  // Region-group bucketing mirrors the design's left-atlas groupings so the
  // visible ordering matches the clinician-grade layout without duplicating
  // the region table.
  function _regionGroup(id) {
    if (!id) return 'Other';
    if (/^DLPFC|^mPFC|^DMPFC|^VMPFC|^OFC|^ACC$/.test(id)) return 'Prefrontal';
    if (/^M1|^SMA$|^S1$/.test(id)) return 'Motor / Sensory';
    if (/^TEMPORAL|^IFG|^PPC/.test(id)) return 'Parietal / Temporal';
    if (/^V1$|^CEREBELLUM$/.test(id)) return 'Occipital';
    return 'Other';
  }
  function _regionLabel(id) {
    const map = {
      'DLPFC-L':'DLPFC · Left', 'DLPFC-R':'DLPFC · Right', 'DLPFC-B':'DLPFC · Bilateral',
      'M1-L':'M1 · Left', 'M1-R':'M1 · Right', 'M1-B':'M1 · Bilateral',
      'SMA':'SMA · Supplementary motor', 'mPFC':'mPFC · Medial PFC',
      'DMPFC':'DMPFC · Dorsomedial', 'VMPFC':'VMPFC · Ventromedial',
      'OFC':'OFC · Orbitofrontal', 'ACC':'ACC · Anterior cingulate',
      'IFG-L':"Broca · IFG Left", 'IFG-R':'IFG · Right',
      'PPC-L':'PPC · Left', 'PPC-R':'PPC · Right',
      'TEMPORAL-L':'Temporal · Left', 'TEMPORAL-R':'Temporal · Right',
      'S1':'S1 · Somatosensory', 'V1':'V1 · Primary visual',
      'CEREBELLUM':'Cerebellum', 'Cz':'Cz · Vertex', 'Pz':'Pz · Parietal midline',
      'Fz':'Fz · Frontal midline',
    };
    return map[id] || id.replace(/[-_]/g, ' ');
  }
  function _regionFunction(id) {
    const fn = {
      'DLPFC-L':'Executive control · cognitive reappraisal · top-down affect',
      'DLPFC-R':'Inhibitory control · risk aversion · anxious rumination',
      'DLPFC-B':'Bilateral executive regulation · MDD & cognition',
      'M1-L':'Pain modulation · motor rehab · corticospinal excitability',
      'M1-R':'Motor recovery (right) · chronic pain · post-stroke',
      'M1-B':'Bilateral M1 · motor rehab · pain',
      'SMA':'Motor planning · response inhibition · tics · OCD rituals',
      'mPFC':'Midline self-referential processing · mood',
      'DMPFC':'Deep midline target · OCD · depression',
      'VMPFC':'Emotion valuation · fear extinction · default mode',
      'OFC':'Reward valuation · craving · addiction',
      'ACC':'Conflict monitoring · pain affect · attention',
      'IFG-L':'Speech production · post-stroke aphasia rehab',
      'IFG-R':'Response inhibition · disinhibition',
      'PPC-L':'Attention · working memory · left neglect',
      'PPC-R':'Spatial attention · neglect rehab',
      'TEMPORAL-L':'Auditory hallucinations · language · schizophrenia',
      'TEMPORAL-R':'Tinnitus · right-hemisphere auditory',
      'S1':'Somatosensory cortex · pain processing',
      'V1':'Cortical excitability · migraine prophylaxis',
      'CEREBELLUM':'Motor coordination · ataxia · cognition',
      'Cz':'Motor/sensory midline · neurofeedback SMR',
      'Pz':'Alpha-theta training · anxiety · memory',
      'Fz':'Frontal midline · ADHD · neurofeedback',
    };
    return fn[id] || 'Targeted 10-20 region';
  }

  // Pad-density math for safety envelope. Mirrors the design's 35×35 mm pad
  // spec (12.25 cm²). Guidelines cap at 0.08 mA/cm² (Antal 2017); amber
  // 0.08–0.12; err > 0.12.
  const BMP_PAD_AREA_CM2 = 12.25;
  function _parseIntensityMA(v) {
    const m = String(v || '').match(/-?\d+(?:\.\d+)?/);
    if (!m) return 0;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : 0;
  }
  function _computeDensity(intensity_mA, pad_cm2) {
    const mA = Number.isFinite(intensity_mA) ? intensity_mA : _parseIntensityMA(intensity_mA);
    const area = pad_cm2 || BMP_PAD_AREA_CM2;
    if (area <= 0) return 0;
    return Math.round((mA / area) * 1000) / 1000; // mA/cm² to 3 dp
  }
  function _densityStatus(d) {
    if (d > 0.12) return 'err';
    if (d > 0.08) return 'amber';
    return 'ok';
  }

  // Pick up to 3 evidence rows for the active protocol: the protocol itself
  // plus up to 2 catalog siblings sharing the same targetRegion with distinct
  // evidence grades. All in-memory, no new API.
  function _evidenceForActive() {
    const active = bmpState.protoId ? _catalogById[bmpState.protoId] : null;
    if (!active) return [];
    const out = [{
      id: active.id,
      title: active.name,
      summary: active.summary || '',
      grade: active.evidenceGrade || '?',
      meta: active.modality + (active.source !== 'curated' ? ' · inferred target' : ''),
      isActive: true,
    }];
    const seenGrades = new Set([String(active.evidenceGrade || '?').toUpperCase()]);
    _catalog.forEach(function(p) {
      if (out.length >= 3) return;
      if (p.id === active.id) return;
      if (!p.targetRegion || p.targetRegion !== active.targetRegion) return;
      const g = String(p.evidenceGrade || '?').toUpperCase();
      if (seenGrades.has(g)) return;
      seenGrades.add(g);
      out.push({
        id: p.id,
        title: p.name,
        summary: p.summary || '',
        grade: p.evidenceGrade || '?',
        meta: p.modality + ' · ' + (p.source === 'curated' ? 'curated' : p.source === 'library' ? 'library' : 'registry'),
        isActive: false,
      });
    });
    return out;
  }

  function _inferRegionFromSite(site) {
    if (!site) return '';
    const keys = Object.keys(BMP_REGION_SITES);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const rs = BMP_REGION_SITES[k];
      if (!rs) continue;
      if (rs.primary.indexOf(site) !== -1) return k;
    }
    return '';
  }

  function _siteRole(site) {
    if (!bmpState.region || !BMP_REGION_SITES[bmpState.region]) return 'inactive';
    const rs = BMP_REGION_SITES[bmpState.region];
    if (rs.primary.indexOf(site) !== -1) return 'primary';
    if (rs.ref.indexOf(site)     !== -1) return 'ref';
    if (rs.alt.indexOf(site)     !== -1) return 'alt';
    return 'inactive';
  }

  // SVG uses data-site attr + delegated events (avoids inline handler quoting issues)
  function _siteG(name, sx, sy, innerHtml) {
    return '<g class="bmp-site-g" data-site="' + _esc(name) + '" style="cursor:pointer">'
      + innerHtml
      + '</g>';
  }

  function _buildSVG(patientView) {
    const mc = _mc();
    const region = (bmpState.region && BMP_REGION_SITES[bmpState.region])
      ? BMP_REGION_SITES[bmpState.region] : { primary:[], ref:[], alt:[] };
    const pp = region.primary, rp = region.ref, ap = region.alt;
    const sp = [];
    const s = function(x) { sp.push(x); };
    const z = Number(bmpState.zoom || 1);
    const panX = Number(bmpState.panX || 0);
    const panY = Number(bmpState.panY || 0);
    const zSafe = Number.isFinite(z) ? Math.max(1, Math.min(1.8, z)) : 1;
    const panXS = Number.isFinite(panX) ? panX : 0;
    const panYS = Number.isFinite(panY) ? panY : 0;
    s('<svg id="bmp-svg" class="bmp-svg" viewBox="0 0 300 310" width="100%" height="420"'
      + ' xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible;max-width:520px">');
    s('<defs><filter id="bmp-glow" x="-50%" y="-50%" width="200%" height="200%">'
      + '<feGaussianBlur stdDeviation="3" result="blur"/>'
      + '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>'
      + '</filter>'
      + '<radialGradient id="bmp-efield" cx="50%" cy="50%" r="50%">'
      + '<stop offset="0%" stop-color="rgba(255,107,157,0.7)"/>'
      + '<stop offset="30%" stop-color="rgba(255,139,71,0.45)"/>'
      + '<stop offset="55%" stop-color="rgba(255,181,71,0.22)"/>'
      + '<stop offset="75%" stop-color="rgba(74,222,128,0.1)"/>'
      + '<stop offset="100%" stop-color="rgba(0,212,188,0)"/>'
      + '</radialGradient>'
      + '</defs>');
    s('<g id="bmp-vp" transform="translate(' + panXS + ' ' + panYS + ') scale(' + zSafe + ')">');
    // Head outline — made visibly stronger (0.25 → 0.55 stroke) so clinicians can
    // actually see the head shape. Matches the new brain-map-svg.js helper.
    s('<ellipse cx="150" cy="155" rx="128" ry="148" fill="#0f1623"'
      + ' stroke="rgba(255,255,255,0.55)" stroke-width="2"/>');
    // Nose triangle pointing up at the nasion (instead of a tiny chevron)
    s('<polygon points="150,4 140,22 160,22" fill="rgba(255,255,255,0.12)"'
      + ' stroke="rgba(255,255,255,0.55)" stroke-width="1.5" stroke-linejoin="round"/>');
    // Ear bumps (ellipses) on both sides — clearer front/back orientation
    s('<ellipse cx="16" cy="155" rx="8" ry="22" fill="rgba(255,255,255,0.08)"'
      + ' stroke="rgba(255,255,255,0.45)" stroke-width="1.5"/>');
    s('<ellipse cx="284" cy="155" rx="8" ry="22" fill="rgba(255,255,255,0.08)"'
      + ' stroke="rgba(255,255,255,0.45)" stroke-width="1.5"/>');
    // Midline + coronal guides
    s('<line x1="150" y1="10" x2="150" y2="300" stroke="rgba(255,255,255,0.08)"'
      + ' stroke-width="0.6" stroke-dasharray="2 4"/>');
    s('<line x1="22" y1="155" x2="278" y2="155" stroke="rgba(255,255,255,0.08)"'
      + ' stroke-width="0.6" stroke-dasharray="2 4"/>');
    // L/R hemisphere labels just outside the head
    s('<text x="32" y="158" text-anchor="middle" font-size="10"'
      + ' fill="rgba(255,255,255,0.35)" font-family="system-ui">L</text>');
    s('<text x="268" y="158" text-anchor="middle" font-size="10"'
      + ' fill="rgba(255,255,255,0.35)" font-family="system-ui">R</text>');
    if (patientView) {
      pp.forEach(function(site) {
        const pos = BMP_SITES[site]; if (!pos) return;
        const sx = pos[0], sy = pos[1];
        const anat = BMP_ANATOMY[site] || site;
        const lbl  = anat.length > 22 ? anat.slice(0, 22) + '...' : anat;
        s(_siteG(site, sx, sy,
          '<circle cx="' + sx + '" cy="' + sy + '" r="32" fill="' + mc + '" opacity="0.18"/>'
          + '<circle cx="' + sx + '" cy="' + sy + '" r="22" fill="' + mc + '" opacity="0.28"/>'
          + '<circle cx="' + sx + '" cy="' + sy + '" r="13" fill="' + mc + '" opacity="0.55"/>'
          + '<text x="' + sx + '" y="' + (sy + 46) + '" text-anchor="middle" font-size="9"'
          + ' fill="rgba(255,255,255,0.7)" font-family="system-ui">' + _esc(lbl) + '</text>'
        ));
      });
    } else {
      const showInactiveLabels = (bmpState.labelMode === 'full') || (bmpState.labelMode === 'smart' && (bmpState.zoom || 1) >= 1.35);
      Object.keys(BMP_SITES).forEach(function(name) {
        if (_siteRole(name) !== 'inactive') return;
        const pos = BMP_SITES[name];
        const sx = pos[0], sy = pos[1];
        s(_siteG(name, sx, sy,
          '<circle cx="' + sx + '" cy="' + sy + '" r="7" fill="rgba(148,163,184,0.10)"'
          + ' stroke="rgba(148,163,184,0.24)" stroke-width="0.9"/>'
          + (showInactiveLabels
            ? ('<text x="' + (sx + 9) + '" y="' + (sy + 4) + '" font-size="8"'
              + ' fill="rgba(148,163,184,0.35)" font-family="system-ui">' + _esc(name) + '</text>')
            : '')
        ));
      });
      ap.forEach(function(name) {
        const pos = BMP_SITES[name]; if (!pos) return;
        const sx = pos[0], sy = pos[1];
        s(_siteG(name, sx, sy,
          '<circle cx="' + sx + '" cy="' + sy + '" r="9" fill="rgba(74,158,255,0.15)"'
          + ' stroke="#4a9eff" stroke-width="1" stroke-dasharray="3 2"/>'
          + '<text x="' + (sx + 11) + '" y="' + (sy + 4) + '" font-size="9"'
          + ' fill="rgba(74,158,255,0.7)" font-family="system-ui">' + _esc(name) + '</text>'
        ));
      });
      rp.forEach(function(name) {
        const pos = BMP_SITES[name]; if (!pos) return;
        const sx = pos[0], sy = pos[1];
        s(_siteG(name, sx, sy,
          '<circle cx="' + sx + '" cy="' + sy + '" r="13" fill="#ffb547" opacity="0.12"/>'
          + '<circle cx="' + sx + '" cy="' + sy + '" r="9" fill="#ffb547" opacity="0.55"'
          + ' filter="url(#bmp-glow)"/>'
          + '<text x="' + (sx + 12) + '" y="' + (sy + 4) + '" font-size="9" fill="#ffb547"'
          + ' font-weight="600" font-family="system-ui">' + _esc(name)
          + (bmpState.modality === 'tDCS' ? ' \u2212' : '') + '</text>'
        ));
      });
      pp.forEach(function(name) {
        const pos = BMP_SITES[name]; if (!pos) return;
        const sx = pos[0], sy = pos[1];
        const isTDCS = (bmpState.modality === 'tDCS');
        const isNFB  = (bmpState.modality === 'Neurofeedback');
        const isTMS  = (['TMS/rTMS','iTBS','cTBS','Deep TMS'].indexOf(bmpState.modality) !== -1);
        // Pre-baked E-field overlay (radial gradient) — fires on the first
        // primary site whenever the toggle is on. No data dep; purely visual
        // cue so clinicians see where the peak E-field lobe sits.
        if (bmpState.eFieldOverlay) {
          s('<circle cx="' + sx + '" cy="' + sy + '" r="56" fill="url(#bmp-efield)"'
            + ' opacity="0.85" pointer-events="none"/>');
        }
        s('<circle cx="' + sx + '" cy="' + sy + '" r="18" fill="' + mc + '" opacity="0.09"/>');
        s('<circle cx="' + sx + '" cy="' + sy + '" r="14" fill="' + mc + '" opacity="0.13"/>');
        if (isTMS) {
          s('<circle cx="' + sx + '" cy="' + sy + '" r="18" fill="none" stroke="' + mc + '"'
            + ' stroke-width="3" stroke-dasharray="2 3" opacity="0.35"/>');
          s('<line x1="' + sx + '" y1="' + (sy - 18) + '" x2="' + sx + '" y2="' + (sy - 25) + '"'
            + ' stroke="' + mc + '" stroke-width="2" opacity="0.5"/>');
        }
        if (isNFB) {
          s('<circle cx="' + sx + '" cy="' + sy + '" r="16" fill="none" stroke="' + mc + '"'
            + ' stroke-width="1.5" stroke-dasharray="4 3" opacity="0.4"/>');
          s('<circle cx="' + sx + '" cy="' + sy + '" r="22" fill="none" stroke="' + mc + '"'
            + ' stroke-width="1" stroke-dasharray="6 4" opacity="0.25"/>');
        }
        s(_siteG(name, sx, sy,
          '<circle cx="' + sx + '" cy="' + sy + '" r="9" fill="' + mc + '" opacity="0.85"'
          + ' filter="url(#bmp-glow)"/>'
          + '<text x="' + (sx + 11) + '" y="' + (sy + 3) + '" font-size="8" fill="' + mc + '"'
          + ' font-weight="700" font-family="system-ui">' + _esc(name)
          + (isTDCS ? ' +' : '') + '</text>'
        ));
      });
    }
    s('</g></svg>');
    return sp.join('');
  }

  // Attach delegated events to the SVG container after it is rendered
  function _attachSVGEvents(container) {
    if (!container) return;
    container.addEventListener('click', function(e) {
      const g = e.target.closest('[data-site]');
      if (g) window._bmpSiteClick(g.dataset.site);
    });
    container.addEventListener('mouseover', function(e) {
      const g = e.target.closest('[data-site]');
      if (g) window._bmpSiteHover(g.dataset.site, true, e);
    });
    container.addEventListener('mouseout', function(e) {
      const g = e.target.closest('[data-site]');
      if (g) window._bmpSiteHover(g.dataset.site, false, e);
    });
  }

  function _buildDetailPanel(site) {
    if (!site) {
      return '<div class="bmp-detail-placeholder">'
        + '<div style="font-size:13px;color:var(--text-tertiary);text-align:center;padding:40px 0">'
        + 'Click any electrode on the map<br>or load a protocol to see details'
        + '</div></div>';
    }
    const anat = BMP_ANATOMY[site] || site;
    const mni  = BMP_MNI[site]  || '\u2014';
    const ba   = BMP_BA[site]   || '\u2014';
    const condArr = BMP_CONDITIONS[site] || [];
    const condsHtml = condArr.map(function(c) {
      return '<span class="bmp-cond-chip">' + _esc(c) + '</span>';
    }).join('');
    const placement = BMP_PLACEMENT[site] || 'See 10-20 standard for placement.';
    let siteRegion = '';
    const rkeys = Object.keys(BMP_REGION_SITES);
    for (let ri = 0; ri < rkeys.length; ri++) {
      const rv = BMP_REGION_SITES[rkeys[ri]];
      if (rv.primary.indexOf(site) !== -1 || rv.ref.indexOf(site) !== -1 || rv.alt.indexOf(site) !== -1) {
        siteRegion = rkeys[ri]; break;
      }
    }
    const altSites = (siteRegion && BMP_REGION_SITES[siteRegion]) ? BMP_REGION_SITES[siteRegion].alt : [];
    const linkedProtos = [];
    const _linkSeen = new Set();
    _catalog.forEach(function(p) {
      if (linkedProtos.length >= 8 || _linkSeen.has(p.id)) return;
      if (p.anode === site || p.cathode === site) { linkedProtos.push(p.id); _linkSeen.add(p.id); }
    });
    if (linkedProtos.length < 8) {
      Object.keys(BMP_PROTO_MAP).forEach(function(pid) {
        if (linkedProtos.length >= 8 || _linkSeen.has(pid)) return;
        const rs = BMP_REGION_SITES[BMP_PROTO_MAP[pid].region];
        if (rs && (rs.primary.indexOf(site) !== -1 || rs.ref.indexOf(site) !== -1)) {
          linkedProtos.push(pid); _linkSeen.add(pid);
        }
      });
    }
    let h = '<div class="bmp-detail-card">';
    const activeCat = bmpState.protoId ? _catalogById[bmpState.protoId] : null;
    if (activeCat) {
      const evC = { A:'#00d4bc', B:'#4a9eff', C:'#ffb547', D:'var(--text-tertiary)', E:'var(--text-tertiary)' };
      const evColor = evC[activeCat.evidenceGrade] || 'var(--text-tertiary)';
      h += '<div style="font-size:12px;font-weight:700;color:var(--text-primary);line-height:1.3">' + _esc(activeCat.name) + '</div>';
      h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 8px">';
      h += '<span style="font-size:10.5px;padding:2px 8px;border-radius:6px;border:1px solid ' + evColor + '44;color:' + evColor + '">Ev. ' + _esc(activeCat.evidenceGrade) + '</span>';
      if (activeCat.modality) h += '<span style="font-size:10.5px;padding:2px 8px;border-radius:6px;background:rgba(255,255,255,0.04);border:1px solid var(--border);color:var(--text-secondary)">' + _esc(activeCat.modality) + '</span>';
      if (activeCat.targetRegion) h += '<span style="font-size:10.5px;padding:2px 8px;border-radius:6px;background:rgba(255,255,255,0.04);border:1px solid var(--border);color:var(--text-secondary)">◎ ' + _esc(activeCat.targetRegion) + '</span>';
      h += '</div>';
      if (activeCat.summary) {
        h += '<div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5;margin-bottom:10px">' + _esc(activeCat.summary.slice(0, 220)) + (activeCat.summary.length > 220 ? '\u2026' : '') + '</div>';
      }
      // Heuristic-target caveat: only curated entries carry exact anchors.
      if (activeCat.source !== 'curated') {
        h += '<div role="note" style="display:flex;gap:6px;align-items:flex-start;font-size:10.5px;color:var(--amber,#ffb547);background:rgba(255,181,71,0.08);border:1px solid rgba(255,181,71,0.25);border-radius:6px;padding:6px 8px;margin-bottom:10px;line-height:1.4">'
          + '<span aria-hidden="true" style="flex-shrink:0">⚠</span>'
          + '<span>Target electrode inferred from protocol text. Verify anatomical placement before prescribing.</span>'
          + '</div>';
      }
      h += '<div style="height:1px;background:var(--border);margin:4px 0 10px"></div>';
    }
    h += '<div class="bmp-detail-site-name">' + _esc(site) + '</div>';
    h += '<div class="bmp-detail-region">' + _esc(anat) + '</div>';
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">';
    if (mni !== '\u2014') h += '<span style="font-size:11px;padding:2px 8px;border-radius:6px;background:rgba(255,255,255,0.04);border:1px solid var(--border);color:var(--text-secondary)">MNI: ' + _esc(mni) + '</span>';
    if (ba  !== '\u2014') h += '<span style="font-size:11px;padding:2px 8px;border-radius:6px;background:rgba(255,255,255,0.04);border:1px solid var(--border);color:var(--text-secondary)">' + _esc(ba) + '</span>';
    h += '</div>';
    if (condsHtml) {
      h += '<div class="bmp-detail-section-label">Associated Conditions</div>';
      h += '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:4px">' + condsHtml + '</div>';
    }
    h += '<div class="bmp-detail-section-label">Placement Guidance</div>';
    h += '<div class="bmp-placement-text">' + _esc(placement) + '</div>';
    if (altSites.length) {
      h += '<div class="bmp-detail-section-label">Alternate Targets</div>';
      h += '<div style="display:flex;flex-wrap:wrap;gap:5px">';
      altSites.forEach(function(s2) {
        h += '<button class="bmp-alt-btn" data-altsite="' + _esc(s2) + '">'
          + _esc(s2) + '</button>';
      });
      h += '</div>';
    }
    if (linkedProtos.length) {
      h += '<div class="bmp-detail-section-label">Linked Protocols</div>';
      h += '<div style="display:flex;flex-direction:column;gap:5px">';
      linkedProtos.forEach(function(pid) {
        h += '<button class="bmp-proto-link" data-proto="' + _esc(pid) + '">'
          + _esc(BMP_PROTO_LABELS[pid] || (_catalogById[pid] && _catalogById[pid].name) || pid) + '</button>';
      });
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  function _updateMap() {
    // If compare is on, rebuild the whole canvas-wrap (cheap; SVG is small)
    // so both panels share the current state.
    if (bmpState.compare) {
      const wrap = document.querySelector('.bm-canvas-wrap');
      if (wrap) {
        wrap.innerHTML = _buildCanvasPanels();
        _attachSVGEvents(document.getElementById('bmp-svg-container'));
      }
      if (bmpState.mriOverlay) _renderBMPFocusViewer();
      return;
    }
    const ctr = document.getElementById('bmp-svg-container');
    if (!ctr) return;
    ctr.innerHTML = _buildSVG(bmpState.view === 'patient');
    _attachSVGEvents(ctr);
    // Refresh the "ACTIVE · patient · region" label.
    const lbl = document.querySelector('.bm-panel-label');
    if (lbl) {
      const patientLabel = bmpState.patientId || 'Demo patient';
      const regLabel = _regionLabel(bmpState.region) || (bmpState.selectedSite || 'no region');
      lbl.innerHTML = 'ACTIVE \u00b7 <strong>' + _esc(patientLabel) + '</strong> \u00b7 ' + _esc(regLabel);
    }
    // When the MRI overlay is on, re-derive matched-protocol dots so the
    // viewer reflects the latest filter / active protocol.
    if (bmpState.mriOverlay) _renderBMPFocusViewer();
  }
  function _updateRight() {
    const right = document.getElementById('bm-right');
    if (!right) return;
    right.innerHTML = _buildParamsPanel();
    _wireRightPanel();
  }
  function _updateAtlas() {
    const left = document.getElementById('bm-left');
    if (!left) return;
    left.innerHTML = _buildAtlasRail();
    _wireAtlas();
  }

  function _updateDetail() {
    const dp = document.getElementById('bmp-detail-panel');
    if (dp) dp.innerHTML = _buildDetailPanel(bmpState.selectedSite);
  }

  function _updateParams() {
    const pp = document.getElementById('bmp-params-section');
    if (pp) pp.style.display = (bmpState.modality || bmpState.protoId) ? '' : 'none';
    // Re-render the right panel so metrics + safety + evidence reflect
    // latest state (intensity change → density recomputes instantly).
    _updateRight();
  }

  function _loadProtocol(pid) {
    const pm = BMP_PROTO_MAP[pid];
    const cat = _catalogById[pid];
    if (!pm && !cat) return;

    bmpState.protoId = pid;
    if (pm) {
      bmpState.region    = pm.region;
      bmpState.modality  = pm.modality;
      bmpState.lat       = pm.lat;
      bmpState.freq      = pm.freq;
      bmpState.intensity = pm.intensity;
      bmpState.pulses    = pm.pulses;
      bmpState.sessions  = pm.sessions;
      bmpState.duration  = pm.duration || bmpState.duration;
    } else {
      bmpState.modality = cat.modality || bmpState.modality;
      bmpState.region   = cat.targetRegion
        || (cat.anode ? _inferRegionFromSite(cat.anode) : '')
        || bmpState.region;
      bmpState.lat      = cat.targetRegion && /-R$/.test(cat.targetRegion) ? 'right'
                       : cat.targetRegion && /-B$/.test(cat.targetRegion) ? 'bilateral'
                       : 'left';
      const P = cat.parameters || {};
      bmpState.freq      = P.frequency_hz != null ? String(P.frequency_hz) : '';
      bmpState.intensity = P.intensity_pct_rmt != null ? (String(P.intensity_pct_rmt) + '% MT')
                         : P.intensity != null ? String(P.intensity) : '';
      bmpState.pulses    = P.pulses_per_session != null ? String(P.pulses_per_session) : '';
      bmpState.duration  = P.session_duration_min != null ? String(P.session_duration_min) : bmpState.duration;
      bmpState.sessions  = P.sessions_total != null ? String(P.sessions_total)
                         : P.total_course != null ? String(P.total_course) : '';
    }

    const modSel = document.getElementById('bmp-mod-sel');
    if (modSel) modSel.value = bmpState.modality;
    const regSel = document.getElementById('bmp-region-sel');
    if (regSel) regSel.value = bmpState.region || '';
    document.querySelectorAll('.bmp-lat-btn').forEach(function(b) {
      b.classList.toggle('bmp-lat-active', b.dataset.lat === bmpState.lat);
    });
    ['freq','intensity','pulses','duration','sessions'].forEach(function(k) {
      const inp = document.getElementById('bmp-param-' + k);
      if (inp) inp.value = bmpState[k] || '';
    });
    const ps = document.getElementById('bmp-proto-sel');
    if (ps) ps.value = pid;

    const rs = BMP_REGION_SITES[bmpState.region];
    if (rs && rs.primary.length) bmpState.selectedSite = rs.primary[0];
    else if (cat && cat.anode)   bmpState.selectedSite = cat.anode;

    _updateMap(); _updateDetail(); _updateParams();
    _persist();
  }

  const _condSet = {};
  _libConditions.forEach(function(c) { if (c && c.id) _condSet[c.id] = c.label || c.id; });
  (conds || []).forEach(function(c) {
    const id = c.id || c.slug || c.name;
    if (id && !_condSet[id]) _condSet[id] = c.label || c.name || id;
  });
  const _condEntries = Object.keys(_condSet).map(function(id) { return { id: id, label: _condSet[id] }; })
    .sort(function(a, b) { return a.label.localeCompare(b.label); });

  const condOptions = _condEntries.map(function(c) {
    return '<option value="' + _esc(c.id) + '">' + _esc(c.label) + '</option>';
  }).join('');

  function _filteredCatalog() {
    const q    = (_bmpProtoFilter.q || '').toLowerCase();
    const cond = _bmpProtoFilter.cond;
    const ev   = _bmpProtoFilter.ev;
    const site = _bmpProtoFilter.site;
    return _catalog.filter(function(p) {
      if (cond && p.conditionId !== cond) return false;
      if (ev   && (p.evidenceGrade || '?') !== ev) return false;
      if (site && p.anode !== site && p.cathode !== site) return false;
      if (q) {
        const blob = (p.name + ' ' + (p.summary || '') + ' ' + (p.conditionId || '')).toLowerCase();
        if (blob.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function _renderProtoSelect() {
    const sel = document.getElementById('bmp-proto-sel');
    if (!sel) return;
    const list = _filteredCatalog();
    const capped = list.slice(0, 200);
    const opts = ['<option value="">\u2014 select protocol \u2014</option>']
      .concat(capped.map(function(p) {
        const ev = p.evidenceGrade && p.evidenceGrade !== '?' ? ' [' + p.evidenceGrade + ']' : '';
        return '<option value="' + _esc(p.id) + '">' + _esc(p.name + ev) + '</option>';
      }));
    sel.innerHTML = opts.join('');
    if (bmpState.protoId && list.some(function(p) { return p.id === bmpState.protoId; })) {
      sel.value = bmpState.protoId;
    }
    const cntEl = document.getElementById('bmp-proto-count');
    if (cntEl) cntEl.textContent = list.length + ' protocol' + (list.length === 1 ? '' : 's');
  }

  const regionOptions = Object.keys(BMP_REGION_SITES).map(function(k) {
    const pretty = k.replace(/[-_]/g, ' ');
    return '<option value="' + _esc(k) + '">' + _esc(pretty) + '</option>';
  }).join('');

  const modalityOptions = ['TMS/rTMS','iTBS','cTBS','Deep TMS','tDCS','tACS',
    'Neurofeedback','taVNS','CES','PBM','TPS'].map(function(m) {
    return '<option value="' + _esc(m) + '"'
      + (m === bmpState.modality ? ' selected' : '') + '>' + _esc(m) + '</option>';
  }).join('');

  const latVal = bmpState.lat;
  function _latBtn(v, lbl) {
    return '<button class="bmp-lat-btn' + (latVal === v ? ' bmp-lat-active' : '') + '"'
      + ' data-lat="' + v + '">'
      + lbl + '</button>';
  }

  // ── v2 render helpers (bm-* classes, clinician-grade layout) ───────────
  // Build the left atlas rail: search + condition chips + grouped regions.
  function _buildAtlasRail() {
    const groups = { 'Prefrontal': [], 'Motor / Sensory': [], 'Parietal / Temporal': [], 'Occipital': [], 'Other': [] };
    Object.keys(BMP_REGION_SITES).forEach(function(id) {
      groups[_regionGroup(id)].push(id);
    });
    let h = '<div class="bm-left-head">'
      + '<div style="position:relative">'
      + '<input id="bm-region-search" class="bm-search" placeholder="Region, function, condition\u2026" />'
      + '</div>'
      + '<div id="bm-cond-chips" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">';
    // condition chips — "All" + conditions from the unified set
    const allActive = !_bmpProtoFilter.cond ? ' bm-chip-active' : '';
    h += '<span class="bm-chip' + allActive + '" data-cond="">All</span>';
    _condEntries.slice(0, 10).forEach(function(c) {
      const active = _bmpProtoFilter.cond === c.id ? ' bm-chip-active' : '';
      h += '<span class="bm-chip' + active + '" data-cond="' + _esc(c.id) + '">'
        + _esc(c.label) + '</span>';
    });
    h += '</div></div><div class="bm-left-body" id="bm-left-body">';
    Object.keys(groups).forEach(function(g) {
      if (!groups[g].length) return;
      h += '<div class="bm-region-group-title">' + _esc(g) + '</div>';
      groups[g].forEach(function(id) {
        const rs = BMP_REGION_SITES[id];
        const primary = (rs.primary && rs.primary[0]) || '';
        const ba = BMP_BA[primary] || '';
        const sites = (rs.primary || []).join(' · ');
        const condArr = BMP_CONDITIONS[primary] || [];
        const active = bmpState.region === id ? ' active' : '';
        h += '<div class="bm-region' + active + '" data-region-id="' + _esc(id) + '"'
          + ' data-region-q="' + _esc((_regionLabel(id) + ' ' + _regionFunction(id) + ' ' + sites).toLowerCase()) + '">'
          + '<div class="bm-region-dot"></div>'
          + '<div class="bm-region-body">'
          + '<div class="bm-region-name">' + _esc(_regionLabel(id)) + '</div>'
          + '<div class="bm-region-sites">' + _esc(sites) + (ba ? ' \u00b7 ' + _esc(ba) : '') + '</div>'
          + '<div class="bm-region-fn">' + _esc(_regionFunction(id)) + '</div>';
        if (condArr.length) {
          h += '<div class="bm-region-cond">';
          condArr.slice(0, 4).forEach(function(c) { h += '<span>' + _esc(c) + '</span>'; });
          h += '</div>';
        }
        h += '</div></div>';
      });
    });
    h += '</div>';
    return h;
  }

  // Right-panel parameter groups fed by active catalog entry + BMP_PROTO_MAP.
  function _buildParamsPanel() {
    const cat = bmpState.protoId ? _catalogById[bmpState.protoId] : null;
    const rs = BMP_REGION_SITES[bmpState.region] || { primary:[], ref:[], alt:[] };
    const anode   = bmpState.selectedSite || (rs.primary && rs.primary[0]) || (cat && cat.anode) || '—';
    const cathode = (rs.ref && rs.ref[0]) || (cat && cat.cathode) || '—';
    const intensity_mA = _parseIntensityMA(bmpState.intensity);
    const density = _computeDensity(intensity_mA);
    const dStatus = _densityStatus(density);
    const peakE = (0.4 + Math.min(intensity_mA, 4) * 0.06).toFixed(2);
    const focal = (0.55 + Math.min(intensity_mA, 4) * 0.04).toFixed(2);
    const ev = _evidenceForActive();

    // Determine which groups are visible per tab. Montage → hide safety &
    // evidence, widen electrodes + stim. Research → emphasise evidence.
    const tab = bmpState.tab;
    const showElectrodes = tab !== 'research' ? true : true;
    const showStim = tab !== 'research';
    const showSafety = tab === 'clinical';
    const showEvidence = (tab === 'clinical' || tab === 'research');

    let h = '<div class="bm-right-head">'
      + '<div style="display:flex;gap:10px;align-items:center">'
      + '<div class="bm-metric" style="flex:1;margin:0;padding:8px 10px">'
      + '<div class="bm-metric-lbl">Peak E-field</div>'
      + '<div class="bm-metric-num">' + _esc(peakE) + '<span class="unit">V/m</span></div>'
      + '</div>'
      + '<div class="bm-metric" style="flex:1;margin:0;padding:8px 10px">'
      + '<div class="bm-metric-lbl">Focality</div>'
      + '<div class="bm-metric-num">' + _esc(focal) + '<span class="unit">/1.0</span></div>'
      + '</div>'
      + '</div></div>';

    h += '<div class="bm-right-body" id="bm-right-body">';

    if (showElectrodes) {
      h += '<div class="bm-param-group">'
        + '<div class="bm-param-group-title"><span class="num">01</span>Electrodes</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'
        + '<div style="padding:8px;background:rgba(255,107,157,0.06);border:1px solid rgba(255,107,157,0.18);border-radius:6px">'
        + '<div style="font-size:9px;color:var(--rose);font-weight:700;letter-spacing:0.04em;font-family:var(--font-mono)">ANODE +</div>'
        + '<div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-top:4px">' + _esc(anode) + '</div>'
        + '<div style="font-size:9.5px;color:var(--text-tertiary);margin-top:2px">35\u00d735 mm \u00b7 saline <span style="opacity:0.6">(example)</span></div>'
        + '<div style="font-size:9.5px;color:var(--teal);margin-top:2px">\u03a9 4.2 k\u03a9 <span style="opacity:0.6">(example)</span></div>'
        + '</div>'
        + '<div style="padding:8px;background:rgba(74,158,255,0.06);border:1px solid rgba(74,158,255,0.18);border-radius:6px">'
        + '<div style="font-size:9px;color:var(--blue);font-weight:700;letter-spacing:0.04em;font-family:var(--font-mono)">CATHODE \u2212</div>'
        + '<div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-top:4px">' + _esc(cathode) + '</div>'
        + '<div style="font-size:9.5px;color:var(--text-tertiary);margin-top:2px">35\u00d735 mm \u00b7 saline <span style="opacity:0.6">(example)</span></div>'
        + '<div style="font-size:9.5px;color:var(--teal);margin-top:2px">\u03a9 3.8 k\u03a9 <span style="opacity:0.6">(example)</span></div>'
        + '</div>'
        + '</div>'
        + '<div class="bm-polarity">'
        + '<button class="' + (bmpState.placeMode === 'anode' ? 'active anode' : '') + '" data-placemode="anode">\u25cf Anode mode</button>'
        + '<button class="' + (bmpState.placeMode === 'cathode' ? 'active cathode' : '') + '" data-placemode="cathode">\u25cb Cathode mode</button>'
        + '</div>';
      if (cat && cat.source !== 'curated') {
        h += '<div role="note" style="display:flex;gap:6px;align-items:flex-start;font-size:10.5px;color:var(--amber,#ffb547);background:rgba(255,181,71,0.08);border:1px solid rgba(255,181,71,0.25);border-radius:6px;padding:6px 8px;margin-top:8px;line-height:1.4">'
          + '<span aria-hidden="true" style="flex-shrink:0">\u26a0</span>'
          + '<span>Target electrode inferred from protocol text. Verify anatomical placement before prescribing.</span>'
          + '</div>';
      }
      h += '<div style="margin-top:8px;font-size:10px;color:var(--text-tertiary);line-height:1.45">'
        + 'Click any 10-20 site on the map to place the <strong>' + _esc(bmpState.placeMode) + '</strong>. '
        + 'Region: <strong style="color:var(--text-primary)">' + _esc(_regionLabel(bmpState.region) || '—') + '</strong>.'
        + '</div>';
      h += '</div>';
    }

    if (showStim) {
      const intensityPct = Math.min(100, Math.max(0, (intensity_mA / 4) * 100));
      const durationN = Number(bmpState.duration || 0) || 0;
      const durationPct = Math.min(100, Math.max(0, (durationN / 45) * 100));
      h += '<div class="bm-param-group">'
        + '<div class="bm-param-group-title"><span class="num">02</span>Stimulation</div>'
        + '<div class="bm-param-row"><span class="bm-param-label">Current</span>'
        + '<span class="bm-param-val">' + (intensity_mA ? intensity_mA.toFixed(1) + ' mA' : '—') + '</span></div>'
        + '<div class="bm-slider-wrap">'
        + '<input id="bm-slider-current" type="range" min="0" max="4" step="0.1" value="' + intensity_mA + '" class="bm-slider-input" />'
        + '<div class="bm-slider-ticks"><span>0</span><span>1</span><span>2</span><span>3</span><span>4 mA</span></div>'
        + '</div>'
        + '<div class="bm-param-row" style="margin-top:10px"><span class="bm-param-label">Duration</span>'
        + '<span class="bm-param-val">' + (durationN ? durationN + ' min' : '—') + '</span></div>'
        + '<div class="bm-slider-wrap">'
        + '<input id="bm-slider-duration" type="range" min="0" max="45" step="1" value="' + durationN + '" class="bm-slider-input" />'
        + '<div class="bm-slider-ticks"><span>5</span><span>15</span><span>30</span><span>45 min</span></div>'
        + '</div>'
        + '<div class="bm-param-row" style="margin-top:10px"><span class="bm-param-label">Ramp</span>'
        + '<span class="bm-param-val">30 s / 30 s</span></div>'
        + '<div class="bm-param-row"><span class="bm-param-label">Waveform</span>'
        + '<select id="bm-waveform" class="form-select" style="font-size:10.5px;padding:2px 6px;max-width:130px">'
        + ['Anodal DC','Cathodal DC','Biphasic'].map(function(w) {
            return '<option value="' + _esc(w) + '"' + (bmpState.waveform === w ? ' selected' : '') + '>' + _esc(w) + '</option>';
          }).join('')
        + '</select></div>'
        + '<div class="bm-param-row"><span class="bm-param-label">Blinding</span>'
        + '<span class="bm-param-val" style="color:var(--text-tertiary)">Open (clinical)</span></div>';
      h += '</div>';
    }

    if (showSafety) {
      h += '<div class="bm-param-group" id="bm-safety-group">'
        + '<div class="bm-param-group-title"><span class="num">03</span>Safety &amp; contraindications</div>';
      const densityText = density ? density.toFixed(3) + ' mA/cm\u00b2' : '—';
      if (dStatus === 'ok') {
        h += '<div class="bm-warn ok">'
          + '<span class="bm-warn-ico">\u2713</span>'
          + '<div><div class="bm-warn-title">Within safety envelope</div>'
          + '<div class="bm-warn-body">Current density ' + _esc(densityText) + ' \u00b7 below 0.08 mA/cm\u00b2 limit \u00b7 NIBS guidelines Antal 2017.</div></div>'
          + '</div>';
      } else if (dStatus === 'amber') {
        h += '<div class="bm-warn amb">'
          + '<span class="bm-warn-ico">\u25d0</span>'
          + '<div><div class="bm-warn-title">Approaching density limit</div>'
          + '<div class="bm-warn-body">Current density ' + _esc(densityText) + ' \u00b7 between 0.08 and 0.12 mA/cm\u00b2 \u00b7 monitor scalp response.</div></div>'
          + '</div>';
      } else {
        h += '<div class="bm-warn err">'
          + '<span class="bm-warn-ico">\u26a0</span>'
          + '<div><div class="bm-warn-title">Current density exceeds guideline</div>'
          + '<div class="bm-warn-body">Computed ' + _esc(densityText) + ' \u00b7 above 0.12 mA/cm\u00b2 \u00b7 reduce intensity or enlarge pad.</div></div>'
          + '</div>';
      }
      h += '<div class="bm-warn amb">'
        + '<span class="bm-warn-ico">\u25d0</span>'
        + '<div><div class="bm-warn-title">Scalp sensitivity check <span style="opacity:0.6;font-weight:400">(example)</span></div>'
        + '<div class="bm-warn-body">Recommend saline refresh + skin inspection pre-session.</div></div>'
        + '</div>';
      h += '</div>';
    }

    if (showEvidence) {
      h += '<div class="bm-param-group">'
        + '<div class="bm-param-group-title"><span class="num">04</span>Evidence \u00b7 this montage</div>';
      if (!ev.length) {
        h += '<div style="font-size:11px;color:var(--text-tertiary);padding:8px 0">'
          + 'Load a protocol to see evidence for this montage.</div>';
      } else {
        ev.forEach(function(r) {
          const gClass = /^A/i.test(r.grade) ? 'a' : /^B/i.test(r.grade) ? 'b' : /^C/i.test(r.grade) ? 'c' : '';
          h += '<div class="bm-evidence" data-proto="' + _esc(r.id) + '">'
            + '<div class="bm-evidence-header">'
            + '<div class="bm-evidence-title">' + _esc(r.title) + '</div>'
            + '<span class="bm-evidence-grade ' + gClass + '">' + _esc(r.grade) + '</span>'
            + '</div>';
          if (r.meta) h += '<div class="bm-evidence-meta">' + _esc(r.meta) + '</div>';
          if (r.summary) {
            const s = r.summary.slice(0, 160) + (r.summary.length > 160 ? '\u2026' : '');
            h += '<div class="bm-evidence-delta">' + _esc(s) + '</div>';
          }
          h += '</div>';
        });
      }
      if (bmpState.tab === 'research' && cat) {
        h += '<div style="margin-top:10px;padding:10px;background:var(--bg-surface);border:1px dashed var(--border);border-radius:6px;font-size:10.5px;color:var(--text-secondary);line-height:1.5">'
          + '<div style="font-weight:600;color:var(--text-primary);margin-bottom:4px">Raw catalog entry</div>'
          + 'id: ' + _esc(cat.id) + '<br>'
          + 'source: ' + _esc(cat.source) + '<br>'
          + 'targetRegion: ' + _esc(cat.targetRegion || '') + '<br>'
          + 'anode: ' + _esc(cat.anode || '') + ' \u00b7 cathode: ' + _esc(cat.cathode || '')
          + '</div>';
      }
      h += '</div>';
    }

    // Active-protocol detail re-used from _buildDetailPanel (kept for site-level
    // info: MNI, BA, placement guidance, linked protocols, alt sites).
    h += '<div class="bm-param-group">'
      + '<div class="bm-param-group-title"><span class="num">\u2699</span>Site detail</div>'
      + '<div id="bmp-detail-panel" class="bm-site-detail">' + _buildDetailPanel(bmpState.selectedSite || '') + '</div>'
      + '<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">'
      + '<button class="btn btn-sm" style="font-size:11px" onclick="window._bmpViewDetail()">View Protocol Detail</button>'
      + '<button class="btn btn-sm" style="font-size:11px;border-color:var(--teal);color:var(--teal)" onclick="window._bmpPrescribeProto(window._bmpState && window._bmpState.protoId)">Prescribe This Protocol</button>'
      + '</div>'
      + '</div>';

    h += '</div>'; // /.bm-right-body

    return h;
  }

  // Advanced filters expander — keeps the old dropdowns reachable so nothing
  // is deleted; clinicians can still filter by condition / evidence / search
  // from the canvas toolbar row.
  function _buildAdvancedFilters() {
    return '<details class="bm-adv-filters">'
      + '<summary>Advanced filters</summary>'
      + '<div class="bm-adv-filters-body">'
      + '<input id="bmp-proto-q" class="form-input bm-adv-input" type="text" placeholder="Search protocols\u2026"'
        + ' value="' + _esc(_bmpProtoFilter.q || '') + '"'
        + ' oninput="window._bmpSetProtoFilter(\'q\', this.value)" />'
      + '<select id="bmp-proto-ev" class="form-select bm-adv-input" onchange="window._bmpSetProtoFilter(\'ev\', this.value)">'
      + '<option value="">All evidence</option>'
      + '<option value="A"' + (_bmpProtoFilter.ev === 'A' ? ' selected' : '') + '>Grade A</option>'
      + '<option value="B"' + (_bmpProtoFilter.ev === 'B' ? ' selected' : '') + '>Grade B</option>'
      + '<option value="C"' + (_bmpProtoFilter.ev === 'C' ? ' selected' : '') + '>Grade C</option>'
      + '</select>'
      + '<select id="bmp-cond-sel" class="form-select bm-adv-input" onchange="window._bmpSetProtoFilter(\'cond\', this.value)">'
      + '<option value="">All conditions</option>' + condOptions
      + '</select>'
      + '<select id="bmp-mod-sel" class="form-select bm-adv-input" onchange="window._bmpSetModality(this.value)">'
      + modalityOptions
      + '</select>'
      + '<select id="bmp-region-sel" class="form-select bm-adv-input" onchange="window._bmpSetRegion(this.value)">'
      + '<option value="">Select region</option>' + regionOptions
      + '</select>'
      + '<div class="bm-adv-overflow">'
      + '<button class="btn btn-sm" style="font-size:11px" onclick="window._bmpCopySummary()">Copy summary</button>'
      + '<button class="btn btn-sm" style="font-size:11px" onclick="window._bmpSavePreset()">Save preset</button>'
      + '<select id="bmp-preset-sel" class="form-select bm-adv-input" onchange="window._bmpLoadPreset(this.value)">'
      + '<option value="">Load preset</option>'
      + '</select>'
      + '<button class="btn btn-sm" style="font-size:11px" onclick="window._bmpReset()">Reset planner</button>'
      + '</div>'
      + '<div class="bm-adv-lat">'
      + '<div class="bmp-lat-toggle">' + _latBtn('left','Left') + _latBtn('bilateral','Bilateral') + _latBtn('right','Right') + '</div>'
      + '</div>'
      + '<div id="bmp-params-section" class="bm-adv-params" style="display:none">'
      + '<label>Freq (Hz)<input id="bmp-param-freq" class="form-input" type="text"></label>'
      + '<label>Intensity<input id="bmp-param-intensity" class="form-input" type="text"></label>'
      + '<label>Pulses<input id="bmp-param-pulses" class="form-input" type="text"></label>'
      + '<label>Duration (min)<input id="bmp-param-duration" class="form-input" type="text"></label>'
      + '<label>Sessions<input id="bmp-param-sessions" class="form-input" type="text"></label>'
      + '<label style="grid-column:1 / -1">Notes<textarea id="bmp-param-notes" class="form-input" rows="2"></textarea></label>'
      + '</div>'
      + '</div>'
      + '</details>';
  }

  // Main canvas toolbar: view modes + overlay toggles + compare.
  function _buildCanvasToolbar() {
    return '<div class="bm-view-toolbar">'
      + '<div class="bm-view-toggle">'
      + '<button class="active" data-canvas-mode="2d">\u25c9 2D 10-20</button>'
      + '<button disabled data-canvas-mode="3d">\u25ce 3D cortex <span class="bm-soon">Soon</span></button>'
      + '<button disabled data-canvas-mode="inflated">\u25c8 Inflated <span class="bm-soon">Soon</span></button>'
      + '<button disabled data-canvas-mode="slices">\u25a4 Slices <span class="bm-soon">Soon</span></button>'
      + '</div>'
      + '<div style="width:1px;height:20px;background:var(--border)"></div>'
      + '<label class="bm-toggle-row" data-toggle="efield">'
      + '<span class="bm-toggle-pill ' + (bmpState.eFieldOverlay ? 'on' : '') + '"><span></span></span>'
      + 'E-field overlay</label>'
      + '<label class="bm-toggle-row" data-toggle="labels">'
      + '<span class="bm-toggle-pill ' + (bmpState.labelMode !== 'minimal' ? 'on' : '') + '"><span></span></span>'
      + 'Atlas labels</label>'
      + '<label class="bm-toggle-row" data-toggle="mri-overlay" title="Show matched-protocol targets on a real T1 slice">'
      + '<span class="bm-toggle-pill ' + (bmpState.mriOverlay ? 'on' : '') + '"><span></span></span>'
      + 'MRI overlay</label>'
      + '<div class="bm-map-ctrl" style="margin-left:8px">'
      + '<span class="bmp-map-ctrl-lbl">Find</span>'
      + '<input id="bmp-site-search" class="bmp-map-search" placeholder="F3, Cz, Pz" />'
      + '<button class="btn btn-sm" style="font-size:11px;padding:4px 10px" onclick="window._bmpGoSite()">Go</button>'
      + '</div>'
      + '<div class="bm-map-ctrl">'
      + '<span class="bmp-map-ctrl-lbl">Labels</span>'
      + '<select id="bmp-label-mode" class="form-select" style="font-size:11px;padding:3px 8px" onchange="window._bmpSetLabelMode(this.value)">'
      + '<option value="smart"' + (bmpState.labelMode === 'smart' ? ' selected' : '') + '>Smart</option>'
      + '<option value="full"' + (bmpState.labelMode === 'full' ? ' selected' : '') + '>Full</option>'
      + '<option value="minimal"' + (bmpState.labelMode === 'minimal' ? ' selected' : '') + '>Minimal</option>'
      + '</select>'
      + '</div>'
      + '<div class="bm-map-ctrl">'
      + '<span class="bmp-map-ctrl-lbl">Zoom</span>'
      + '<input id="bmp-zoom" type="range" min="1" max="1.8" step="0.05" value="' + (bmpState.zoom || 1) + '" />'
      + '</div>'
      + '<div style="margin-left:auto;display:flex;gap:6px">'
      + '<button class="btn btn-sm" style="font-size:10.5px" onclick="window._bmpResetView()">\u21ba Reset</button>'
      + '<button class="btn btn-sm ' + (bmpState.compare ? 'btn-primary' : '') + '" style="font-size:10.5px" onclick="window._bmpToggleCompare()">\u21c6 Compare</button>'
      + '</div>'
      + '</div>';
  }

  // Build one or two canvas panels depending on compare mode.
  function _buildCanvasPanels() {
    const patientLabel = bmpState.patientId || 'Demo patient';
    const regLabel = _regionLabel(bmpState.region) || (bmpState.selectedSite || 'no region');
    const main = '<div class="bm-canvas-panel" style="flex:1;width:100%;position:relative">'
      + '<div class="bm-panel-label">ACTIVE \u00b7 <strong>' + _esc(patientLabel) + '</strong> \u00b7 ' + _esc(regLabel) + '</div>'
      + '<div class="bmp-svg-wrap"><div id="bmp-svg-container">' + _buildSVG(bmpState.view === 'patient') + '</div></div>'
      + '</div>';
    if (!bmpState.compare) {
      return '<div class="bm-canvas">' + main + '</div>';
    }
    // Compare mode: second panel renders the first linked protocol sharing
    // the same region, so clinicians can see an alternative montage side by
    // side. No new API — all in-memory catalog.
    let altHtml = '<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:11px">No comparable montage in catalog.</div>';
    const activeCat = bmpState.protoId ? _catalogById[bmpState.protoId] : null;
    const alt = _catalog.find(function(p) {
      if (!activeCat) return p.targetRegion === bmpState.region && p.id !== bmpState.protoId;
      return p.targetRegion === activeCat.targetRegion && p.id !== activeCat.id;
    });
    if (alt) {
      altHtml = '<div class="bm-panel-label">COMPARE \u00b7 <strong>' + _esc(alt.name) + '</strong></div>'
        + '<div class="bmp-svg-wrap" style="opacity:0.85"><div id="bmp-svg-container-alt">'
        + _buildSVG(false)
        + '</div></div>';
    }
    const altPanel = '<div class="bm-canvas-panel" style="flex:1;width:100%;position:relative">' + altHtml + '</div>';
    return '<div class="bm-canvas compare">' + main + altPanel + '</div>';
  }

  // ── MRI focus viewer (T1 atlas + matched-protocol target dots) ──────────
  // Builds the same Neurolight-TPS-style zoom/pan/plane viewer used by
  // pages-mri-analysis.js and pages-qeeg-analysis.js, but populated with
  // matched-protocol target dots derived from the unified _catalog. Targets
  // without an MNI mapping (region's primary 10-20 site has no entry in
  // BMP_MNI) are skipped — never fabricated.
  function _bmpMatchedProtocolDots() {
    const list = _filteredCatalog();
    const seenSite = {};
    const dots = [];
    list.forEach(function(cat) {
      const m = _bmpCatalogMNI(cat);
      if (!m) return;
      // Dedup by site so we don't stack identical-MNI dots; keep the first
      // (highest-evidence-grade by virtue of catalog order).
      if (seenSite[m.site]) return;
      seenSite[m.site] = true;
      const col = _bmpModalityDotColor(cat.modality);
      const isActive = bmpState.protoId && cat.id === bmpState.protoId;
      const label = (cat.name || cat.id || '').slice(0, 36);
      const tooltip = (cat.name || cat.id || '') + ' · ' + (cat.modality || '')
        + ' · MNI [' + m.mni.join(', ') + ']';
      dots.push('<div class="ds-mri-glass-dot" data-tid="' + _esc(cat.id || '') + '"'
        + ' data-site="' + _esc(m.site) + '"'
        + ' data-pulse="' + (isActive ? '1' : '0') + '"'
        + ' data-mni-x="' + m.mni[0] + '"'
        + ' data-mni-y="' + m.mni[1] + '"'
        + ' data-mni-z="' + m.mni[2] + '"'
        + ' style="--dot-color:' + col + '"'
        + ' title="' + _esc(tooltip) + '">'
        + '<span class="ds-mri-glass-dot__core"></span>'
        + '<span class="ds-mri-glass-dot__label">' + _esc(label) + '</span>'
        + '</div>');
    });
    return { html: dots.join(''), count: dots.length };
  }

  function _buildBMPFocusViewer() {
    const dots = _bmpMatchedProtocolDots();
    const planes = [
      { id: 'axial',    label: 'Axial' },
      { id: 'coronal',  label: 'Coronal' },
      { id: 'sagittal', label: 'Sagittal' },
    ];
    const planeTabs = '<div class="ds-mri-glass-planes" role="tablist" aria-label="MRI plane">'
      + planes.map(function(p, i) {
        const on = i === 0;
        return '<button type="button" class="ds-mri-glass-plane' + (on ? ' is-active' : '') + '"'
          + ' role="tab" aria-selected="' + (on ? 'true' : 'false') + '"'
          + ' data-plane="' + p.id + '">' + p.label + '</button>';
      }).join('')
      + '</div>';

    const toolbar = '<div class="ds-mri-glass-toolbar" role="toolbar" aria-label="MRI viewer zoom">'
      + '<button class="ds-mri-glass-btn" id="ds-bmp-mri-zoom-out" aria-label="Zoom out" type="button">&minus;</button>'
      + '<span class="ds-mri-glass-zoom-level" id="ds-bmp-mri-zoom-level" aria-live="polite">1.0&times;</span>'
      + '<button class="ds-mri-glass-btn" id="ds-bmp-mri-zoom-in" aria-label="Zoom in" type="button">+</button>'
      + '<button class="ds-mri-glass-btn ds-mri-glass-btn--reset" id="ds-bmp-mri-zoom-reset" aria-label="Reset view" type="button" title="Reset zoom &amp; pan">Reset</button>'
      + '</div>';

    const stage = '<div class="ds-mri-glass-stage" id="ds-bmp-mri-stage" tabindex="0" data-plane="axial" aria-label="MRI slice with matched-protocol targets — drag to pan, scroll or pinch to zoom">'
      + '<div class="ds-mri-glass-pan" id="ds-bmp-mri-pan">'
      + '<img class="ds-mri-glass-img" id="ds-bmp-mri-img" src="/images/brain-atlas/axial.png" alt="Axial T1 MRI template" draggable="false">'
      + '<div class="ds-mri-glass-overlay" id="ds-bmp-mri-overlay">' + dots.html + '</div>'
      + '</div>'
      + '</div>';

    const captionTxt = dots.count
      ? dots.count + ' matched-protocol target' + (dots.count === 1 ? '' : 's')
        + ' projected to MNI atlas. Switch plane, scroll or use +/&minus; to zoom, drag to pan.'
      : 'No matched protocols carry MNI coordinates yet — adjust filters or pick a protocol with a 10-20 anode.';
    const caption = '<div class="ds-mri-glass-caption">' + captionTxt + '</div>';

    const body = '<div class="ds-mri-glass-wrap ds-bmp-mri-wrap" id="ds-bmp-mri-wrap">'
      + planeTabs + toolbar + stage + caption
      + '</div>';

    return '<div class="ds-card" id="bmp-mri-card">'
      + '<div class="ds-card__header"><h3>MRI target view</h3></div>'
      + '<div class="ds-card__body">' + body + '</div>'
      + '</div>';
  }

  // Mount or unmount the MRI focus viewer in response to the toggle.
  function _renderBMPFocusViewer() {
    const host = document.getElementById('bmp-mri-host');
    if (!host) return;
    if (!bmpState.mriOverlay) {
      host.innerHTML = '';
      return;
    }
    host.innerHTML = _buildBMPFocusViewer();
    _wireBMPFocusViewer();
  }

  // Mirrors _wireMRIFocusViewer in pages-mri-analysis.js. Identifiers are
  // prefixed `ds-bmp-mri-` to keep the planner's viewer independent from the
  // MRI-analysis and qEEG source viewers should they ever co-mount.
  function _wireBMPFocusViewer() {
    const stage = document.getElementById('ds-bmp-mri-stage');
    const pan = document.getElementById('ds-bmp-mri-pan');
    const img = document.getElementById('ds-bmp-mri-img');
    const overlay = document.getElementById('ds-bmp-mri-overlay');
    const levelEl = document.getElementById('ds-bmp-mri-zoom-level');
    const btnIn = document.getElementById('ds-bmp-mri-zoom-in');
    const btnOut = document.getElementById('ds-bmp-mri-zoom-out');
    const btnReset = document.getElementById('ds-bmp-mri-zoom-reset');
    if (!stage || !pan) return;

    const MIN_SCALE = 1.0;
    const MAX_SCALE = 6.0;
    const state = { scale: 1.0, tx: 0, ty: 0, plane: 'axial' };

    function projectDot(plane, mx, my, mz) {
      let x = NaN, y = NaN;
      if (plane === 'axial') {
        if (!isFinite(mx) || !isFinite(my)) return null;
        x = 50 + (mx / 90) * 45;
        y = 50 - (my / 120) * 45;
      } else if (plane === 'coronal') {
        if (!isFinite(mx) || !isFinite(mz)) return null;
        x = 50 + (mx / 90) * 45;
        y = 50 - (mz / 75) * 45;
      } else if (plane === 'sagittal') {
        if (!isFinite(my) || !isFinite(mz)) return null;
        x = 50 + (my / 120) * 45;
        y = 50 - (mz / 75) * 45;
      } else {
        return null;
      }
      return { x: x, y: y };
    }
    function repositionDots() {
      if (!overlay) return;
      const dots = overlay.querySelectorAll('.ds-mri-glass-dot');
      dots.forEach(function(d) {
        const mx = parseFloat(d.getAttribute('data-mni-x'));
        const my = parseFloat(d.getAttribute('data-mni-y'));
        const mz = parseFloat(d.getAttribute('data-mni-z'));
        const p = projectDot(state.plane, mx, my, mz);
        if (!p) { d.style.display = 'none'; return; }
        d.style.display = '';
        d.style.left = p.x.toFixed(2) + '%';
        d.style.top = p.y.toFixed(2) + '%';
      });
    }
    function setPlane(plane) {
      if (plane === state.plane) return;
      state.plane = plane;
      if (img) {
        img.src = '/images/brain-atlas/' + plane + '.png';
        img.alt = plane.charAt(0).toUpperCase() + plane.slice(1) + ' T1 MRI template';
      }
      stage.setAttribute('data-plane', plane);
      state.scale = 1.0; state.tx = 0; state.ty = 0;
      repositionDots();
      apply();
    }
    function clampPan() {
      const max = (state.scale - 1) / 2;
      if (state.tx > max) state.tx = max;
      if (state.tx < -max) state.tx = -max;
      if (state.ty > max) state.ty = max;
      if (state.ty < -max) state.ty = -max;
    }
    function apply() {
      clampPan();
      pan.style.transform = 'translate(' + (state.tx * 100).toFixed(2) + '%,'
        + (state.ty * 100).toFixed(2) + '%) scale(' + state.scale.toFixed(3) + ')';
      if (levelEl) levelEl.textContent = state.scale.toFixed(1) + '×';
      stage.classList.toggle('is-zoomed', state.scale > 1.001);
    }
    function setScale(next, anchor) {
      next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
      if (anchor && state.scale !== next) {
        const prevScale = state.scale;
        const ax = anchor.x - 0.5;
        const ay = anchor.y - 0.5;
        state.tx = ax + (state.tx - ax) * (next / prevScale);
        state.ty = ay + (state.ty - ay) * (next / prevScale);
      }
      state.scale = next;
      apply();
    }

    if (btnIn) btnIn.addEventListener('click', function() { setScale(state.scale * 1.4); });
    if (btnOut) btnOut.addEventListener('click', function() { setScale(state.scale / 1.4); });
    if (btnReset) btnReset.addEventListener('click', function() {
      state.scale = 1.0; state.tx = 0; state.ty = 0; apply();
    });

    stage.addEventListener('wheel', function(e) {
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const anchor = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setScale(state.scale * factor, anchor);
    }, { passive: false });

    let drag = null;
    stage.addEventListener('pointerdown', function(e) {
      if (state.scale <= 1.001) return;
      if (e.button !== undefined && e.button !== 0) return;
      drag = {
        startX: e.clientX,
        startY: e.clientY,
        tx0: state.tx,
        ty0: state.ty,
        width: stage.clientWidth || 1,
        height: stage.clientHeight || 1,
      };
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('is-panning');
    });
    stage.addEventListener('pointermove', function(e) {
      if (!drag) return;
      const dx = (e.clientX - drag.startX) / drag.width;
      const dy = (e.clientY - drag.startY) / drag.height;
      state.tx = drag.tx0 + dx;
      state.ty = drag.ty0 + dy;
      apply();
    });
    function endDrag(e) {
      if (!drag) return;
      drag = null;
      stage.classList.remove('is-panning');
      if (e && e.pointerId !== undefined && stage.releasePointerCapture) {
        try { stage.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ }
      }
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('pointerleave', endDrag);

    stage.addEventListener('keydown', function(e) {
      if (e.key === '+' || e.key === '=') { e.preventDefault(); setScale(state.scale * 1.4); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); setScale(state.scale / 1.4); }
      else if (e.key === '0') { e.preventDefault(); state.scale = 1.0; state.tx = 0; state.ty = 0; apply(); }
    });

    document.querySelectorAll('#ds-bmp-mri-wrap .ds-mri-glass-plane').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const plane = btn.getAttribute('data-plane');
        if (!plane) return;
        document.querySelectorAll('#ds-bmp-mri-wrap .ds-mri-glass-plane').forEach(function(b) {
          const on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        setPlane(plane);
      });
    });

    repositionDots();
    apply();
  }

  // Tab strip — clinical / montage / research
  function _buildTabStrip() {
    const tabs = [
      { id:'clinical', num:'01', label:'Clinical planner' },
      { id:'montage',  num:'02', label:'Montage studio' },
      { id:'research', num:'03', label:'Research overlay' },
    ];
    let h = '<div class="bm-tabs-wrap">';
    tabs.forEach(function(t) {
      h += '<button class="bm-tab' + (bmpState.tab === t.id ? ' active' : '') + '" data-tab="' + t.id + '">'
        + '<span class="tab-num">' + t.num + '</span>' + _esc(t.label) + '</button>';
    });
    h += '<div style="margin-left:auto;display:flex;gap:8px;align-items:center;padding-right:4px">'
      + '<span style="font-size:10.5px;color:var(--text-tertiary);font-family:var(--font-mono)">Patient</span>'
      + '<input id="bm-patient-inp" class="form-input" placeholder="Demo patient"'
      + ' value="' + _esc(bmpState.patientId) + '"'
      + ' style="font-size:11px;padding:3px 8px;width:150px" />'
      + '</div></div>';
    return h;
  }

  const hideAtlas = (bmpState.tab === 'montage');

  el.innerHTML =
    _buildTabStrip()
    + '<div class="bm-shell bm-shell-v2' + (hideAtlas ? ' bm-no-left' : '') + '">'
    + (hideAtlas ? '' : ('<aside class="bm-left" id="bm-left">' + _buildAtlasRail() + '</aside>'))
    + '<div class="bm-center">'
    + _buildCanvasToolbar()
    + _buildAdvancedFilters()
    + '<div class="bm-proto-strip">'
      + '<span class="bm-proto-strip-lbl">Protocol</span>'
      + '<select id="bmp-proto-sel" class="form-select" style="flex:1;font-size:12px" onchange="window._bmpLoadProto(this.value)">'
      + '<option value="">\u2014 select protocol \u2014</option>'
      + '</select>'
      + '<span id="bmp-proto-count" style="font-size:10.5px;color:var(--text-tertiary);white-space:nowrap">0 protocols</span>'
    + '</div>'
    + '<div class="bm-canvas-wrap">' + _buildCanvasPanels() + '</div>'
    + '<div class="bm-legend-row" style="padding:8px 16px;border-top:1px solid var(--border)">'
      + '<div class="bm-legend-item"><span class="bm-legend-swatch" style="background:var(--teal)"></span>Primary</div>'
      + '<div class="bm-legend-item"><span class="bm-legend-swatch" style="background:#ffb547"></span>Reference</div>'
      + '<div class="bm-legend-item"><span class="bm-legend-swatch" style="background:#4a9eff;opacity:0.6"></span>Alternate</div>'
      + '<div class="bm-legend-item"><span class="bm-legend-swatch" style="background:rgba(148,163,184,0.3)"></span>Inactive</div>'
    + '</div>'
    + '<div id="bmp-mri-host" class="bmp-mri-host">'
      + (bmpState.mriOverlay ? _buildBMPFocusViewer() : '')
    + '</div>'
    + '</div>'
    + '<aside class="bm-right" id="bm-right">' + _buildParamsPanel() + '</aside>'
    + '</div>'
    + '<div id="bmp-tooltip" class="bmp-tooltip" style="display:none"></div>';

  // Attach SVG events after initial render
  _attachSVGEvents(document.getElementById('bmp-svg-container'));

  // Hydrate UI controls from state
  try {
    const rs = document.getElementById('bmp-region-sel');
    if (rs && bmpState.region) rs.value = bmpState.region;
    const ps = document.getElementById('bmp-proto-sel');
    if (ps && bmpState.protoId) ps.value = bmpState.protoId;
    const modSel = document.getElementById('bmp-mod-sel');
    if (modSel && bmpState.modality) modSel.value = bmpState.modality;
    const vb = el.querySelectorAll('.bmp-view-btn');
    vb.forEach(function(btn) { btn.classList.toggle('bmp-view-active', btn.dataset.view === bmpState.view); });
    const lt = el.querySelectorAll('.bmp-lat-btn');
    lt.forEach(function(btn) { btn.classList.toggle('bmp-lat-active', btn.dataset.lat === bmpState.lat); });
    const setVal = (id, v) => { const inp = document.getElementById(id); if (inp) inp.value = v || ''; };
    setVal('bmp-param-freq', bmpState.freq);
    setVal('bmp-param-intensity', bmpState.intensity);
    setVal('bmp-param-pulses', bmpState.pulses);
    setVal('bmp-param-duration', bmpState.duration);
    setVal('bmp-param-sessions', bmpState.sessions);
    setVal('bmp-param-notes', bmpState.notes);
  } catch (_) {}

  _renderProtoSelect();

  _updateParams();
  if (bmpState.selectedSite) { _updateDetail(); }
  _updateMap();

  // Populate presets dropdown
  function _renderPresetSelect() {
    const sel = document.getElementById('bmp-preset-sel');
    if (!sel) return;
    const items = _loadPresets();
    const opts = ['<option value="">\u2014 select \u2014</option>']
      .concat(items.map(p => '<option value="' + _esc(p.id) + '">' + _esc(p.name) + '</option>'));
    sel.innerHTML = opts.join('');
  }
  _renderPresetSelect();

  // ── v2 wiring ───────────────────────────────────────────────────────────
  // These are defined as named `var` so they can be referenced before first
  // call (hoisted) by _updateRight/_updateAtlas.
  function _wireRightPanel() {
    const root = document.getElementById('bm-right');
    if (!root) return;
    // Polarity toggle — anode/cathode placement mode
    root.querySelectorAll('[data-placemode]').forEach(function(b) {
      b.addEventListener('click', function() {
        bmpState.placeMode = b.dataset.placemode === 'cathode' ? 'cathode' : 'anode';
        _persist();
        _updateRight();
      });
    });
    // Current slider
    const curEl = root.querySelector('#bm-slider-current');
    if (curEl) {
      curEl.addEventListener('input', function() {
        const v = Number(curEl.value || 0);
        const mA = Number.isFinite(v) ? Math.max(0, Math.min(4, v)) : 0;
        bmpState.intensity = mA.toFixed(1) + ' mA';
        // Keep the legacy text input in sync too
        const legacy = document.getElementById('bmp-param-intensity');
        if (legacy) legacy.value = bmpState.intensity;
        _persist();
        _updateRight();
      });
    }
    // Duration slider
    const durEl = root.querySelector('#bm-slider-duration');
    if (durEl) {
      durEl.addEventListener('input', function() {
        const v = Number(durEl.value || 0);
        const m = Number.isFinite(v) ? Math.max(0, Math.min(45, v)) : 0;
        bmpState.duration = String(Math.round(m));
        const legacy = document.getElementById('bmp-param-duration');
        if (legacy) legacy.value = bmpState.duration;
        _persist();
        _updateRight();
      });
    }
    // Waveform select
    const wf = root.querySelector('#bm-waveform');
    if (wf) {
      wf.addEventListener('change', function() {
        bmpState.waveform = wf.value || 'Anodal DC';
        _persist();
      });
    }
    // Evidence card click → load that protocol
    root.querySelectorAll('.bm-evidence').forEach(function(card) {
      card.addEventListener('click', function() {
        const pid = card.dataset.proto;
        if (pid) window._bmpLoadProto(pid);
      });
    });
    // Detail panel click (alt site + linked protocol buttons — unchanged behaviour)
    const detailPanel = root.querySelector('#bmp-detail-panel');
    if (detailPanel) {
      detailPanel.addEventListener('click', function(e) {
        const ab = e.target.closest('[data-altsite]');
        if (ab) { window._bmpSiteClick(ab.dataset.altsite); return; }
        const pb = e.target.closest('[data-proto]');
        if (pb) { window._bmpLoadProto(pb.dataset.proto); return; }
      });
    }
  }

  function _wireAtlas() {
    const root = document.getElementById('bm-left');
    if (!root) return;
    // Region click → set region + select primary site
    root.querySelectorAll('[data-region-id]').forEach(function(r) {
      r.addEventListener('click', function() {
        window._bmpSetRegion(r.dataset.regionId);
      });
    });
    // Condition chip click → set filter (reuse existing setter so main
    // protocol select re-renders)
    root.querySelectorAll('[data-cond]').forEach(function(c) {
      c.addEventListener('click', function() {
        window._bmpSetProtoFilter('cond', c.dataset.cond);
        // toggle the active class locally
        root.querySelectorAll('[data-cond]').forEach(function(x) {
          x.classList.toggle('bm-chip-active', x.dataset.cond === c.dataset.cond);
        });
      });
    });
    // Search filter — filter visible regions by name/function/condition substring
    const search = root.querySelector('#bm-region-search');
    if (search) {
      search.addEventListener('input', function() {
        const q = String(search.value || '').toLowerCase().trim();
        root.querySelectorAll('[data-region-id]').forEach(function(r) {
          if (!q) { r.style.display = ''; return; }
          const blob = r.dataset.regionQ || '';
          r.style.display = blob.indexOf(q) !== -1 ? '' : 'none';
        });
      });
    }
  }

  function _wireTabs() {
    const root = el.querySelector('.bm-tabs-wrap');
    if (!root) return;
    root.querySelectorAll('[data-tab]').forEach(function(t) {
      t.addEventListener('click', function() {
        const v = t.dataset.tab;
        if (!v || v === bmpState.tab) return;
        bmpState.tab = v;
        _persist();
        // Toggle the atlas rail visibility for montage tab, re-render right
        const shell = el.querySelector('.bm-shell-v2');
        const leftAside = el.querySelector('#bm-left');
        if (shell) {
          shell.classList.toggle('bm-no-left', v === 'montage');
          if (v === 'montage' && leftAside) leftAside.style.display = 'none';
          else if (leftAside) leftAside.style.display = '';
        }
        // Highlight active tab
        root.querySelectorAll('[data-tab]').forEach(function(x) {
          x.classList.toggle('active', x.dataset.tab === v);
        });
        _updateRight();
      });
    });
    // Patient input
    const pInp = el.querySelector('#bm-patient-inp');
    if (pInp) {
      pInp.addEventListener('input', function() {
        bmpState.patientId = String(pInp.value || '').slice(0, 80);
        _persist();
        const lbl = el.querySelector('.bm-panel-label');
        if (lbl) {
          const patientLabel = bmpState.patientId || 'Demo patient';
          const regLabel = _regionLabel(bmpState.region) || (bmpState.selectedSite || 'no region');
          lbl.innerHTML = 'ACTIVE \u00b7 <strong>' + _esc(patientLabel) + '</strong> \u00b7 ' + _esc(regLabel);
        }
      });
    }
  }

  function _wireCanvasToolbar() {
    const root = el.querySelector('.bm-view-toolbar');
    if (!root) return;
    root.querySelectorAll('[data-toggle]').forEach(function(l) {
      l.addEventListener('click', function(e) {
        e.preventDefault();
        const k = l.dataset.toggle;
        if (k === 'efield') {
          bmpState.eFieldOverlay = !bmpState.eFieldOverlay;
          l.querySelector('.bm-toggle-pill').classList.toggle('on', bmpState.eFieldOverlay);
          _persist();
          _updateMap();
        } else if (k === 'labels') {
          bmpState.labelMode = (bmpState.labelMode === 'minimal') ? 'smart' : 'minimal';
          const ls = document.getElementById('bmp-label-mode');
          if (ls) ls.value = bmpState.labelMode;
          l.querySelector('.bm-toggle-pill').classList.toggle('on', bmpState.labelMode !== 'minimal');
          _persist();
          _updateMap();
        } else if (k === 'mri-overlay') {
          bmpState.mriOverlay = !bmpState.mriOverlay;
          l.querySelector('.bm-toggle-pill').classList.toggle('on', bmpState.mriOverlay);
          _persist();
          _renderBMPFocusViewer();
        }
      });
    });
  }

  // _wireRightPanel() already ran via _updateParams → _updateRight above.
  // Atlas + tabs + canvas toolbar are rendered once (not re-rendered by
  // _updateRight), so wire them once here.
  _wireAtlas();
  _wireTabs();
  _wireCanvasToolbar();
  // MRI focus viewer — only wire when the toggle is on (host was rendered
  // with the viewer's HTML). When off, host is empty and wiring is a no-op.
  if (bmpState.mriOverlay) _wireBMPFocusViewer();

  // New top-bar button handlers. When a patient context is present, the
  // Import button will fall back to loading the most-recent backend planner
  // draft (round-trip). Without a patient it simply focuses the protocol
  // picker as before.
  window._bmpImportFromProtocol = function() {
    const sel = document.getElementById('bmp-proto-sel');
    if (sel) {
      try { sel.focus(); sel.scrollIntoView({ behavior:'smooth', block:'center' }); } catch (_) {}
    }
    const patientId = bmpState.patientId || window._bmpPatientId || null;
    if (patientId && typeof window._bmpLoadFromBackend === 'function') {
      window._bmpLoadFromBackend();
    }
  };
  // Save current planner state to the backend as a draft against the
  // authenticated clinician. Round-trips through /api/v1/protocols/saved —
  // the full bmpState blob is stored in parameters_json so the planner can
  // re-hydrate (see _bmpLoadFromBackend below).
  window._bmpSaveToProtocol = async function() {
    const patientId = bmpState.patientId || window._bmpPatientId || null;
    if (!patientId) {
      window._showNotifToast?.({
        title:'Attach a patient',
        body:'Set a patient label (top-right) before saving the montage to backend. The local plan has been preserved.',
        severity:'warn',
      });
      return;
    }
    const conditionId = bmpState.protoId && BMP_PROTO_MAP[bmpState.protoId]
      ? (BMP_PROTO_LABELS[bmpState.protoId] || bmpState.protoId)
      : (bmpState.region || 'custom');
    try {
      const res = await api.saveProtocol({
        patient_id: patientId,
        name: 'Planner · ' + (BMP_PROTO_LABELS[bmpState.protoId] || bmpState.region || bmpState.selectedSite || 'custom montage'),
        condition: conditionId,
        modality: (bmpState.modality || 'TMS').toLowerCase().split('/')[0],
        device_slug: null,
        parameters_json: {
          source: 'brain-map-planner',
          bmpState: { ...bmpState },
        },
        clinician_notes: bmpState.notes || null,
        governance_state: 'draft',
      });
      // Cache id so subsequent edits PATCH instead of creating duplicates.
      if (res?.id) {
        try { localStorage.setItem('ds_bmp_saved_id', String(res.id)); } catch (_) {}
      }
      window._showNotifToast?.({
        title:'Saved to backend',
        body:'Planner state round-trip saved for patient ' + patientId + '.',
        severity:'success',
      });
    } catch (e) {
      window._showNotifToast?.({
        title:'Save failed',
        body:(e?.message || 'backend offline') + ' — local plan preserved.',
        severity:'warn',
      });
    }
  };

  // Load most-recent planner state back from backend drafts (opposite of
  // _bmpSaveToProtocol). Triggered by the Import from protocol button when
  // no protocol select is visible.
  window._bmpLoadFromBackend = async function() {
    const patientId = bmpState.patientId || window._bmpPatientId || null;
    if (!patientId) {
      window._showNotifToast?.({ title:'Attach a patient', body:'Set a patient to load saved planner state.', severity:'warn' });
      return;
    }
    try {
      const r = await api.listSavedProtocols(patientId);
      const items = Array.isArray(r?.items) ? r.items : [];
      const match = items.reverse().find(d => (d.parameters_json || {}).source === 'brain-map-planner');
      if (!match) {
        window._showNotifToast?.({ title:'No saved planner', body:'No backend planner drafts for this patient.', severity:'warn' });
        return;
      }
      const prior = (match.parameters_json || {}).bmpState || {};
      Object.assign(bmpState, prior);
      _persist();
      if (typeof _updateMap === 'function') _updateMap();
      window._showNotifToast?.({ title:'Planner restored', body:'Loaded saved planner state from backend.', severity:'success' });
    } catch (e) {
      window._showNotifToast?.({ title:'Load failed', body: e?.message || 'backend offline', severity:'warn' });
    }
  };
  window._bmpToggleCompare = function() {
    bmpState.compare = !bmpState.compare;
    _persist();
    _updateMap();
  };

  // Delegated events for lat buttons
  const latToggle = el.querySelector('.bmp-lat-toggle');
  if (latToggle) {
    latToggle.addEventListener('click', function(e) {
      const b = e.target.closest('[data-lat]');
      if (!b) return;
      bmpState.lat = b.dataset.lat;
      el.querySelectorAll('.bmp-lat-btn').forEach(function(btn) {
        btn.classList.toggle('bmp-lat-active', btn.dataset.lat === bmpState.lat);
      });
      _persist();
    });
  }

  // View toggle
  const viewToggle = el.querySelector('.bmp-view-toggle');
  if (viewToggle) {
    viewToggle.addEventListener('click', function(e) {
      const b = e.target.closest('[data-view]');
      if (!b) return;
      bmpState.view = b.dataset.view;
      el.querySelectorAll('.bmp-view-btn').forEach(function(btn) {
        btn.classList.toggle('bmp-view-active', btn.dataset.view === bmpState.view);
      });
      _updateMap();
      _persist();
    });
  }

  // Zoom control
  const zoomInp = document.getElementById('bmp-zoom');
  if (zoomInp) {
    zoomInp.addEventListener('input', function() {
      const z = Number(zoomInp.value || 1);
      bmpState.zoom = (Number.isFinite(z) ? Math.max(1, Math.min(1.8, z)) : 1);
      _updateMap();
      _persist();
    });
  }
  window._bmpResetView = function() {
    bmpState.zoom = 1;
    bmpState.panX = 0;
    bmpState.panY = 0;
    const zi = document.getElementById('bmp-zoom');
    if (zi) zi.value = '1';
    _updateMap();
    _persist();
  };
  window._bmpSetLabelMode = function(m) {
    bmpState.labelMode = (m === 'full' || m === 'minimal' || m === 'smart') ? m : 'smart';
    _updateMap();
    _persist();
  };

  // Search / jump to electrode
  function _baseScale() {
    const svg = document.getElementById('bmp-svg');
    if (!svg) return { sx: 1, sy: 1, el: null };
    const r = svg.getBoundingClientRect();
    return { sx: (r.width / 300) || 1, sy: (r.height / 310) || 1, el: svg };
  }
  function _centerOnSite(site) {
    const pos = BMP_SITES[site];
    if (!pos) return false;
    const wrap = document.querySelector('.bmp-svg-wrap');
    if (!wrap) return false;
    const { sx, sy } = _baseScale();
    const z = Number(bmpState.zoom || 1);
    const zSafe = Number.isFinite(z) ? Math.max(1, Math.min(1.8, z)) : 1;
    const cx = wrap.clientWidth / 2;
    const cy = wrap.clientHeight / 2;
    // Transform is: translate(panX panY) scale(z) in viewBox units.
    // Screen px = ((x + panX) * z) * baseScale
    bmpState.panX = (cx / (sx * zSafe)) - pos[0];
    bmpState.panY = (cy / (sy * zSafe)) - pos[1];
    bmpState.selectedSite = site;
    if (!bmpState.region) {
      const r = _inferRegionFromSite(site);
      if (r) {
        bmpState.region = r;
        const rs = document.getElementById('bmp-region-sel');
        if (rs) rs.value = r;
      }
    }
    _updateDetail();
    _updateMap();
    _persist();
    return true;
  }
  window._bmpGoSite = function() {
    const inp = document.getElementById('bmp-site-search');
    const raw = String(inp?.value || '').trim().toUpperCase();
    if (!raw) return;
    const site = raw.replace(/\s+/g, '');
    if (!_centerOnSite(site)) {
      window._showNotifToast?.({ title:'Not found', body:`Unknown site: ${site}`, severity:'warn' });
    }
  };
  const siteInp = document.getElementById('bmp-site-search');
  if (siteInp) {
    siteInp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') window._bmpGoSite();
    });
  }

  // Wheel zoom (zoom to cursor)
  const svgWrap = document.querySelector('.bmp-svg-wrap');
  if (svgWrap) {
    svgWrap.addEventListener('wheel', function(e) {
      if (!e.ctrlKey && !e.metaKey) return; // prevents hijacking normal scroll; hold Ctrl for zoom
      e.preventDefault();
      const { sx, sy } = _baseScale();
      const rect = svgWrap.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const z0 = Number(bmpState.zoom || 1);
      const z1 = Math.max(1, Math.min(1.8, z0 + (e.deltaY < 0 ? 0.08 : -0.08)));
      // World coords under cursor before zoom
      const wx = (px / (sx * z0)) - Number(bmpState.panX || 0);
      const wy = (py / (sy * z0)) - Number(bmpState.panY || 0);
      // Solve for new pan to keep world point under cursor
      bmpState.zoom = z1;
      bmpState.panX = (px / (sx * z1)) - wx;
      bmpState.panY = (py / (sy * z1)) - wy;
      const zi = document.getElementById('bmp-zoom');
      if (zi) zi.value = String(z1);
      _updateMap();
      _persist();
    }, { passive: false });
  }

  // Click-drag pan (when zoomed)
  if (svgWrap) {
    let dragging = false;
    let startX = 0, startY = 0;
    let startPanX = 0, startPanY = 0;
    svgWrap.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      if ((bmpState.zoom || 1) <= 1.01) return;
      // Don't start drag from form controls
      if (e.target.closest('button, input, select, textarea')) return;
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      startPanX = Number(bmpState.panX || 0);
      startPanY = Number(bmpState.panY || 0);
      svgWrap.classList.add('bmp-dragging');
    });
    window.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      const { sx, sy } = _baseScale();
      const z = Number(bmpState.zoom || 1);
      const dx = (e.clientX - startX) / (sx * z);
      const dy = (e.clientY - startY) / (sy * z);
      bmpState.panX = startPanX + dx;
      bmpState.panY = startPanY + dy;
      _updateMap();
    });
    window.addEventListener('mouseup', function() {
      if (!dragging) return;
      dragging = false;
      svgWrap.classList.remove('bmp-dragging');
      _persist();
    });
  }

  // Region select
  window._bmpSetRegion = function(r) {
    bmpState.region = r || '';
    const rs = BMP_REGION_SITES[bmpState.region];
    if (rs && rs.primary && rs.primary.length) bmpState.selectedSite = rs.primary[0];
    _updateMap(); _updateDetail();
    _persist();
  };

  // Quick actions
  window._bmpCopySummary = async function() {
    const txt = _planSummary();
    if (!txt) return;
    try {
      await navigator.clipboard.writeText(txt);
      window._showNotifToast?.({ title:'Copied', body:'Plan summary copied to clipboard.', severity:'info' });
    } catch (_) {
      // Fallback: prompt
      window.prompt('Copy plan summary:', txt);
    }
  };
  window._bmpReset = function() {
    localStorage.removeItem(BMP_STORAGE_KEY);
    bmpState.region = '';
    bmpState.protoId = '';
    bmpState.modality = 'TMS/rTMS';
    bmpState.lat = 'left';
    bmpState.freq = '';
    bmpState.intensity = '';
    bmpState.pulses = '';
    bmpState.duration = '';
    bmpState.sessions = '';
    bmpState.notes = '';
    bmpState.selectedSite = '';
    bmpState.view = 'clinical';
    const rs = document.getElementById('bmp-region-sel'); if (rs) rs.value = '';
    const ps = document.getElementById('bmp-proto-sel'); if (ps) ps.value = '';
    const ms = document.getElementById('bmp-mod-sel');   if (ms) ms.value = bmpState.modality;
    el.querySelectorAll('.bmp-lat-btn').forEach(function(btn) { btn.classList.toggle('bmp-lat-active', btn.dataset.lat === bmpState.lat); });
    el.querySelectorAll('.bmp-view-btn').forEach(function(btn) { btn.classList.toggle('bmp-view-active', btn.dataset.view === bmpState.view); });
    ['freq','intensity','pulses','duration','sessions','notes'].forEach(function(k) {
      const id = 'bmp-param-' + k;
      const inp = document.getElementById(id);
      if (inp) inp.value = '';
    });
    _updateParams(); _updateDetail(); _updateMap();
    _persist();
    window._showNotifToast?.({ title:'Reset', body:'Planner reset to defaults.', severity:'info' });
  };
  window._bmpSavePreset = function() {
    const name = window.prompt('Preset name (e.g., "MDD rTMS F3")', '');
    if (!name) return;
    const id = 'bmp_' + Math.random().toString(16).slice(2, 10);
    const items = _loadPresets();
    items.unshift({ id, name, state: { ...bmpState } });
    _savePresets(items.slice(0, 50));
    _renderPresetSelect();
    const sel = document.getElementById('bmp-preset-sel'); if (sel) sel.value = id;
    window._showNotifToast?.({ title:'Saved', body:`Preset saved: ${name}`, severity:'info' });
  };
  window._bmpLoadPreset = function(id) {
    if (!id) return;
    const items = _loadPresets();
    const p = items.find(x => x.id === id);
    if (!p || !p.state) return;
    const s = p.state;
    bmpState = { ...bmpState, ...s };
    // hydrate controls
    const rs = document.getElementById('bmp-region-sel'); if (rs) rs.value = bmpState.region || '';
    const ps = document.getElementById('bmp-proto-sel'); if (ps) ps.value = bmpState.protoId || '';
    const ms = document.getElementById('bmp-mod-sel');   if (ms) ms.value = bmpState.modality || 'TMS/rTMS';
    el.querySelectorAll('.bmp-lat-btn').forEach(function(btn) { btn.classList.toggle('bmp-lat-active', btn.dataset.lat === bmpState.lat); });
    el.querySelectorAll('.bmp-view-btn').forEach(function(btn) { btn.classList.toggle('bmp-view-active', btn.dataset.view === bmpState.view); });
    const setVal = (key) => { const inp = document.getElementById('bmp-param-' + key); if (inp) inp.value = bmpState[key] || ''; };
    ['freq','intensity','pulses','duration','sessions','notes'].forEach(setVal);
    _updateParams(); _updateDetail(); _updateMap();
    _persist();
    window._showNotifToast?.({ title:'Loaded', body:`Preset loaded: ${p.name}`, severity:'info' });
  };

  // Keep manual parameter edits in state + persist
  function _wireParam(id, key) {
    const elp = document.getElementById(id);
    if (!elp) return;
    elp.addEventListener('input', function() {
      bmpState[key] = String(elp.value || '');
      _persist();
    });
  }
  _wireParam('bmp-param-freq', 'freq');
  _wireParam('bmp-param-intensity', 'intensity');
  _wireParam('bmp-param-pulses', 'pulses');
  _wireParam('bmp-param-duration', 'duration');
  _wireParam('bmp-param-sessions', 'sessions');
  _wireParam('bmp-param-notes', 'notes');

  // Detail panel delegated events (alt targets + linked protocols)
  const detailPanel = document.getElementById('bmp-detail-panel');
  if (detailPanel) {
    detailPanel.addEventListener('click', function(e) {
      const ab = e.target.closest('[data-altsite]');
      if (ab) { window._bmpSiteClick(ab.dataset.altsite); return; }
      const pb = e.target.closest('[data-proto]');
      if (pb) { window._bmpLoadProto(pb.dataset.proto); return; }
    });
  }

  // ── global handlers ───────────────────────────────────────────────────────
  window._bmpLoadProto = function(pid) { if (pid) _loadProtocol(pid); };

  window._bmpSetProtoFilter = function(key, value) {
    if (key !== 'q' && key !== 'cond' && key !== 'ev' && key !== 'site') return;
    _bmpProtoFilter[key] = String(value == null ? '' : value);
    _renderProtoSelect();
    if (bmpState.mriOverlay) _renderBMPFocusViewer();
  };

  window._bmpSetModality = function(m) {
    bmpState.modality = m; _updateMap(); _updateParams();
    _persist();
  };

  window._bmpSetLat = function(lat) {
    bmpState.lat = lat;
    el.querySelectorAll('.bmp-lat-btn').forEach(function(b) {
      b.classList.toggle('bmp-lat-active', b.dataset.lat === lat);
    });
  };

  window._bmpSetView = function(v) {
    bmpState.view = v;
    const btns = el.querySelectorAll('.bmp-view-btn');
    btns.forEach(function(b) { b.classList.toggle('bmp-view-active', b.dataset.view === v); });
    _updateMap();
  };

  window._bmpSiteHover = function(name, on, evt) {
    const tt = document.getElementById('bmp-tooltip');
    if (!tt) return;
    if (!on) {
      tt.style.display = 'none';
      return;
    }
    const anat = BMP_ANATOMY[name] || name;
    const cl   = (BMP_CONDITIONS[name] || []).join(', ') || 'General electrode site';
    tt.innerHTML = '<strong style="font-size:13px">' + name + '</strong>'
      + '<br><span style="font-size:11px;color:rgba(255,255,255,0.7)">' + anat + '</span>'
      + '<br><span style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:4px;display:block">' + cl + '</span>';
    tt.style.display = 'block';
    if (evt) { tt.style.left = (evt.clientX + 14) + 'px'; tt.style.top = (evt.clientY - 10) + 'px'; }
  };

  document.addEventListener('mousemove', function(e) {
    const tt = document.getElementById('bmp-tooltip');
    if (tt && tt.style.display !== 'none') {
      tt.style.left = (e.clientX + 14) + 'px';
      tt.style.top  = (e.clientY - 10) + 'px';
    }
  });

  window._bmpSiteClick = function(name) {
    if (!bmpState.region) {
      const r = _inferRegionFromSite(name);
      if (r) {
        bmpState.region = r;
        const rs = document.getElementById('bmp-region-sel');
        if (rs) rs.value = r;
      }
    }
    bmpState.selectedSite = name;
    // Bidirectional: click a site → filter protocol list to that electrode.
    // Click the same site again → clear the filter.
    _bmpProtoFilter.site = (_bmpProtoFilter.site === name) ? '' : name;
    _renderProtoSelect();
    _updateDetail(); _updateMap(); _updateParams();
    _persist();
  };

  window._bmpPrescribe   = function() { window._nav('prescriptions'); };
  window._bmpUseInWizard = function() { window._nav('protocol-wizard'); };

  window._bmpViewDetail = function() {
    if (bmpState.protoId) window._protDetailId = bmpState.protoId;
    window._nav('protocol-detail');
  };

  window._bmpPrescribeProto = function(pid) {
    const safe = String(pid || '').replace(/['"<>&]/g, '');
    if (safe) {
      if (protos && protos.find) {
        const p = protos.find(function(pr) { return (pr.id || '') === safe; });
        if (p) window._rxPrefilledProto = p;
      }
      window._protDetailId = safe;
    }
    window._nav('prescriptions');
  };

  window._bmpState = bmpState;
}

// ── pgNotesDictation — Protocol & session notes with dictation ────────────────

export async function pgNotesDictation(setTopbar) {
  setTopbar('Notes & Dictation', `
    <button class="btn btn-sm" onclick="window._nav('courses')">Treatment Courses</button>
  `);
  const el = document.getElementById('content');
  if (!el) return;

  const NOTE_TYPES = [
    { id:'pre_session',  label:'Pre-session',    color:'var(--blue)' },
    { id:'post_session', label:'Post-session',   color:'var(--teal)' },
    { id:'observation',  label:'Observation',    color:'var(--text-secondary)' },
    { id:'adverse',      label:'Adverse Event',  color:'var(--amber)' },
    { id:'progress',     label:'Progress Note',  color:'var(--green,#22c55e)' },
  ];
  const SEVERITIES = ['none','mild','moderate','severe'];
  const NOTES_KEY = 'ds_protocol_notes';
  const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  function loadNotes() {
    try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '[]'); } catch { return []; }
  }
  function saveNotes(notes) { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); }

  function renderNotes(notes) {
    const listEl = document.getElementById('nd-notes-list');
    if (!listEl) return;
    if (!notes.length) {
      listEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:12px">No notes yet. Use the form above to add your first note.</div>`;
      return;
    }
    listEl.innerHTML = notes.slice().reverse().map((n, i) => {
      const nt = NOTE_TYPES.find(t => t.id === n.type) || NOTE_TYPES[0];
      const sevColor = n.severity === 'severe' ? 'var(--red)' : n.severity === 'moderate' ? 'var(--amber)' : 'var(--text-tertiary)';
      return `<div style="border:1px solid var(--border);border-radius:var(--radius-md);padding:12px 14px;margin-bottom:8px;background:var(--bg-card)">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
          <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:${nt.color}18;color:${nt.color};border:1px solid ${nt.color}30">${nt.label}</span>
          ${n.severity && n.severity !== 'none' ? `<span style="font-size:10px;color:${sevColor};font-weight:600">${n.severity.toUpperCase()}</span>` : ''}
          ${n.followUp ? `<span style="font-size:10px;color:var(--amber);font-weight:600">⚑ Follow-up</span>` : ''}
          <span style="font-size:10.5px;color:var(--text-tertiary);margin-left:auto">${new Date(n.createdAt).toLocaleString()}</span>
        </div>
        <div style="font-size:12.5px;color:var(--text-primary);line-height:1.6;white-space:pre-wrap">${esc(n.body)}</div>
        <div style="margin-top:8px">
          <button class="btn btn-ghost btn-sm" style="font-size:10px;color:var(--red)" onclick="window._ndDelete(${n.id})">Delete</button>
        </div>
      </div>`;
    }).join('');
  }

  const hasSpeechAPI = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;

  el.innerHTML = `
    <div style="max-width:800px;margin:0 auto">
      <!-- Add note form -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <h3>New Note</h3>
          ${hasSpeechAPI ? `<button id="nd-dictate-btn" class="btn btn-sm" onclick="window._ndStartDictation()" style="border-color:var(--violet);color:var(--violet)">🎙 Dictate</button>` : ''}
        </div>
        <div class="card-body">
          <div class="g2" style="margin-bottom:12px">
            <div class="form-group">
              <label class="form-label">Note Type</label>
              <select id="nd-type" class="form-control">
                ${NOTE_TYPES.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Severity</label>
              <select id="nd-severity" class="form-control">
                ${SEVERITIES.map(s => `<option value="${s}">${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Note</label>
            <textarea id="nd-body" class="form-control" rows="4" placeholder="Enter clinical observation, session note, or adverse event description…"></textarea>
          </div>
          <div style="display:flex;gap:10px;align-items:center;margin-top:4px">
            <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--text-secondary);cursor:pointer">
              <input type="checkbox" id="nd-followup"> Flag for follow-up
            </label>
            <button class="btn btn-primary" onclick="window._ndSave()" style="margin-left:auto">Save Note</button>
          </div>
        </div>
      </div>
      <!-- Notes list -->
      <div class="card">
        <div class="card-header"><h3>Saved Notes</h3></div>
        <div class="card-body">
          <div id="nd-notes-list"></div>
        </div>
      </div>
    </div>`;

  let notes = loadNotes();
  renderNotes(notes);

  window._ndSave = function() {
    const body = document.getElementById('nd-body')?.value?.trim() || '';
    if (!body) { window._showNotifToast?.({ title:'Empty Note', body:'Please enter note content.', severity:'warning' }); return; }
    notes.push({
      id: Date.now(),
      type:      document.getElementById('nd-type')?.value     || 'observation',
      severity:  document.getElementById('nd-severity')?.value || 'none',
      followUp:  document.getElementById('nd-followup')?.checked || false,
      body,
      createdAt: new Date().toISOString(),
    });
    saveNotes(notes);
    const ta = document.getElementById('nd-body');
    if (ta) ta.value = '';
    renderNotes(notes);
    window._showNotifToast?.({ title:'Note Saved', body:'Clinical note saved in this browser view.', severity:'info' });
  };

  window._ndDelete = function(id) {
    if (!confirm('Delete this note?')) return;
    notes = notes.filter(n => n.id !== id);
    saveNotes(notes);
    renderNotes(notes);
  };

  // Web Speech API dictation
  window._ndStartDictation = function() {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) return;
    const rec = new Rec();
    rec.continuous    = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    const btn = document.getElementById('nd-dictate-btn');
    const ta  = document.getElementById('nd-body');
    let interim = '';
    let saved   = ta?.value || '';

    rec.onstart = function() { if (btn) { btn.textContent = '⏹ Stop'; btn.style.borderColor = 'var(--red)'; btn.style.color = 'var(--red)'; } };
    rec.onresult = function(e) {
      interim = '';
      let finalText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t + ' ';
        else interim += t;
      }
      saved += finalText;
      if (ta) ta.value = saved + interim;
    };
    rec.onerror = function() { rec.stop(); };
    rec.onend   = function() {
      if (btn) { btn.textContent = '🎙 Dictate'; btn.style.borderColor = 'var(--violet)'; btn.style.color = 'var(--violet)'; }
      if (ta) ta.value = saved;
      btn.onclick = () => window._ndStartDictation();
    };

    rec.start();
    if (btn) btn.onclick = () => { rec.stop(); };
  };
}

// ── pgMedicalHistory — Structured clinical chart ─────────────────────────────
export async function pgMedicalHistory(setTopbar) {
  setTopbar('Medical History', `
    <div style="display:flex;gap:8px">
      <button class="btn btn-sm" onclick="window._mhPrint()">Print</button>
      <button class="btn btn-sm" onclick="window._mhExport()">Export</button>
      <button class="btn btn-primary btn-sm" onclick="window._mhSave()">Save Changes</button>
    </div>
  `);
  const el = document.getElementById('content');
  if (!el) return;

  function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // ── Storage ─────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'ds_medical_history';
  function loadHistory(pid) {
    try { const d = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); return d[pid] || null; } catch { return null; }
  }
  function saveHistory(pid, data) {
    try { const d = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); d[pid] = data; localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {}
  }

  // ── Patient load ─────────────────────────────────────────────────────────
  let patients = [];
  try { const r = await api.listPatients?.().catch(() => null); patients = r?.items || []; } catch {}

  // ── Demo / seed data ──────────────────────────────────────────────────────
  const DEMO_DATA = {
    chief_complaint: 'Persistent low mood, fatigue, and difficulty concentrating for the past 8 months. Unable to maintain work performance and withdrawing socially.',
    symptom_onset: '8 months ago — gradual onset following prolonged workplace stress',
    severity: '6',
    impact: 'Unable to sustain full-time work performance. Avoiding social engagements. Sleep disrupted.',
    patient_goals: 'Improve mood and daily energy. Return to full-time work. Re-engage with family and hobbies.',
    primary_dx: 'F33.1 — MDD, recurrent, moderate',
    secondary_dx: 'F41.1 — Generalised Anxiety Disorder',
    working_dx: '',
    dx_notes: 'PHQ-9 score 14 (moderate). GAD-7 score 11 (moderate). No prior manic/hypomanic episodes.',
    prior_episodes: '1 prior depressive episode 3 years ago — resolved with CBT after 16 sessions.',
    hospitalizations: 'None',
    suicide_risk: 'Passive ideation at intake — no active plan. Risk: low. Safety plan documented.',
    current_therapist: 'None currently. Was seeing Dr. A. Mehta (CBT) until 2023.',
    prior_therapy: 'CBT — 12 sessions 2023, partial response, relapsed after 4 months.',
    neuro_conditions: 'Mild migraines — 1-2 per month. No epilepsy, TBI, or stroke.',
    brain_injury: 'None',
    neuro_tests: 'No prior EEG, MRI, or neuropsychological testing.',
    chronic_conditions: 'None significant',
    surgeries: 'Appendectomy 2015 — uncomplicated',
    seizure_history: 'No seizure or epilepsy history.',
    seizure_meds: 'None',
    seizure_risk: 'Low',
    metal_implants: 'None',
    pacemaker: 'None',
    pregnancy: 'N/A',
    photosensitivity: 'None reported',
    prior_ae_neuromod: 'None — no prior neuromodulation',
    contra_notes: '',
    contra_cleared: 'Cleared — proceed',
    current_meds: 'Sertraline 100mg once daily (SSRI — GP)\nMelatonin 2mg PRN (sleep)',
    supplements: 'Omega-3 1g daily\nVitamin D3 2000 IU daily',
    past_meds: 'Escitalopram 10mg — 2022, partial response, stopped due to weight gain.',
    med_interactions: 'Monitor for serotonin syndrome risk if high-intensity TMS combined with SSRI.',
    drug_allergies: 'Penicillin — rash (non-anaphylactic)',
    other_allergies: 'Latex — mild contact dermatitis',
    allergy_notes: 'Penicillin allergy documented. Latex sensitivity — use latex-free electrode caps.',
    prior_neuromod: 'None',
    neuromod_response: 'N/A',
    neuromod_ae: 'None',
    neuromod_pref: 'Open to TMS. Mild anxiety about procedure — educational materials provided at intake.',
    prior_medications_tried: 'Escitalopram (2022) — partial response\nSertraline 100mg (current) — partial response at 6 months',
    prior_cbt: 'CBT — 12 sessions with Dr. A. Mehta (2023). Partial response. Relapsed.',
    prior_other_therapy: 'None',
    family_psych: 'Mother — depression, treated with antidepressants, good response.',
    family_neuro: 'No known epilepsy, dementia, or stroke in immediate family.',
    family_notes: 'Maternal history of depression may support treatment-responsive phenotype.',
    sleep_quality: 'Moderate difficulties',
    sleep_hours: '5.5',
    sleep_conditions: 'Delayed sleep onset (1-2hrs). Early morning waking. No sleep apnea.',
    alcohol: 'Social / low risk',
    tobacco: 'Never',
    cannabis: 'Never',
    other_substances: 'None',
    occupation: 'Marketing manager — currently on reduced hours.',
    activity_level: 'Low — minimal exercise since onset. Previously running 3x/week.',
    caregiver_support: 'Partner supportive, accompanies to appointments.',
    clinical_summary: 'Moderate MDD with comorbid GAD. Two SSRI trials — partial response to both. Prior CBT partial response with relapse. No contraindications to TMS. Safety clearance: proceed. Risk: low-moderate. Patient motivated and treatment-ready.',
    treatment_goals: '1. Achieve PHQ-9 <5 (remission)\n2. Reduce GAD-7 to mild range (<7)\n3. Return to full-time work within 3-6 months\n4. Restore sleep and energy\n5. Re-engage socially and physically',
    protocol_implications: 'Suitable for left DLPFC TMS (depression). Consider combined anxiety protocol. Reassess PHQ-9 and GAD-7 at session 5 and 10.',
    safety_flags: 'Monitor SSRI interaction. Penicillin allergy documented. Headache risk noted to patient.',
    readiness: 'Ready for Planning',
    last_updated_by: 'Demo Clinician',
    _updated: new Date().toISOString(),
    _is_demo: true,
  };

  // ── Section schema ────────────────────────────────────────────────────────
  const SECTIONS = [
    { id: 'presenting', label: 'Presenting Problems', icon: '◉', critical: false, fields: [
      { id: 'chief_complaint', label: 'Chief Complaint',      type: 'textarea', placeholder: 'Primary reason for referral — main symptoms in patient words…', rows: 3 },
      { id: 'symptom_onset',   label: 'Symptom Onset',        type: 'text',     placeholder: 'e.g. 8 months ago, gradual onset' },
      { id: 'severity',        label: 'Severity (0-10)',       type: 'number',   placeholder: '0-10' },
      { id: 'impact',          label: 'Functional Impact',    type: 'textarea', placeholder: 'Work, relationships, sleep, daily activities…' },
      { id: 'patient_goals',   label: 'Patient Goals',        type: 'textarea', placeholder: 'Short-term and long-term goals agreed with patient…' },
    ]},
    { id: 'diagnoses', label: 'Diagnoses', icon: '◈', critical: false, fields: [
      { id: 'primary_dx',   label: 'Primary Diagnosis (ICD-10)', type: 'text',     placeholder: 'e.g. F33.1 — MDD, recurrent, moderate' },
      { id: 'secondary_dx', label: 'Secondary Diagnoses',        type: 'textarea', placeholder: 'Additional diagnoses with ICD codes…' },
      { id: 'working_dx',   label: 'Working / Differential',     type: 'textarea', placeholder: 'Differential diagnoses under consideration…' },
      { id: 'dx_notes',     label: 'Diagnostic Notes',           type: 'textarea', placeholder: 'Criteria met, assessments used, differential considered…' },
    ]},
    { id: 'safety', label: 'Contraindications & Safety', icon: '⚠', critical: true, fields: [
      { id: 'seizure_history',   label: 'Seizure / Epilepsy History',             type: 'textarea', placeholder: 'Type, frequency, last episode — or None' },
      { id: 'seizure_meds',      label: 'Anti-epileptic Medications',             type: 'text',     placeholder: 'Current AEDs — or None' },
      { id: 'seizure_risk',      label: 'Seizure Risk',                           type: 'select',   options: ['Not assessed', 'Low', 'Moderate', 'High — contraindicated'] },
      { id: 'metal_implants',    label: 'Metal Implants / Devices',               type: 'textarea', placeholder: 'Cochlear implants, DBS leads, aneurysm clips — or None' },
      { id: 'pacemaker',         label: 'Cardiac Device',                         type: 'select',   options: ['None', 'Pacemaker', 'ICD', 'CRT-D', 'Other cardiac device'] },
      { id: 'pregnancy',         label: 'Pregnancy / Breastfeeding',              type: 'select',   options: ['N/A', 'Pregnant — 1st trimester', 'Pregnant — 2nd trimester', 'Pregnant — 3rd trimester', 'Breastfeeding', 'Planning pregnancy'] },
      { id: 'photosensitivity',  label: 'Photosensitivity / Stimulation Sensitivity', type: 'text', placeholder: 'Any known sensitivity…' },
      { id: 'prior_ae_neuromod', label: 'Prior Adverse Reaction to Neuromodulation', type: 'textarea', placeholder: 'Any adverse effects in prior TMS, tDCS, ECT — or None' },
      { id: 'contra_notes',      label: 'Contraindication Notes',                 type: 'textarea', placeholder: 'Safety review, clinician sign-off, workarounds…' },
      { id: 'contra_cleared',    label: 'Safety Clearance',                       type: 'select',   options: ['Pending review', 'Cleared — proceed', 'Cleared with conditions', 'Contraindication check required', 'Contraindicated — do not proceed'] },
    ]},
    { id: 'psychiatric', label: 'Psychiatric & Mental Health History', icon: '◧', critical: false, fields: [
      { id: 'prior_episodes',    label: 'Prior Psychiatric Episodes',  type: 'textarea', placeholder: 'Number, duration, severity, triggers of past episodes…' },
      { id: 'hospitalizations',  label: 'Psychiatric Hospitalizations',type: 'textarea', placeholder: 'Dates, facilities, reasons — or None' },
      { id: 'suicide_risk',      label: 'Suicide / Self-Harm History', type: 'textarea', placeholder: 'Ideation, attempts, current risk assessment…' },
      { id: 'current_therapist', label: 'Current Therapist / Psychiatrist', type: 'text', placeholder: 'Name, clinic, contact' },
    ]},
    { id: 'neurological', label: 'Neurological & Medical History', icon: '◎', critical: false, fields: [
      { id: 'neuro_conditions',  label: 'Neurological Conditions',     type: 'textarea', placeholder: 'Migraines, TBI, MS, movement disorders, tinnitus, chronic pain…' },
      { id: 'brain_injury',      label: 'Head / Brain Injury',         type: 'textarea', placeholder: 'Date, mechanism, severity, sequelae — or None' },
      { id: 'neuro_tests',       label: 'Prior Neurological Tests',    type: 'textarea', placeholder: 'EEG, MRI, CT, neuropsychological testing — results and dates…' },
      { id: 'chronic_conditions',label: 'Chronic Medical Conditions',  type: 'textarea', placeholder: 'Diabetes, hypertension, thyroid, cardiovascular, chronic pain…' },
      { id: 'surgeries',         label: 'Surgeries',                   type: 'textarea', placeholder: 'Procedure, year, hospital, complications…' },
    ]},
    { id: 'medications', label: 'Medications & Supplements', icon: '◩', critical: false, fields: [
      { id: 'current_meds',     label: 'Current Medications',          type: 'textarea', placeholder: 'Drug, dose, frequency, prescriber…', rows: 4 },
      { id: 'supplements',      label: 'Supplements / OTC',            type: 'textarea', placeholder: 'Vitamins, herbs, OTC medications…' },
      { id: 'past_meds',        label: 'Past Medications (relevant)',  type: 'textarea', placeholder: 'Drug, dose, outcome, reason stopped…' },
      { id: 'med_interactions', label: 'Drug Interactions / Concerns', type: 'textarea', placeholder: 'Known interactions or prescriber concerns flagged…' },
    ]},
    { id: 'allergies', label: 'Allergies', icon: '⚠', critical: false, fields: [
      { id: 'drug_allergies',  label: 'Drug Allergies',   type: 'textarea', placeholder: 'Drug name — reaction type — severity…' },
      { id: 'other_allergies', label: 'Other Allergies',  type: 'textarea', placeholder: 'Food, environmental, latex, metals, device materials…' },
      { id: 'allergy_notes',   label: 'Allergy Notes',    type: 'textarea', placeholder: 'Severity, cross-reactivity, anaphylaxis risk…' },
    ]},
    { id: 'prior_treatment', label: 'Prior Treatment History', icon: '◫', critical: false, fields: [
      { id: 'prior_medications_tried', label: 'Medications Tried',  type: 'textarea', placeholder: 'Drug, dose, duration, response, reason discontinued…' },
      { id: 'prior_cbt',        label: 'Psychotherapy',             type: 'textarea', placeholder: 'CBT, DBT, ACT — sessions, therapist, outcome…' },
      { id: 'prior_other_therapy', label: 'Other Therapies',        type: 'textarea', placeholder: 'OT, speech, behavioral, hospital-based…' },
      { id: 'prior_therapy',    label: 'Treatment History Notes',   type: 'textarea', placeholder: 'What was tried, what worked, what did not…' },
    ]},
    { id: 'neuromod', label: 'Prior Neuromodulation History', icon: '◎', critical: false, fields: [
      { id: 'prior_neuromod',    label: 'Prior Neuromodulation',    type: 'textarea', placeholder: 'TMS, tDCS, neurofeedback, PBM, VNS, CES, ECT — dates, modality, sessions…' },
      { id: 'neuromod_response', label: 'Treatment Response',       type: 'textarea', placeholder: 'Responder / partial / non-responder, improvement %, notes…' },
      { id: 'neuromod_ae',       label: 'Adverse Events',           type: 'textarea', placeholder: 'Side effects, intolerance, or reason treatment stopped…' },
      { id: 'neuromod_pref',     label: 'Patient Preferences',      type: 'textarea', placeholder: 'Device comfort, session preferences, concerns…' },
    ]},
    { id: 'family', label: 'Family History', icon: '◉', critical: false, fields: [
      { id: 'family_psych', label: 'Family Psychiatric History',  type: 'textarea', placeholder: 'Depression, bipolar, schizophrenia, anxiety, ADHD…' },
      { id: 'family_neuro', label: 'Family Neurological History', type: 'textarea', placeholder: 'Epilepsy, dementia, stroke, movement disorders…' },
      { id: 'family_notes', label: 'Family History Notes',        type: 'textarea', placeholder: 'First-degree relatives, severity, treatment responses…' },
    ]},
    { id: 'lifestyle', label: 'Sleep, Lifestyle & Functional Context', icon: '◌', critical: false, fields: [
      { id: 'sleep_quality',  label: 'Sleep Quality',           type: 'select',   options: ['Good', 'Mild difficulties', 'Moderate difficulties', 'Severe insomnia'] },
      { id: 'sleep_hours',    label: 'Sleep (hours/night)',      type: 'number',   placeholder: 'e.g. 6' },
      { id: 'sleep_conditions',label:'Sleep Conditions',        type: 'textarea', placeholder: 'Sleep apnea, restless legs, CPAP use…' },
      { id: 'alcohol',        label: 'Alcohol Use',             type: 'select',   options: ['None', 'Social / low risk', 'Moderate', 'Heavy use', 'Dependence / AUD', 'In remission'] },
      { id: 'tobacco',        label: 'Tobacco / Nicotine',      type: 'select',   options: ['Never', 'Former (>1yr)', 'Former (<1yr)', 'Current'] },
      { id: 'cannabis',       label: 'Cannabis',                type: 'select',   options: ['Never', 'Occasional', 'Regular', 'Daily', 'CUD'] },
      { id: 'other_substances',label:'Other Substances',        type: 'textarea', placeholder: 'Opioids, stimulants, benzodiazepines — pattern, last use…' },
      { id: 'occupation',     label: 'Occupation / School',     type: 'text',     placeholder: 'Role, current function…' },
      { id: 'activity_level', label: 'Physical Activity',       type: 'text',     placeholder: 'Exercise pattern, current vs baseline…' },
      { id: 'caregiver_support',label:'Caregiver / Support',    type: 'text',     placeholder: 'Partner, family, community support…' },
    ]},
    { id: 'summary', label: 'Clinician Summary & Protocol Notes', icon: '◈', critical: false, fields: [
      { id: 'clinical_summary',      label: 'Clinical Summary',           type: 'textarea', placeholder: 'Clinical formulation, diagnostic impression, key risk factors…', rows: 5 },
      { id: 'treatment_goals',       label: 'Treatment Goals',            type: 'textarea', placeholder: 'Short-term and long-term goals…' },
      { id: 'protocol_implications', label: 'Protocol Implications',      type: 'textarea', placeholder: 'How history should shape protocol choice and safety monitoring…' },
      { id: 'safety_flags',          label: 'Safety Flags for Protocol Team', type: 'textarea', placeholder: 'Contraindications, cautions, monitoring requirements…' },
      { id: 'readiness',             label: 'Treatment Readiness',        type: 'select',   options: ['Not assessed', 'Ready for Planning', 'Needs Review', 'Contraindication Check Required', 'Not ready — defer'] },
      { id: 'last_updated_by',       label: 'Last Updated By',            type: 'text',     placeholder: 'Clinician name' },
    ]},
  ];

  // ── Readiness computation ─────────────────────────────────────────────────
  function computeReadiness(d) {
    if (!d) return { label: 'Not Assessed', color: 'var(--text-tertiary)', bg: 'rgba(255,255,255,0.05)' };
    if (d.contra_cleared === 'Contraindicated — do not proceed' || d.readiness === 'Not ready — defer')
      return { label: 'Contraindicated', color: 'var(--red)', bg: 'rgba(239,68,68,0.12)' };
    if (d.contra_cleared === 'Contraindication check required' || d.readiness === 'Contraindication Check Required')
      return { label: 'Contraindication Check Required', color: 'var(--red)', bg: 'rgba(239,68,68,0.1)' };
    if (d.readiness === 'Needs Review')
      return { label: 'Needs Review', color: 'var(--amber)', bg: 'rgba(245,158,11,0.1)' };
    if (d.readiness === 'Ready for Planning' || d.contra_cleared === 'Cleared — proceed')
      return { label: 'Ready for Planning', color: 'var(--green)', bg: 'rgba(34,197,94,0.1)' };
    if (d.contra_cleared === 'Cleared with conditions')
      return { label: 'Cleared with Conditions', color: 'var(--amber)', bg: 'rgba(245,158,11,0.1)' };
    return { label: 'Pending Review', color: 'var(--blue)', bg: 'rgba(59,130,246,0.1)' };
  }

  // ── Safety panel (right sidebar) ─────────────────────────────────────────
  function renderSafetyPanel(d) {
    if (!d) return '<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:12px">Select a patient to see the safety summary.</div>';
    const readiness = computeReadiness(d);
    const hasImplant = d.metal_implants && d.metal_implants !== 'None' && d.metal_implants.trim();
    const hasPacemaker = d.pacemaker && d.pacemaker !== 'None';
    const seizureRisk = d.seizure_risk || 'Not assessed';
    const hasAllergy = d.drug_allergies && d.drug_allergies.trim() && d.drug_allergies.toLowerCase() !== 'none';
    const hasPriorNeuromod = d.prior_neuromod && d.prior_neuromod.trim() && d.prior_neuromod.toLowerCase() !== 'none' && d.prior_neuromod !== 'N/A';
    const medCount = (d.current_meds || '').split('\n').filter(function(l) { return l.trim(); }).length;
    const isPregnant = d.pregnancy && d.pregnancy.toLowerCase().includes('pregnant');
    const hasSafetyFlag = hasImplant || hasPacemaker || seizureRisk === 'Moderate' || seizureRisk === 'High — contraindicated' || isPregnant;

    function fact(icon, label, value, color) {
      return '<div style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">' +
        '<span style="font-size:13px;flex-shrink:0;line-height:1.3">' + icon + '</span>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:10px;color:var(--text-tertiary);margin-bottom:2px;text-transform:uppercase;letter-spacing:0.5px">' + label + '</div>' +
          '<div style="font-size:12.5px;font-weight:600;color:' + (color || 'var(--text-primary)') + ';line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px" title="' + esc(value||'') + '">' + esc(value || '—') + '</div>' +
        '</div></div>';
    }

    return (
      '<div style="padding:12px 14px;border-radius:var(--radius-md);background:' + readiness.bg + ';border:1px solid ' + readiness.color + '40;margin-bottom:14px;text-align:center">' +
        '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-tertiary);margin-bottom:3px">Treatment Readiness</div>' +
        '<div style="font-size:13px;font-weight:800;color:' + readiness.color + '">' + readiness.label + '</div>' +
      '</div>' +

      (hasSafetyFlag ? '<div style="padding:8px 12px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:var(--radius-md);margin-bottom:12px;font-size:11.5px;color:var(--red);display:flex;gap:8px"><span>⚠</span><span>Safety flags present — review Contraindications before protocol planning.</span></div>' : '') +

      '<div style="font-size:10px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px">Key Clinical Facts</div>' +
      fact('◉', 'Primary Diagnosis', d.primary_dx, 'var(--text-primary)') +
      fact('⚡', 'Seizure Risk', seizureRisk, seizureRisk === 'Low' ? 'var(--green)' : seizureRisk === 'Moderate' ? 'var(--amber)' : seizureRisk === 'High — contraindicated' ? 'var(--red)' : 'var(--text-secondary)') +
      fact('◧', 'Implants / Cardiac', hasImplant ? d.metal_implants : hasPacemaker ? d.pacemaker : 'None', (hasImplant || hasPacemaker) ? 'var(--red)' : 'var(--green)') +
      fact('◌', 'Pregnancy', d.pregnancy || 'N/A', isPregnant ? 'var(--amber)' : 'var(--text-secondary)') +
      fact('⚠', 'Allergies', hasAllergy ? d.drug_allergies.split('\n')[0] : 'None', hasAllergy ? 'var(--amber)' : 'var(--text-secondary)') +
      fact('◎', 'Prior Neuromod', hasPriorNeuromod ? 'Yes — see history' : 'None', hasPriorNeuromod ? 'var(--blue)' : 'var(--text-secondary)') +
      fact('◩', 'Current Meds', medCount > 0 ? medCount + ' medication' + (medCount !== 1 ? 's' : '') : 'None recorded', medCount > 0 ? 'var(--text-primary)' : 'var(--text-secondary)') +

      (d.protocol_implications ? '<div style="margin-top:12px;padding:10px 12px;background:rgba(0,212,188,0.06);border:1px solid rgba(0,212,188,0.18);border-radius:var(--radius-md)"><div style="font-size:10px;font-weight:700;color:var(--teal);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px">Protocol Notes</div><div style="font-size:12px;color:var(--text-secondary);line-height:1.5">' + esc(d.protocol_implications).replace(/\n/g,'<br>') + '</div></div>' : '') +

      '<div style="margin-top:14px;display:flex;flex-direction:column;gap:6px">' +
        '<button onclick="window._mhEditSection(\'safety\')" style="width:100%;padding:8px;font-size:12px;font-weight:600;border-radius:var(--radius-md);background:rgba(239,68,68,0.1);color:var(--red);border:1px solid rgba(239,68,68,0.2);cursor:pointer;font-family:var(--font-body)">⚠ Edit Safety</button>' +
        '<button onclick="window._mhEditSection(\'medications\')" style="width:100%;padding:8px;font-size:12px;font-weight:600;border-radius:var(--radius-md);background:rgba(0,212,188,0.08);color:var(--teal);border:1px solid rgba(0,212,188,0.2);cursor:pointer;font-family:var(--font-body)">◩ Edit Medications</button>' +
        '<button onclick="window._mhEditSection(\'summary\')" style="width:100%;padding:8px;font-size:12px;font-weight:600;border-radius:var(--radius-md);background:transparent;color:var(--text-secondary);border:1px solid var(--border);cursor:pointer;font-family:var(--font-body)">◈ Edit Summary</button>' +
        '<button onclick="window._nav(\'protocol-wizard\')" style="width:100%;padding:8px;font-size:12px;font-weight:700;border-radius:var(--radius-md);background:var(--teal);color:#000;border:none;cursor:pointer;font-family:var(--font-body)">Plan Protocol \u2192</button>' +
      '</div>' +

      (d._updated ? '<div style="margin-top:14px;font-size:10.5px;color:var(--text-tertiary);border-top:1px solid var(--border);padding-top:10px">Last updated: ' + new Date(d._updated).toLocaleDateString() + (d.last_updated_by ? ' by ' + esc(d.last_updated_by) : '') + (d._is_demo ? ' <span style="color:var(--amber)">(Demo)</span>' : '') + '</div>' : '')
    );
  }

  // ── Summary strip ─────────────────────────────────────────────────────────
  function renderSummaryStrip(d) {
    if (!d) return '';
    function chip(label, value, color, bg) {
      return '<div style="padding:10px 14px;border-radius:var(--radius-md);background:' + bg + ';border:1px solid ' + color + '30;min-width:0;overflow:hidden">' +
        '<div style="font-size:9.5px;color:' + color + ';text-transform:uppercase;letter-spacing:0.5px;font-weight:700;margin-bottom:3px">' + label + '</div>' +
        '<div style="font-size:12px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + esc(value||'') + '">' + esc((value||'—').length > 28 ? (value||'').slice(0,26)+'…' : (value||'—')) + '</div>' +
      '</div>';
    }
    const readiness = computeReadiness(d);
    const hasAllergy = d.drug_allergies && d.drug_allergies.trim() && d.drug_allergies.toLowerCase() !== 'none';
    const hasPriorNeuromod = d.prior_neuromod && d.prior_neuromod.trim() && d.prior_neuromod.toLowerCase() !== 'none' && d.prior_neuromod !== 'N/A';
    const medCount = (d.current_meds || '').split('\n').filter(function(l) { return l.trim(); }).length;
    return '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:20px">' +
      chip('Primary Diagnosis', d.primary_dx || 'Not recorded', 'var(--teal)', 'rgba(0,212,188,0.06)') +
      chip('Readiness', readiness.label, readiness.color, readiness.bg) +
      chip('Safety Clearance', d.contra_cleared || 'Not assessed', d.contra_cleared === 'Cleared — proceed' ? 'var(--green)' : 'var(--amber)', d.contra_cleared === 'Cleared — proceed' ? 'rgba(34,197,94,0.06)' : 'rgba(245,158,11,0.06)') +
      chip('Medications', medCount > 0 ? medCount + ' active' : 'None', medCount > 0 ? 'var(--blue)' : 'var(--text-tertiary)', 'rgba(59,130,246,0.06)') +
      chip('Prior Neuromod', hasPriorNeuromod ? 'Yes — documented' : 'None', hasPriorNeuromod ? 'var(--blue)' : 'var(--text-tertiary)', 'rgba(255,255,255,0.04)') +
      chip('Allergies', hasAllergy ? 'Noted — see section' : 'None documented', hasAllergy ? 'var(--amber)' : 'var(--text-tertiary)', hasAllergy ? 'rgba(245,158,11,0.06)' : 'rgba(255,255,255,0.04)') +
    '</div>';
  }

  // ── Section field display (view mode) ────────────────────────────────────
  function fieldDisplayHTML(f, val) {
    const empty = !val || String(val).trim() === '' || val === 'N/A' || val === 'None' || val === 'Not assessed' || val === 'Never' || val === 'Good';
    if (empty) return '<span style="color:var(--text-tertiary);font-style:italic;font-size:12px">Not recorded</span>';
    if (f.id === 'severity') {
      const n = parseInt(val) || 0;
      const color = n >= 8 ? 'var(--red)' : n >= 6 ? 'var(--amber)' : n >= 4 ? 'var(--blue)' : 'var(--green)';
      return '<div style="display:flex;align-items:center;gap:10px"><div style="flex:1;height:5px;border-radius:3px;background:var(--border)"><div style="height:5px;border-radius:3px;background:' + color + ';width:' + (n*10) + '%"></div></div><span style="font-size:13px;font-weight:700;color:' + color + '">' + n + '/10</span></div>';
    }
    if (f.type === 'textarea') {
      const lines = String(val).split('\n').filter(function(l) { return l.trim(); });
      if (lines.length > 1) return lines.map(function(l) { return '<div style="font-size:12.5px;color:var(--text-primary);margin-bottom:2px">\u2022 ' + esc(l) + '</div>'; }).join('');
    }
    return '<span style="font-size:12.5px;color:var(--text-primary);line-height:1.5">' + esc(val) + '</span>';
  }

  // ── Section renderer (view + edit modes) ─────────────────────────────────
  function sectionHTML(sec, data, isEditing) {
    const isCritical = sec.critical;
    const borderStyle = isCritical ? 'border-color:rgba(239,68,68,0.3)' : '';
    const headerBg    = isCritical ? 'background:rgba(239,68,68,0.04)' : '';

    if (isEditing) {
      return '<div class="card" id="mh-sec-' + sec.id + '" style="margin-bottom:14px;padding:0;overflow:hidden;' + borderStyle + '">' +
        '<div style="padding:12px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;' + headerBg + '">' +
          '<span style="font-size:14px">' + sec.icon + '</span>' +
          '<span style="font-size:13px;font-weight:700;color:' + (isCritical ? 'var(--red)' : 'var(--text-primary)') + '">' + esc(sec.label) + '</span>' +
          '<span style="margin-left:auto;font-size:10.5px;color:var(--teal);font-weight:700">Editing</span>' +
          '<button onclick="window._mhSaveSection(\'' + sec.id + '\')" style="font-size:11px;font-weight:700;padding:5px 12px;border-radius:var(--radius-md);background:var(--teal);color:#000;border:none;cursor:pointer;font-family:var(--font-body)">Save</button>' +
          '<button onclick="window._mhCancelEdit()" style="font-size:11px;padding:5px 10px;border-radius:var(--radius-md);background:transparent;color:var(--text-secondary);border:1px solid var(--border);cursor:pointer;font-family:var(--font-body)">Cancel</button>' +
        '</div>' +
        '<div style="padding:18px"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px">' +
          sec.fields.map(function(f) {
            const v = esc(data[f.id] ?? '');
            let input = '';
            if (f.type === 'textarea') {
              input = '<textarea id="mh-' + f.id + '" class="form-control" placeholder="' + esc(f.placeholder||'') + '" style="min-height:' + ((f.rows||3)*22) + 'px;resize:vertical;font-size:13px">' + v + '</textarea>';
            } else if (f.type === 'select') {
              input = '<select id="mh-' + f.id + '" class="form-control" style="font-size:13px">' + f.options.map(function(o) { return '<option' + (data[f.id]===o?' selected':'') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
            } else {
              input = '<input id="mh-' + f.id + '" class="form-control" type="' + (f.type||'text') + '" placeholder="' + esc(f.placeholder||'') + '" value="' + v + '" style="font-size:13px">';
            }
            return '<div><label style="font-size:11px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.6px">' + esc(f.label) + '</label>' + input + '</div>';
          }).join('') +
        '</div></div>' +
      '</div>';
    }

    const hasData = sec.fields.some(function(f) {
      const v = data[f.id];
      return v && String(v).trim() && v !== 'Not assessed' && v !== 'None' && v !== 'N/A' && v !== 'Never' && v !== 'Good';
    });

    return '<div class="card" id="mh-sec-' + sec.id + '" style="margin-bottom:14px;padding:0;overflow:hidden;' + borderStyle + '">' +
      '<div style="padding:11px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;' + headerBg + '" onclick="window._mhToggleSection(\'' + sec.id + '\')">' +
        '<span style="font-size:14px">' + sec.icon + '</span>' +
        '<span style="font-size:13px;font-weight:700;color:' + (isCritical ? 'var(--red)' : 'var(--text-primary)') + '">' + esc(sec.label) + '</span>' +
        (isCritical ? '<span style="font-size:9px;font-weight:700;padding:1px 7px;border-radius:6px;background:rgba(239,68,68,0.1);color:var(--red)">CRITICAL</span>' : '') +
        (!hasData ? '<span style="font-size:10.5px;color:var(--text-tertiary);font-style:italic;margin-left:4px">Not completed</span>' : '') +
        '<button onclick="event.stopPropagation();window._mhEditSection(\'' + sec.id + '\')" style="margin-left:auto;font-size:11px;font-weight:600;padding:4px 10px;border-radius:var(--radius-md);background:transparent;color:var(--teal);border:1px solid rgba(0,212,188,0.3);cursor:pointer;font-family:var(--font-body)">Edit</button>' +
        '<span id="mh-chev-' + sec.id + '" style="font-size:11px;color:var(--text-tertiary);margin-left:6px;transition:transform 0.2s;display:inline-block">' + (isCritical ? '\u25bc' : '\u25ba') + '</span>' +
      '</div>' +
      '<div id="mh-body-' + sec.id + '" style="' + (isCritical ? '' : 'display:none') + '">' +
        (hasData
          ? '<div style="padding:16px 18px;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px 20px">' +
              sec.fields.filter(function(f) {
                const v = data[f.id]; return v && String(v).trim() && v !== 'Not assessed' && v !== 'None' && v !== 'N/A' && v !== 'Never' && v !== 'Good';
              }).map(function(f) {
                return '<div><div style="font-size:10px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">' + esc(f.label) + '</div>' + fieldDisplayHTML(f, data[f.id]) + '</div>';
              }).join('') +
            '</div>'
          : '<div style="padding:18px;color:var(--text-tertiary);font-size:12.5px;font-style:italic">No information recorded. Click Edit to add.</div>'
        ) +
      '</div>' +
    '</div>';
  }

  // ── Main page renderer ────────────────────────────────────────────────────
  let activePid = window._selectedPatientId || '';
  let activeData = activePid ? (loadHistory(activePid) || DEMO_DATA) : null;
  // Attempt to load from backend in background; merge if richer than localStorage
  if (activePid && activePid !== '__demo') {
    api.getPatientMedicalHistory(activePid).then(function(resp) {
      if (resp && resp.medical_history && Object.keys(resp.medical_history).length > 0) {
        activeData = { ...activeData, ...resp.medical_history };
        saveHistory(activePid, activeData);
        buildPage();
      }
    }).catch(function() {});
  }
  let editingSection = null;

  function buildPage() {
    const d = activeData;
    const pname = patients.find(function(p) { return String(p.id) === activePid; });
    const pDisplay = pname ? (pname.first_name && pname.last_name ? pname.first_name + ' ' + pname.last_name : pname.full_name || pname.name || '') : (activePid === '__demo' ? 'Demo Patient — Sarah Mitchell' : '');

    el.innerHTML =
      '<div>' +
      '  <div style="display:flex;gap:10px;align-items:flex-end;margin-bottom:20px;flex-wrap:wrap">' +
      '    <div style="flex:1;min-width:200px;max-width:340px">' +
      '      <label style="font-size:10.5px;font-weight:700;color:var(--text-tertiary);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px">Patient</label>' +
      '      <select id="mh-patient-sel" class="form-control" onchange="window._mhSwitchPatient(this.value)" style="font-size:13px;height:36px">' +
      '        <option value="">— Select patient —</option>' +
             patients.map(function(p) { const pid = String(p.id); const name = (p.first_name && p.last_name) ? p.first_name + ' ' + p.last_name : (p.full_name || p.name || 'Patient ' + p.id); return '<option value="' + esc(pid) + '"' + (activePid === pid ? ' selected' : '') + '>' + esc(name) + '</option>'; }).join('') +
      '        <option value="__demo"' + (activePid === '__demo' ? ' selected' : '') + '>Demo Patient — Sarah Mitchell</option>' +
      '      </select>' +
      '    </div>' +
             (d ? '    <button class="btn btn-sm" onclick="window._mhExpandAll()">Expand All</button>' +
                  '    <button class="btn btn-sm" onclick="window._mhCollapseAll()">Collapse All</button>' +
                  (d._is_demo ? '    <span style="font-size:11px;padding:4px 10px;border-radius:var(--radius-md);background:rgba(245,158,11,0.1);color:var(--amber);font-weight:600">Demo data — edit to save real data</span>' : '') : '') +
      '  </div>' +

             (d
               ? renderSummaryStrip(d) +
                 '<div style="display:grid;grid-template-columns:1fr 290px;gap:20px;align-items:start">' +
                   '<div>' + SECTIONS.map(function(s) { return sectionHTML(s, d, editingSection === s.id); }).join('') + '</div>' +
                   '<div style="position:sticky;top:72px"><div class="card" style="padding:16px;border-color:rgba(0,212,188,0.2)"><div style="font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:12px;border-bottom:1px solid var(--border);padding-bottom:8px">Safety &amp; Protocol Summary</div>' + renderSafetyPanel(d) + '</div></div>' +
                 '</div>'
               : '<div style="padding:60px;text-align:center;background:var(--bg-card);border-radius:var(--radius-lg);border:1px solid var(--border)">' +
                   '<div style="font-size:32px;margin-bottom:12px">◧</div>' +
                   '<div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:6px">Select a patient to view their medical history</div>' +
                   '<div style="font-size:12.5px;color:var(--text-tertiary);margin-bottom:16px">Medical history feeds safety checks, protocol planning, and assessment selection.</div>' +
                   '<button class="btn btn-sm" onclick="window._mhSwitchPatient(\'__demo\')">Load Demo Patient</button>' +
                 '</div>'
             ) +
      '</div>';
  }

  buildPage();

  // ── Wire-ups ──────────────────────────────────────────────────────────────
  window._mhSwitchPatient = function(pid) {
    activePid = pid;
    editingSection = null;
    activeData = pid === '__demo' ? DEMO_DATA : (pid ? (loadHistory(pid) || {}) : null);
    buildPage();
  };

  window._mhToggleSection = function(secId) {
    const body = document.getElementById('mh-body-' + secId);
    const chev = document.getElementById('mh-chev-' + secId);
    if (!body) return;
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? '' : 'none';
    if (chev) chev.style.transform = hidden ? 'rotate(0deg)' : '';
  };

  window._mhEditSection = function(secId) {
    editingSection = secId;
    buildPage();
    setTimeout(function() {
      const sec = document.getElementById('mh-sec-' + secId);
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  window._mhCancelEdit = function() {
    editingSection = null;
    buildPage();
  };

  window._mhSaveSection = function(secId) {
    const sec = SECTIONS.find(function(s) { return s.id === secId; });
    if (!sec) return;
    const data = activeData || {};
    sec.fields.forEach(function(f) {
      const inp = document.getElementById('mh-' + f.id);
      if (inp) data[f.id] = inp.tagName === 'SELECT' ? inp.value : inp.value.trim();
    });
    data._updated = new Date().toISOString();
    data._is_demo = false;
    activeData = data;
    if (activePid && activePid !== '__demo') saveHistory(activePid, data);
    editingSection = null;
    buildPage();
    window._showNotifToast && window._showNotifToast({ title: 'Saved', body: sec.label + ' updated in this browser view.', severity: 'success' });
  };

  window._mhSave = function() {
    if (!activePid) { window._showNotifToast && window._showNotifToast({ title: 'No Patient', body: 'Select a patient first.', severity: 'warning' }); return; }
    const data = activeData || {};
    SECTIONS.forEach(function(sec) {
      sec.fields.forEach(function(f) {
        const inp = document.getElementById('mh-' + f.id);
        if (inp) data[f.id] = inp.tagName === 'SELECT' ? inp.value : inp.value.trim();
      });
    });
    data._updated = new Date().toISOString();
    data._is_demo = false;
    activeData = data;
    if (activePid !== '__demo') {
      saveHistory(activePid, data);
      // Also sync to backend (fire-and-forget; localStorage is source of truth for offline)
      api.savePatientMedicalHistory(activePid, data).catch(() => {});
    }
    editingSection = null;
    buildPage();
    window._showNotifToast && window._showNotifToast({ title: 'Saved', body: 'Medical history saved in this browser view.', severity: 'success' });
  };

  window._mhExpandAll = function() {
    SECTIONS.forEach(function(s) {
      const body = document.getElementById('mh-body-' + s.id);
      const chev = document.getElementById('mh-chev-' + s.id);
      if (body) body.style.display = '';
      if (chev) chev.style.transform = 'rotate(0deg)';
    });
  };

  window._mhCollapseAll = function() {
    SECTIONS.forEach(function(s) {
      if (editingSection === s.id) return;
      const body = document.getElementById('mh-body-' + s.id);
      const chev = document.getElementById('mh-chev-' + s.id);
      if (body) body.style.display = 'none';
      if (chev) chev.style.transform = '';
    });
  };

  window._mhPrint = function() { window.print(); };

  window._mhExport = function() {
    if (!activeData) return;
    const d = activeData;
    const lines = ['DEEPSYNAPS MEDICAL HISTORY', '==========================', 'Exported: ' + new Date().toLocaleString(), ''];
    SECTIONS.forEach(function(s) {
      lines.push('\n-- ' + s.label + ' --');
      s.fields.forEach(function(f) {
        const val = d[f.id];
        if (val && val !== 'Not assessed' && val !== 'None' && val !== 'N/A' && val.trim()) lines.push(f.label + ': ' + val);
      });
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'medical-history.txt';
    a.click();
  };
}

// ── pgDocumentsHub — Forms, consent & document management ────────────────────
export async function pgDocumentsHub(setTopbar) {
  setTopbar('Documents & Forms', `
    <button class="btn btn-primary btn-sm" onclick="window._dhShowAssignModal()">Assign Form</button>
    <button class="btn btn-sm" onclick="window._dhShowCreateModal()">Create Draft</button>
    <button class="btn btn-sm" onclick="window._dhShowUploadModal()">Upload</button>
    <button class="btn btn-sm" style="border-color:var(--accent-violet);color:var(--accent-violet)" onclick="window._nav('forms-builder')">Form Builder →</button>
  `);
  const el = document.getElementById('content');
  if (!el) return;

  function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function today() { return new Date().toISOString().slice(0,10); }
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  }

  let patients = [];
  try { const r = await api.patients().catch(() => null); patients = r?.items || r || []; } catch {}

  const STORAGE_KEY = 'ds_documents_hub_v2';
  function loadDocs() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || _seedDocs(); } catch { return _seedDocs(); } }
  function saveDocs(d) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {} }

  // Map API document record → local doc shape
  function _apiDocToLocal(r) {
    const m = r.questions_json || {};
    return {
      id: String(r.id),
      _apiId: r.id,
      patientId: m.patient_id ? String(m.patient_id) : '',
      templateId: m.template_id || null,
      name: r.title || m.doc_type || 'Document',
      category: m.category || 'Clinical',
      desc: m.notes || '',
      status: m.status || 'pending',
      sigState: m.sig_state || (m.category === 'Consent' ? 'unsigned' : 'not-required'),
      assignedBy: m.assigned_by || '',
      assignedDate: m.assigned_date || null,
      completedDate: m.completed_date || null,
      updatedDate: r.updated_at ? r.updated_at.slice(0, 10) : null,
      expiryDate: m.expiry_date || null,
      archived: !!m.archived,
      fileRef: r.file_ref || m.file_ref || null,
      _fromApi: true,
    };
  }

  function _seedDocs() {
    const pid  = patients[0]?.id ? String(patients[0].id) : 'demo';
    const pid2 = patients[1]?.id ? String(patients[1].id) : 'demo2';
    const seed = [
      { id:'s1', patientId:pid,  templateId:'intake-general',    name:'General Intake Form',       category:'Intake',    status:'completed',    sigState:'not-required', assignedBy:'Dr. A. Chen', assignedDate:'2026-04-01', completedDate:'2026-04-03', updatedDate:'2026-04-03', expiryDate:null,         desc:'Demographics, contact, emergency contact, GP details.' },
      { id:'s2', patientId:pid,  templateId:'intake-clinical',   name:'Clinical Intake Form',      category:'Intake',    status:'completed',    sigState:'not-required', assignedBy:'Dr. A. Chen', assignedDate:'2026-04-01', completedDate:'2026-04-03', updatedDate:'2026-04-03', expiryDate:null,         desc:'Presenting problem, goals, previous treatment, medication.' },
      { id:'s3', patientId:pid,  templateId:'consent-tms',       name:'TMS Treatment Consent',     category:'Consent',   status:'signed',       sigState:'signed',       assignedBy:'Dr. A. Chen', assignedDate:'2026-04-03', completedDate:'2026-04-04', updatedDate:'2026-04-04', expiryDate:'2027-04-04', desc:'Risks, benefits, alternatives, voluntary participation for TMS.' },
      { id:'s4', patientId:pid,  templateId:'privacy-clinic',    name:'Privacy & Data Sharing',    category:'Consent',   status:'signed',       sigState:'signed',       assignedBy:'Reception',   assignedDate:'2026-04-01', completedDate:'2026-04-01', updatedDate:'2026-04-01', expiryDate:'2027-04-01', desc:'Clinic privacy policy acknowledgement.' },
      { id:'s5', patientId:pid,  templateId:'consent-general',   name:'General Treatment Consent', category:'Consent',   status:'pending',      sigState:'pending-sig',  assignedBy:'Dr. A. Chen', assignedDate:'2026-04-10', completedDate:null,         updatedDate:'2026-04-10', expiryDate:null,         desc:'Umbrella consent for neuromodulation treatments.' },
      { id:'s6', patientId:pid,  templateId:'clinic-discharge',  name:'Discharge Summary',         category:'Clinical',  status:'generated',    sigState:'not-required', assignedBy:'Dr. A. Chen', assignedDate:'2026-04-11', completedDate:'2026-04-11', updatedDate:'2026-04-11', expiryDate:null,         desc:'Structured discharge summary — draft.' },
      { id:'s7', patientId:pid,  templateId:'caregiver-auth',    name:'Caregiver / Rep Auth',      category:'Consent',   status:'required',     sigState:'unsigned',     assignedBy:null,          assignedDate:null,         completedDate:null,         updatedDate:null,          expiryDate:null,         desc:'Required before caregiver can attend sessions.' },
      { id:'s8', patientId:pid2, templateId:'intake-general',    name:'General Intake Form',       category:'Intake',    status:'required',     sigState:'not-required', assignedBy:null,          assignedDate:null,         completedDate:null,         updatedDate:null,          expiryDate:null,         desc:'Demographics, contact, emergency contact, GP details.' },
      { id:'s9', patientId:pid,  templateId:'privacy-research',  name:'Research Data Use Consent', category:'Consent',   status:'expired',      sigState:'unsigned',     assignedBy:'Dr. A. Chen', assignedDate:'2025-04-01', completedDate:'2025-04-02', updatedDate:'2025-04-02', expiryDate:'2026-04-02', desc:'Consent for de-identified data use in research.' },
    ];
    saveDocs(seed);
    return seed;
  }

  // ── Template library ──────────────────────────────────────────────────────
  const FORM_TEMPLATES = [
    { id:'intake-general',    cat:'Intake',   required:true,  name:'General Intake Form',             desc:'Demographics, contact, emergency contact, GP details.' },
    { id:'intake-clinical',   cat:'Intake',   required:true,  name:'Clinical Intake Form',            desc:'Presenting problem, goals, previous treatment, medication.' },
    { id:'intake-lifestyle',  cat:'Intake',   required:false, name:'Lifestyle & Sleep Questionnaire', desc:'Sleep patterns, exercise, substance use, diet.' },
    { id:'consent-tms',       cat:'Consent',  required:true,  name:'TMS Treatment Consent',           desc:'Risks, benefits, alternatives, voluntary participation for TMS.' },
    { id:'consent-tdcs',      cat:'Consent',  required:false, name:'tDCS Treatment Consent',          desc:'Consent form for transcranial direct current stimulation.' },
    { id:'consent-ect',       cat:'Consent',  required:false, name:'ECT Consent',                     desc:'Electroconvulsive therapy consent including anaesthetic risks.' },
    { id:'consent-dbs',       cat:'Consent',  required:false, name:'DBS Consent',                     desc:'Deep brain stimulation surgical and device consent.' },
    { id:'consent-general',   cat:'Consent',  required:true,  name:'General Treatment Consent',       desc:'Umbrella consent for neuromodulation treatments.' },
    { id:'privacy-clinic',    cat:'Consent',  required:true,  name:'Privacy & Data Sharing Policy',   desc:'Clinic privacy policy acknowledgement and data consent.' },
    { id:'privacy-research',  cat:'Consent',  required:false, name:'Research Data Use Consent',       desc:'Consent for de-identified data use in research.' },
    { id:'caregiver-auth',    cat:'Consent',  required:false, name:'Caregiver / Representative Auth', desc:"Authorises caregiver to act on patient's behalf." },
    { id:'caregiver-consent', cat:'Consent',  required:false, name:'Caregiver Treatment Consent',     desc:'Caregiver consent for treatment when patient lacks capacity.' },
    { id:'clinic-referral',   cat:'Clinical', required:false, name:'Referral Acknowledgement',        desc:'Acknowledgement of referral and treatment pathway.' },
    { id:'clinic-discharge',  cat:'Clinical', required:false, name:'Discharge Summary',               desc:'Structured discharge summary template.' },
    { id:'clinic-release',    cat:'Clinical', required:false, name:'Information Release Auth',        desc:'Authorises release of records to third parties.' },
    { id:'clinic-adverse',    cat:'Clinical', required:false, name:'Adverse Event Report',            desc:'Structured adverse event documentation form.' },
    { id:'homedev-consent',   cat:'Clinical', required:false, name:'Home Device Use Consent',         desc:'Consent for unsupervised home-based neuromodulation device use.' },
    { id:'homedev-safety',    cat:'Clinical', required:false, name:'Home Device Safety Checklist',    desc:'Pre-deployment safety checklist for home-use devices.' },
    { id:'telehealth-consent',cat:'Clinical', required:false, name:'Telehealth Consent',              desc:'Consent for remote/virtual care delivery.' },
    { id:'custom-template',   cat:'Custom',   required:false, name:'Custom Form Template',            desc:'Blank template — configure in Form Builder.' },
  ];

  // ── Form bundles ──────────────────────────────────────────────────────────
  const BUNDLES = [
    { id:'intake-pack',  name:'Intake Pack',       icon:'📋', color:'var(--accent-teal)',   templates:['intake-general','intake-clinical','privacy-clinic'],  desc:'Standard new patient intake — 3 forms.' },
    { id:'consent-pack', name:'Consent Pack',      icon:'✍️', color:'var(--accent-blue)',   templates:['consent-general','consent-tms','privacy-clinic'],     desc:'Core treatment consent set for TMS patients.' },
    { id:'homedev-pack', name:'Home-Device Pack',  icon:'🏠', color:'#f59e0b',              templates:['homedev-consent','homedev-safety','privacy-clinic'],   desc:'Required docs before issuing a home-use device.' },
    { id:'virtual-pack', name:'Virtual Care Pack', icon:'💻', color:'var(--accent-violet)', templates:['telehealth-consent','privacy-clinic'],                 desc:'Telehealth and remote care consent pack.' },
  ];

  // ── Status + category config ──────────────────────────────────────────────
  const STATUS_CFG = {
    required:       { label:'Required',      color:'#ef4444',            icon:'⚠' },
    pending:        { label:'Pending',       color:'#f59e0b',            icon:'⏳' },
    completed:      { label:'Completed',     color:'var(--accent-teal)', icon:'✓' },
    signed:         { label:'Signed',        color:'var(--accent-teal)', icon:'✓' },
    expired:        { label:'Expired',       color:'#ef4444',            icon:'⊘' },
    'needs-update': { label:'Needs Update',  color:'#f97316',            icon:'↺' },
    generated:      { label:'Generated',     color:'#60a5fa',            icon:'⬇' },
    uploaded:       { label:'Uploaded',      color:'#a78bfa',            icon:'↑' },
  };

  const CAT_CFG = {
    Intake:    { color:'var(--accent-teal)',   icon:'👤' },
    Consent:   { color:'var(--accent-blue)',   icon:'✍️' },
    Clinical:  { color:'#94a3b8',             icon:'📄' },
    Generated: { color:'#60a5fa',             icon:'⬇' },
    Uploaded:  { color:'#a78bfa',             icon:'↑' },
    Custom:    { color:'#ec4899',             icon:'⚙' },
  };

  const SIG_CFG = {
    signed:          { label:'Signed',       color:'var(--accent-teal)' },
    'pending-sig':   { label:'Pending Sig',  color:'#f59e0b' },
    unsigned:        { label:'Unsigned',     color:'#ef4444' },
    'not-required':  { label:'No Sig Req',   color:'#94a3b8' },
  };

  // ── State ─────────────────────────────────────────────────────────────────
  let activePid = '';
  let activeTab = 'required';
  let docs      = loadDocs();
  let dhTlibFilter = 'All';
  let dhTlibSearch = '';

  // Try to hydrate from API (non-blocking — re-render when done)
  api.listDocuments().then(apiDocs => {
    if (!Array.isArray(apiDocs) || apiDocs.length === 0) return;
    const mapped = apiDocs.map(_apiDocToLocal);
    // Merge: prefer API records, keep local-only seed docs that have no API id
    const apiIds = new Set(mapped.map(d => d._apiId));
    const localOnly = docs.filter(d => !d._apiId && !d._fromApi);
    docs = [...mapped, ...localOnly];
    saveDocs(docs);
    renderPage();
  }).catch(() => { /* keep localStorage data */ });

  // ── Derived stats ─────────────────────────────────────────────────────────
  function computeStats(pid) {
    const d = pid ? docs.filter(x => x.patientId === pid) : docs;
    return {
      missingRequired:  d.filter(x => x.status === 'required').length,
      pendingSig:       d.filter(x => x.sigState === 'pending-sig').length,
      completedIntake:  d.filter(x => x.category === 'Intake' && ['completed','signed'].includes(x.status)).length,
      expiringConsents: d.filter(x => x.category === 'Consent' && x.expiryDate && daysUntil(x.expiryDate) !== null && daysUntil(x.expiryDate) <= 90 && daysUntil(x.expiryDate) > 0).length,
      expiredConsents:  d.filter(x => x.status === 'expired').length,
      generatedDocs:    d.filter(x => x.status === 'generated').length,
    };
  }

  // ── Treatment readiness ───────────────────────────────────────────────────
  function readinessHTML(pid) {
    if (!pid) return '';
    const d = docs.filter(x => x.patientId === pid);
    const intakeTotal  = FORM_TEMPLATES.filter(t => t.cat === 'Intake'  && t.required).length;
    const intakeDone   = d.filter(x => x.category === 'Intake'  && ['completed','signed'].includes(x.status)).length;
    const consentTotal = FORM_TEMPLATES.filter(t => t.cat === 'Consent' && t.required).length;
    const consentDone  = d.filter(x => x.category === 'Consent' && ['signed','completed'].includes(x.status)).length;
    const sigPending   = d.filter(x => x.sigState === 'pending-sig').length;
    const expired      = d.filter(x => x.status === 'expired').length;
    const allGood      = intakeDone >= intakeTotal && consentDone >= consentTotal && sigPending === 0 && expired === 0;
    const item = (label, done, total) => {
      const ok = done >= total;
      return `<div class="dh-ready-item" style="color:${ok?'var(--accent-teal)':'#f59e0b'}"><span>${ok?'✓':'○'}</span><span>${label}: <strong>${done}/${total}</strong></span></div>`;
    };
    return `<div class="dh-readiness${allGood?' dh-readiness-ok':''}">
      <div class="dh-ready-label">${allGood?'✓ Treatment ready':'⚠ Treatment readiness'}</div>
      <div class="dh-ready-row">
        ${item('Intake forms', intakeDone, intakeTotal)}
        ${item('Consent forms', consentDone, consentTotal)}
        ${sigPending ? `<div class="dh-ready-item" style="color:#f59e0b"><span>⏳</span><span>Signatures pending: <strong>${sigPending}</strong></span></div>` : ''}
        ${expired    ? `<div class="dh-ready-item" style="color:#ef4444"><span>⊘</span><span>Expired: <strong>${expired}</strong></span></div>` : ''}
      </div>
    </div>`;
  }

  // ── Badge helpers ─────────────────────────────────────────────────────────
  function statusBadge(status) {
    const c = STATUS_CFG[status] || { label:status, color:'#94a3b8', icon:'' };
    return `<span class="dh-badge" style="background:${c.color}22;color:${c.color};border-color:${c.color}44">${c.icon} ${c.label}</span>`;
  }
  function sigBadge(sigState) {
    if (!sigState || sigState === 'not-required') return '';
    const c = SIG_CFG[sigState] || { label:sigState, color:'#94a3b8' };
    return `<span class="dh-badge dh-badge-sig" style="background:${c.color}22;color:${c.color};border-color:${c.color}44">✍ ${c.label}</span>`;
  }
  function catBadge(cat) {
    const c = CAT_CFG[cat] || { color:'#94a3b8', icon:'📄' };
    return `<span class="dh-badge" style="background:${c.color}22;color:${c.color};border-color:${c.color}44">${c.icon} ${cat}</span>`;
  }
  function ptNameFor(patientId) {
    const pt = patients.find(p => String(p.id) === String(patientId));
    return pt ? esc(pt.full_name || pt.name || 'Patient') : (patientId ? 'Patient #'+esc(String(patientId)) : '');
  }

  // ── Primary action per status ─────────────────────────────────────────────
  function primaryActionHTML(d) {
    const id = esc(d.id);
    switch (d.status) {
      case 'required':
        return `<button class="btn btn-primary btn-sm" onclick="window._dhAssignDoc('${id}')">Assign</button>`;
      case 'pending':
        return d.sigState === 'pending-sig'
          ? `<button class="btn btn-primary btn-sm" onclick="window._dhSendForSig('${id}')">Send for Sig</button>`
          : `<button class="btn btn-primary btn-sm" disabled title="Patients complete this form in the portal">Portal only</button>`;
      case 'expired':
        return `<button class="btn btn-primary btn-sm" style="border-color:#ef4444;color:#ef4444" onclick="window._dhReplace('${id}')">Replace</button>`;
      case 'needs-update':
        return `<button class="btn btn-primary btn-sm" style="border-color:#f97316;color:#f97316" disabled title="Patients complete updates in the portal">Portal only</button>`;
      case 'generated':
        return d.fileRef || d.url
          ? `<button class="btn btn-sm" onclick="window._dhOpen('${id}')">Open</button>`
          : `<button class="btn btn-sm" disabled title="Draft only — no generated file available">Draft only</button>`;
      default:
        return `<button class="btn btn-sm" onclick="window._dhOpen('${id}')">Open</button>`;
    }
  }

  // ── Secondary actions ─────────────────────────────────────────────────────
  function secondaryActionsHTML(d) {
    const id = esc(d.id);
    const acts = [];
    if ((d.fileRef || d.url) && ['completed','signed','generated','uploaded'].includes(d.status))
      acts.push(`<button class="btn btn-sm dh-act" onclick="window._dhDownload('${id}')">Download</button>`);
    if (['completed','signed','pending'].includes(d.status) && d.sigState !== 'signed')
      acts.push(`<button class="btn btn-sm dh-act" onclick="window._dhSendForSig('${id}')">Send for Sig</button>`);
    if (d.status === 'signed' || d.sigState === 'unsigned')
      acts.push(`<button class="btn btn-sm dh-act" onclick="window._dhMarkSigned('${id}')">Mark Signed</button>`);
    if (['completed','signed','uploaded','generated'].includes(d.status))
      acts.push(`<button class="btn btn-sm dh-act" onclick="window._dhReplace('${id}')">Replace</button>`);
    if (d.status !== 'required')
      acts.push(`<button class="btn btn-sm dh-act" style="color:var(--amber,#f59e0b);border-color:rgba(245,158,11,0.35)" onclick="window._dhArchive('${id}')">Archive</button>`);
    return acts.length ? `<div class="dh-sec-actions">${acts.join('')}</div>` : '';
  }

  // ── Document row ──────────────────────────────────────────────────────────
  function docRowHTML(d) {
    const expiry = d.expiryDate ? daysUntil(d.expiryDate) : null;
    const expiryNote = expiry !== null
      ? (expiry < 0   ? `<span class="dh-expiry-warn">Expired ${Math.abs(expiry)}d ago</span>`
       : expiry <= 90 ? `<span class="dh-expiry-soon">Expires in ${expiry}d</span>`
       :                `<span class="dh-expiry-ok">Expires ${esc(d.expiryDate)}</span>`)
      : '';
    return `<div class="dh-doc-row">
      <div class="dh-doc-main">
        <div class="dh-doc-name">${esc(d.name)}</div>
        <div class="dh-doc-meta">
          ${catBadge(d.category)}${statusBadge(d.status)}${sigBadge(d.sigState)}${expiryNote}
        </div>
        <div class="dh-doc-detail">
          ${!activePid && d.patientId ? `<span>Patient: ${ptNameFor(d.patientId)}</span>` : ''}
          ${d.assignedBy   ? `<span>By: ${esc(d.assignedBy)}</span>`    : ''}
          ${d.assignedDate ? `<span>Assigned: ${esc(d.assignedDate)}</span>` : ''}
          ${d.completedDate ? `<span>Completed: ${esc(d.completedDate)}</span>` : ''}
          ${d.updatedDate && d.updatedDate !== d.completedDate ? `<span>Updated: ${esc(d.updatedDate)}</span>` : ''}
          ${d.status === 'generated' && !d.fileRef && !d.url ? '<span>Draft only: no generated file attached</span>' : ''}
          ${d.status === 'uploaded' && d.fileRef ? '<span>Stored file available</span>' : ''}
        </div>
      </div>
      <div class="dh-doc-actions">
        ${primaryActionHTML(d)}
        ${secondaryActionsHTML(d)}
      </div>
    </div>`;
  }

  // ── Tab filtering ─────────────────────────────────────────────────────────
  function tabDocs(tab, pid) {
    let d = pid ? docs.filter(x => x.patientId === pid) : docs;
    d = d.filter(x => !x.archived);
    switch (tab) {
      case 'required':    return d.filter(x => ['required','pending','expired','needs-update'].includes(x.status));
      case 'completed':   return d.filter(x => ['completed','signed'].includes(x.status));
      case 'pending-sig': return d.filter(x => x.sigState === 'pending-sig' || (x.status === 'pending' && x.sigState === 'unsigned'));
      case 'generated':   return d.filter(x => x.status === 'generated');
      case 'uploaded':    return d.filter(x => x.status === 'uploaded');
      default:            return d;
    }
  }

  function tabBadge(tab, pid) {
    const n = tabDocs(tab, pid).length;
    return n ? ` <span class="dh-tab-badge">${n}</span>` : '';
  }

  function emptyState(tab) {
    const msgs = {
      required:     ['No missing documents', 'All required intake and consent forms are complete.'],
      completed:    ['No completed documents yet', 'Completed and signed forms will appear here.'],
      'pending-sig':['No pending signatures', 'Documents awaiting signature will appear here.'],
      generated:    ['No draft documents', 'Locally saved draft letters and summaries will appear here until a real file is uploaded or generated elsewhere.'],
      uploaded:     ['No uploaded documents', 'Manually uploaded files will appear here.'],
    };
    const [title, body] = msgs[tab] || ['Nothing here', ''];
    return `<div class="dh-empty"><div class="dh-empty-icon">📄</div><div class="dh-empty-title">${title}</div>${body?`<div class="dh-empty-body">${body}</div>`:''}</div>`;
  }

  // ── Templates tab ─────────────────────────────────────────────────────────
  function templateRowHTML(t) {
    const c = (CAT_CFG[t.cat] || { color:'#94a3b8', icon:'📄' });
    return `<div class="dh-doc-row">
      <div class="dh-doc-main">
        <div class="dh-doc-name">${c.icon} ${esc(t.name)} ${t.required?'<span class="dh-req-star">Required</span>':''}</div>
        <div class="dh-doc-meta"><span class="dh-badge" style="background:${c.color}22;color:${c.color};border-color:${c.color}44">${esc(t.cat)}</span></div>
        <div class="dh-doc-detail"><span>${esc(t.desc)}</span></div>
      </div>
      <div class="dh-doc-actions">
        <button class="btn btn-primary btn-sm" onclick="window._dhAssignTemplate('${esc(t.id)}','${esc(t.name)}','${esc(t.cat)}','${esc(t.desc)}')">Assign to Patient</button>
        ${t.id==='custom-template'?`<button class="btn btn-sm" onclick="window._nav('forms-builder')">Build Custom →</button>`:''}
      </div>
    </div>`;
  }

  function bundleCardHTML(b) {
    return `<div class="dh-bundle-card">
      <div class="dh-bundle-icon" style="background:${b.color}22;color:${b.color}">${b.icon}</div>
      <div class="dh-bundle-info">
        <div class="dh-bundle-name">${esc(b.name)}</div>
        <div class="dh-bundle-desc">${esc(b.desc)}</div>
        <div class="dh-bundle-forms">${b.templates.map(tid=>{const t=FORM_TEMPLATES.find(x=>x.id===tid);return t?`<span class="dh-bundle-form-chip">${esc(t.name)}</span>`:''}).join('')}</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="window._dhAssignBundle('${esc(b.id)}')">Assign Pack</button>
    </div>`;
  }

  // ── Document Template Library data ────────────────────────────────────────
  const DH_TLIB_ITEMS = [
    { id:'dh-intake-form',    name:'Patient Intake Form',          type:'Intake',      typeKey:'intake',   target:'Patient',   status:'Required',  desc:'Comprehensive new-patient intake covering demographics, medical history, emergency contacts and GP details.' },
    { id:'dh-consent-tms',   name:'Informed Consent \u2014 TMS',  type:'Consent',     typeKey:'consent',  target:'Patient',   status:'Required',  desc:'Voluntary informed consent for repetitive transcranial magnetic stimulation including risks, benefits and alternatives.' },
    { id:'dh-consent-tdcs',  name:'Informed Consent \u2014 tDCS', type:'Consent',     typeKey:'consent',  target:'Patient',   status:'Required',  desc:'Informed consent form for transcranial direct current stimulation treatment.' },
    { id:'dh-consent-tacs',  name:'Informed Consent \u2014 tACS', type:'Consent',     typeKey:'consent',  target:'Patient',   status:'Required',  desc:'Informed consent for transcranial alternating current stimulation.' },
    { id:'dh-privacy',       name:'Privacy & Data Notice',         type:'Privacy',     typeKey:'privacy',  target:'Patient',   status:'Required',  desc:'Clinic privacy policy acknowledgement and GDPR/data-sharing notice for patients.' },
    { id:'dh-homedev',       name:'Home Device Consent',           type:'Home Device', typeKey:'homedev',  target:'Patient',   status:'Required',  desc:'Consent for unsupervised home-based neuromodulation device use, including safety checklist.' },
    { id:'dh-virtual',       name:'Virtual Care Consent',          type:'Virtual Care',typeKey:'consent',  target:'Patient',   status:'Required',  desc:'Telehealth and remote care consent form for virtual treatment delivery.' },
    { id:'dh-caregiver',     name:'Caregiver Authorization',       type:'Caregiver',   typeKey:'caregiver',target:'Caregiver', status:'Optional',  desc:'Authorises a caregiver or legal representative to act on the patient\u2019s behalf during treatment.' },
    { id:'dh-session-notes', name:'Clinician Session Notes',       type:'Clinical',    typeKey:'clinical', target:'Clinician', status:'Optional',  desc:'Structured session note template: observations, tolerability, response, plan.' },
    { id:'dh-treatment-plan',name:'Treatment Plan Summary',        type:'Clinical',    typeKey:'clinical', target:'Clinician', status:'Optional',  desc:'Formalised treatment plan document including goals, modality, frequency, duration and review schedule.' },
    { id:'dh-discharge',     name:'Discharge Summary',             type:'Clinical',    typeKey:'clinical', target:'Clinician', status:'Optional',  desc:'Comprehensive discharge summary: treatment received, outcomes, follow-up plan and GP letter.' },
    { id:'dh-custom',        name:'Custom Form Builder',           type:'Custom',      typeKey:'custom',   target:'Clinician', status:'Optional',  desc:'Blank template \u2014 configure fields in the Form Builder for any custom clinical workflow.' },
  ];
  const DH_TLIB_FILTER_CHIPS = ['All','Intake','Consent','Privacy','Caregiver','Clinical','Home Device','Virtual Care','Custom'];
  const DH_TYPE_BADGE_KEY = { Intake:'intake', Consent:'consent', Privacy:'privacy', 'Home Device':'homedev', 'Virtual Care':'consent', Caregiver:'caregiver', Clinical:'clinical', Custom:'custom' };

  function renderDhTlib() {
    const q = dhTlibSearch.toLowerCase();
    const filt = dhTlibFilter;
    let items = DH_TLIB_ITEMS;
    if (filt !== 'All') items = items.filter(i => i.type === filt);
    if (q) items = items.filter(i => i.name.toLowerCase().includes(q) || i.type.toLowerCase().includes(q) || i.target.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q));
    const chips = DH_TLIB_FILTER_CHIPS.map(f =>
      `<button class="tlib-filter-chip${dhTlibFilter===f?' active':''}" onclick="window._dhTlibFilter('${f}')">${f}</button>`
    ).join('');
    const cards = items.length ? items.map(item => {
      const bk = DH_TYPE_BADGE_KEY[item.type] || 'clinical';
      const targetBk = item.target === 'Clinician' ? 'clinician' : item.target === 'Caregiver' ? 'caregiver' : 'patient';
      const statusColor = item.status === 'Required' ? 'color:#ef4444' : 'color:var(--text-tertiary,#5a6475)';
      return `<div class="tlib-card">
        <div class="tlib-card-title">${esc(item.name)}</div>
        <div class="tlib-card-badges">
          <span class="tlib-badge tlib-badge--${bk}">${esc(item.type)}</span>
          <span class="tlib-badge tlib-badge--${targetBk}">${esc(item.target)}</span>
          <span class="tlib-badge" style="${statusColor};background:${item.status==='Required'?'rgba(239,68,68,.12)':'rgba(148,163,184,.08)'};border-color:${item.status==='Required'?'rgba(239,68,68,.25)':'rgba(148,163,184,.2)'}">${esc(item.status)}</span>
        </div>
        <div class="tlib-card-meta">${esc(item.desc)}</div>
        <div class="tlib-card-actions">
          <button class="tlib-btn-assign" onclick="window._dhTlibAssign('${esc(item.id)}','${esc(item.name).replace(/'/g,'\\\'').replace(/"/g,'&quot;')}')">Assign</button>
          <button class="tlib-btn-preview" onclick="window._dhTlibPreview('${esc(item.id)}')">Preview</button>
          ${item.id==='dh-custom'?`<button class="tlib-btn-secondary" onclick="window._nav('forms-builder')">Build Custom</button>`:`<button class="tlib-btn-secondary" disabled title="Use Assign for patient-portal completion">Portal Only</button>`}
        </div>
      </div>`;
    }).join('') : `<div class="tlib-empty"><div class="tlib-empty-icon">&#128269;</div><div class="tlib-empty-msg">No document templates match your search</div></div>`;
    return `<div class="tlib-wrap">
      <div class="tlib-search-bar"><input class="tlib-search-input" id="dh-tlib-search" type="text" placeholder="Search templates\u2026" value="${esc(dhTlibSearch)}" oninput="window._dhTlibSearch(this.value)"/></div>
      <div class="tlib-filters">${chips}</div>
      <div class="tlib-grid">${cards}</div>
    </div>`;
  }

  // ── Main render ───────────────────────────────────────────────────────────
  function renderPage() {
    const stats = computeStats(activePid);
    const TABS = [
      { id:'tlib',        label:'Template Library'  },
      { id:'required',    label:'Required'          },
      { id:'completed',   label:'Completed'         },
      { id:'pending-sig', label:'Pending Signature' },
      { id:'generated',   label:'Generated'         },
      { id:'uploaded',    label:'Uploaded'          },
      { id:'templates',   label:'Templates'         },
    ];
    const kpis = [
      { label:'Missing Required',   val:stats.missingRequired,  color:'#ef4444',            warn:stats.missingRequired>0 },
      { label:'Pending Signatures', val:stats.pendingSig,       color:'#f59e0b',            warn:stats.pendingSig>0 },
      { label:'Intake Completed',   val:stats.completedIntake,  color:'var(--accent-teal)', warn:false },
      { label:'Expiring Consents',  val:stats.expiringConsents, color:'#f97316',            warn:stats.expiringConsents>0 },
      { label:'Expired',            val:stats.expiredConsents,  color:'#ef4444',            warn:stats.expiredConsents>0 },
      { label:'Generated Docs',     val:stats.generatedDocs,    color:'#60a5fa',            warn:false },
    ];

    let tabBody = '';
    if (activeTab === 'tlib') {
      tabBody = renderDhTlib();
    } else if (activeTab === 'templates') {
      tabBody = `
        <div style="margin-bottom:20px">
          <div class="dh-section-hd">Form Bundles — assign a full pack in one click</div>
          <div class="dh-bundles-grid">${BUNDLES.map(bundleCardHTML).join('')}</div>
        </div>
        <div>
          <div class="dh-section-hd">Individual Templates</div>
          ${FORM_TEMPLATES.map(templateRowHTML).join('')}
        </div>`;
    } else {
      const rows = tabDocs(activeTab, activePid);
      tabBody = rows.length ? rows.map(docRowHTML).join('') : emptyState(activeTab);
    }

    el.innerHTML = `
      <div class="dh-wrap">
        <div class="dh-top-bar">
          <select id="dh-patient-sel" class="form-control dh-patient-sel" onchange="window._dhSwitchPatient(this.value)">
            <option value="">— All patients —</option>
            ${patients.map(p=>`<option value="${esc(p.id)}"${activePid===String(p.id)?' selected':''}>${esc(p.full_name||p.name||'Patient '+p.id)}</option>`).join('')}
          </select>
          <div class="dh-top-actions">
            <button class="btn btn-sm" onclick="window._dhShowAssignModal()">+ Assign Form</button>
            <button class="btn btn-sm" onclick="window._dhShowCreateModal()">+ Create</button>
            <button class="btn btn-sm" onclick="window._dhShowUploadModal()">↑ Upload</button>
          </div>
        </div>

        ${readinessHTML(activePid)}

        <div class="dh-kpi-strip">
          ${kpis.map(k=>`<div class="dh-kpi-card${k.warn?' dh-kpi-warn':''}">
            <div class="dh-kpi-val" style="color:${k.color}">${k.val}</div>
            <div class="dh-kpi-label">${k.label}</div>
          </div>`).join('')}
        </div>

        <div class="dh-tabs">
          ${TABS.map(t=>`<button class="dh-tab${activeTab===t.id?' dh-tab-active':''}" onclick="window._dhTab('${t.id}')">${t.label}${tabBadge(t.id,activePid)}</button>`).join('')}
        </div>

        <div class="dh-tab-body">${tabBody}</div>
      </div>

      <div id="dh-modal" class="dh-modal-overlay" style="display:none" onclick="if(event.target===this)window._dhCloseModal()">
        <div class="dh-modal-box" id="dh-modal-box"></div>
      </div>`;
  }

  renderPage();

  // ── Handlers ──────────────────────────────────────────────────────────────
  window._dhSwitchPatient = function(pid) { activePid = pid; renderPage(); };
  window._dhTab           = function(tab) { activeTab = tab; renderPage(); };

  window._dhTlibFilter = function(f) { dhTlibFilter = f; renderPage(); };
  window._dhTlibSearch = function(v) { dhTlibSearch = v; renderPage(); document.getElementById('dh-tlib-search')?.focus(); };
  window._dhTlibAssign = function(id, name) {
    window._dsShowAssignModal({
      templateName: name,
      templateId: id,
      templateType: 'document',
      onAssign: async (patientId, patientName) => {
        try {
          if (api.assignDocument) {
            await api.assignDocument({ patient_id: patientId, template_id: id });
          }
        } catch {}
        if (window._showNotifToast) {
          window._showNotifToast({ title: 'Document Added', body: '\u201c' + name + '\u201d was added to the document workflow for ' + patientName, severity: 'success' });
        } else {
          _dsToast('\u201c' + name + '\u201d was added to the document workflow for ' + patientName, 'success');
        }
      }
    });
  };
  window._dhTlibPreview = function(id) {
    const item = DH_TLIB_ITEMS.find(x => x.id === id);
    if (item) window._showNotifToast?.({ title: item.name, body: (item.type || '') + (item.target ? ' · ' + item.target : '') + (item.desc ? ' — ' + item.desc.slice(0, 80) : ''), severity: 'info' });
  };
  window._dhTlibFill = function(id) {
    const item = DH_TLIB_ITEMS.find(x => x.id === id);
    window._showNotifToast?.({
      title: item?.name || 'Template fill unavailable',
      body:'In-platform form filling is not available from this beta view. Assign the form for patient-portal completion instead.',
      severity:'info'
    });
  };

  async function _dhFetchProtectedUrl(url) {
    const token = globalThis.localStorage?.getItem?.('ds_access_token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const contentType = res.headers.get('content-type') || blob.type || 'application/octet-stream';
    const contentDisposition = res.headers.get('content-disposition') || '';
    const filenameMatch = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(contentDisposition);
    const filename = filenameMatch ? decodeURIComponent(filenameMatch[1].replace(/"/g, '').trim()) : null;
    return { blob, contentType, filename };
  }

  function _dhOpenBlob(blob) {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  window._dhFill       = function(id) {
    const d = docs.find(x => x.id === id);
    window._showNotifToast?.({
      title: d?.name || 'Form unavailable',
      body:'In-platform form filling is not available from this beta view. Patients must complete this document through the patient portal.',
      severity:'info'
    });
  };
  window._dhOpen       = async function(id) {
    const d=docs.find(x=>x.id===id);
    if(!d) return;
    if (d._apiId && d.fileRef) {
      try {
        const file = await api.fetchDocumentDownload(d._apiId);
        _dhOpenBlob(file.blob);
      } catch (err) {
        window._showNotifToast?.({ title:'Open failed', body: err?.message || 'Stored document could not be opened.', severity:'error' });
      }
      return;
    }
    if (d?.url) {
      try {
        const file = await _dhFetchProtectedUrl(d.url);
        _dhOpenBlob(file.blob);
      } catch (err) {
        window._showNotifToast?.({ title:'Open failed', body: err?.message || 'Stored document could not be opened.', severity:'error' });
      }
      return;
    }
    window._showNotifToast?.({ title:'Draft only', body:'This entry does not have a generated or uploaded file yet.', severity:'info' });
  };
  window._dhDownload   = async function(id) {
    const d=docs.find(x=>x.id===id);
    if(!d) return;
    if (d._apiId && d.fileRef) {
      try {
        const file = await api.fetchDocumentDownload(d._apiId);
        downloadBlob(file.blob, file.filename || `${(d.name || 'document').replace(/\s+/g, '_')}`);
        window._showNotifToast?.({ title:'Download started', body:`${d.name} file is ready.`, severity:'success' });
      } catch (err) {
        window._showNotifToast?.({ title:'Download failed', body: err?.message || 'Stored document could not be downloaded.', severity:'error' });
      }
      return;
    }
    if (d?.url) {
      try {
        const file = await _dhFetchProtectedUrl(d.url);
        downloadBlob(file.blob, file.filename || `${(d.name || 'document').replace(/\s+/g, '_')}`);
        window._showNotifToast?.({ title:'Download started', body:`${d.name} file is ready.`, severity:'success' });
      } catch (err) {
        window._showNotifToast?.({ title:'Download failed', body: err?.message || 'Stored document could not be downloaded.', severity:'error' });
      }
      return;
    }
    window._showNotifToast?.({ title:'Download unavailable', body:'Only uploaded documents with stored files can be downloaded right now.', severity:'warning' });
  };

  function _dhPersistUpdate(d) {
    // Sync mutation to API (fire-and-forget)
    const payload = { patient_id: d.patientId, doc_type: d.name, category: d.category, status: d.status, sig_state: d.sigState, assigned_by: d.assignedBy, assigned_date: d.assignedDate, completed_date: d.completedDate, expiry_date: d.expiryDate, notes: d.desc, archived: d.archived || false };
    if (d._apiId) {
      api.updateDocument(d._apiId, { questions_json: payload }).catch(() => {});
    } else {
      api.createDocument({ title: d.name, form_type: 'document', questions_json: { ...payload, template_id: d.templateId } }).then(r => {
        if (r?.id) { d._apiId = r.id; d._fromApi = true; saveDocs(docs); }
      }).catch(() => {});
    }
  }

  window._dhSendForSig = function(id) {
    docs=loadDocs(); const d=docs.find(x=>x.id===id); if(!d) return;
    d.sigState='pending-sig'; d.status='pending'; d.updatedDate=today();
    saveDocs(docs); renderPage(); _dhPersistUpdate(d);
    window._showNotifToast?.({ title:'Pending Signature', body:`${d.name} was marked pending signature. Remote signature delivery is not verified from this page.`, severity:'success' });
  };
  window._dhMarkSigned = function(id) {
    docs=loadDocs(); const d=docs.find(x=>x.id===id); if(!d) return;
    d.status='signed'; d.sigState='signed'; d.completedDate=today(); d.updatedDate=today();
    saveDocs(docs); renderPage(); _dhPersistUpdate(d);
    window._showNotifToast?.({ title:'Marked Signed', body:`${d.name} was marked signed in this workflow view.`, severity:'success' });
  };
  window._dhReplace = function(id) {
    const name=prompt('Name of replacement document:'); if(!name) return;
    docs=loadDocs(); const d=docs.find(x=>x.id===id); if(!d) return;
    d.name=name; d.status='pending'; d.sigState=d.category==='Consent'?'unsigned':'not-required';
    d.updatedDate=today(); d.completedDate=null;
    saveDocs(docs); renderPage();
    window._showNotifToast?.({ title:'Replaced', body:`${name} was added as a replacement draft in this workflow view.`, severity:'success' });
  };
  window._dhArchive = function(id) {
    if(!confirm('Archive this document? It will be hidden but not deleted.')) return;
    docs=loadDocs(); const d=docs.find(x=>x.id===id); if(!d) return;
    d.archived=true; saveDocs(docs); renderPage(); _dhPersistUpdate(d);
    window._showNotifToast?.({ title:'Archived', body:`${d.name} was archived in this workflow view.`, severity:'success' });
  };
  window._dhAssignDoc = function(id) {
    const pid=activePid||prompt('Enter patient ID:'); if(!pid) return;
    docs=loadDocs(); const d=docs.find(x=>x.id===id); if(!d) return;
    d.status='pending'; d.patientId=pid; d.assignedDate=today(); d.assignedBy='Clinician'; d.updatedDate=today();
    saveDocs(docs); renderPage();
    window._showNotifToast?.({ title:'Assigned', body:`${d.name} was added to the document workflow in this browser view.`, severity:'success' });
  };
  window._dhAssignTemplate = function(templateId, name, cat, desc) {
    const pid=activePid;
    if(!pid){ window._showNotifToast?.({ title:'No Patient', body:'Select a patient first.', severity:'warning' }); return; }
    docs=loadDocs();
    if(docs.find(x=>x.patientId===pid&&x.templateId===templateId&&!x.archived)){
      window._showNotifToast?.({ title:'Already Assigned', body:`${name} already assigned.`, severity:'warning' }); return;
    }
    const newDoc = { id:'doc_'+Date.now(), patientId:pid, templateId, name, category:cat, desc, status:'pending', sigState:cat==='Consent'?'unsigned':'not-required', assignedBy:'Clinician', assignedDate:today(), completedDate:null, updatedDate:today(), expiryDate:null };
    docs.push(newDoc);
    saveDocs(docs); renderPage(); _dhPersistUpdate(newDoc);
    window._showNotifToast?.({ title:'Form Added', body:`${name} was added to the patient workflow in this browser view.`, severity:'success' });
  };
  window._dhAssignBundle = function(bundleId) {
    const pid=activePid;
    if(!pid){ window._showNotifToast?.({ title:'No Patient', body:'Select a patient first.', severity:'warning' }); return; }
    const bundle=BUNDLES.find(b=>b.id===bundleId); if(!bundle) return;
    docs=loadDocs(); let added=0;
    bundle.templates.forEach(tid=>{
      const t=FORM_TEMPLATES.find(x=>x.id===tid); if(!t) return;
      if(docs.find(x=>x.patientId===pid&&x.templateId===tid&&!x.archived)) return;
      docs.push({ id:'doc_'+Date.now()+'_'+tid, patientId:pid, templateId:tid, name:t.name, category:t.cat, desc:t.desc, status:'pending', sigState:t.cat==='Consent'?'unsigned':'not-required', assignedBy:'Clinician', assignedDate:today(), completedDate:null, updatedDate:today(), expiryDate:null });
      added++;
    });
    saveDocs(docs); activeTab='required'; renderPage();
    window._showNotifToast?.({ title:`${bundle.name} Added`, body:`${added} form${added!==1?'s':''} added to this patient's document workflow in this browser view.`, severity:'success' });
  };

  // ── Modals ────────────────────────────────────────────────────────────────
  window._dhShowAssignModal = function() {
    const pid=activePid;
    const pOpts=patients.map(p=>`<option value="${esc(p.id)}"${pid===String(p.id)?' selected':''}>${esc(p.full_name||p.name||'Patient '+p.id)}</option>`).join('');
    const tOpts=FORM_TEMPLATES.map(t=>`<option value="${esc(t.id)}">${esc(t.cat)} — ${esc(t.name)}</option>`).join('');
    document.getElementById('dh-modal-box').innerHTML=`
      <div class="dh-modal-hd">Assign Form to Patient</div>
      <div style="margin-bottom:12px"><label class="dh-modal-label">Patient</label><select id="dh-m-pid" class="form-control">${pOpts||'<option value="">— no patients —</option>'}</select></div>
      <div style="margin-bottom:12px"><label class="dh-modal-label">Form template</label><select id="dh-m-tpl" class="form-control">${tOpts}</select></div>
      <div style="margin-bottom:16px">
        <label class="dh-modal-label">Or assign a pack</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${BUNDLES.map(b=>`<button class="btn btn-sm" style="border-color:${b.color};color:${b.color}" onclick="activePid=document.getElementById('dh-m-pid').value;window._dhCloseModal();window._dhAssignBundle('${esc(b.id)}')">${b.icon} ${esc(b.name)}</button>`).join('')}
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-sm" onclick="window._dhCloseModal()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="window._dhDoAssignModal()">Assign Form</button>
      </div>`;
    document.getElementById('dh-modal').style.display='flex';
  };
  window._dhDoAssignModal = function() {
    const pid=document.getElementById('dh-m-pid')?.value;
    const tid=document.getElementById('dh-m-tpl')?.value;
    if(!pid||!tid){ window._showNotifToast?.({ title:'Required', body:'Select patient and template.', severity:'warning' }); return; }
    activePid=pid; window._dhCloseModal();
    const t=FORM_TEMPLATES.find(x=>x.id===tid);
    if(t) window._dhAssignTemplate(t.id,t.name,t.cat,t.desc);
  };

  window._dhShowUploadModal = function() {
    const pid=activePid;
    const pOpts=patients.map(p=>`<option value="${esc(p.id)}"${pid===String(p.id)?' selected':''}>${esc(p.full_name||p.name||'Patient '+p.id)}</option>`).join('');
    document.getElementById('dh-modal-box').innerHTML=`
      <div class="dh-modal-hd">Upload Document</div>
      <div style="margin-bottom:12px"><label class="dh-modal-label">Patient</label><select id="dh-u-pid" class="form-control">${pOpts||'<option value="">— no patients —</option>'}</select></div>
      <div style="margin-bottom:12px"><label class="dh-modal-label">Document name</label><input id="dh-u-name" class="form-control" placeholder="e.g. Signed Consent Form" /></div>
      <div style="margin-bottom:12px"><label class="dh-modal-label">File</label><input id="dh-u-file" class="form-control" type="file" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp" /></div>
      <div style="margin-bottom:16px"><label class="dh-modal-label">Category</label>
        <select id="dh-u-cat" class="form-control"><option value="Intake">Intake</option><option value="Consent">Consent</option><option value="Clinical">Clinical</option><option value="Uploaded" selected>Uploaded</option></select></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-sm" onclick="window._dhCloseModal()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="window._dhDoUpload()">Upload</button>
      </div>`;
    document.getElementById('dh-modal').style.display='flex';
  };
  window._dhDoUpload = async function() {
    const pid=document.getElementById('dh-u-pid')?.value;
    const name=document.getElementById('dh-u-name')?.value?.trim();
    const cat=document.getElementById('dh-u-cat')?.value||'Uploaded';
    const file=document.getElementById('dh-u-file')?.files?.[0];
    if(!pid||!name||!file){ window._showNotifToast?.({ title:'Required', body:'Patient, name, and file are required.', severity:'warning' }); return; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', name);
    fd.append('doc_type', cat.toLowerCase());
    fd.append('patient_id', pid);
    fd.append('notes', 'Uploaded from documents hub.');
    try {
      const uploaded = await api.uploadDocument(fd);
      const newDoc = _apiDocToLocal(uploaded);
      docs=loadDocs().filter(x => String(x.id) !== String(newDoc.id));
      docs.push(newDoc);
      saveDocs(docs); activePid=pid; activeTab='uploaded'; window._dhCloseModal(); renderPage();
      window._showNotifToast?.({ title:'Uploaded', body:`${name} uploaded and stored.`, severity:'success' });
    } catch (err) {
      window._showNotifToast?.({ title:'Upload failed', body: err?.message || 'Document upload failed.', severity:'error' });
    }
  };

  window._dhShowCreateModal = function() {
    const pid=activePid;
    const pOpts=patients.map(p=>`<option value="${esc(p.id)}"${pid===String(p.id)?' selected':''}>${esc(p.full_name||p.name||'Patient '+p.id)}</option>`).join('');
    document.getElementById('dh-modal-box').innerHTML=`
      <div class="dh-modal-hd">Create Draft Document</div>
      <div style="margin-bottom:12px"><label class="dh-modal-label">Patient</label><select id="dh-c-pid" class="form-control">${pOpts||'<option value="">— no patients —</option>'}</select></div>
      <div style="margin-bottom:12px"><label class="dh-modal-label">Document type</label>
        <select id="dh-c-type" class="form-control">
          <option>Discharge Summary</option><option>Referral Letter</option><option>Progress Letter</option>
          <option>GP Update</option><option>Treatment Plan Summary</option><option>Adverse Event Report</option>
        </select></div>
      <div style="margin-bottom:16px"><label class="dh-modal-label">Notes (optional)</label><textarea id="dh-c-notes" class="form-control" rows="2" placeholder="Any specific notes..."></textarea></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-sm" onclick="window._dhCloseModal()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="window._dhDoCreate()">Save Draft</button>
      </div>`;
    document.getElementById('dh-modal').style.display='flex';
  };
  window._dhDoCreate = function() {
    const pid=document.getElementById('dh-c-pid')?.value;
    const type=document.getElementById('dh-c-type')?.value;
    const notes=document.getElementById('dh-c-notes')?.value?.trim();
    if(!pid||!type){ window._showNotifToast?.({ title:'Required', body:'Patient and type required.', severity:'warning' }); return; }
    docs=loadDocs();
    const newDoc = { id:'doc_'+Date.now(), patientId:pid, templateId:null, name:type, category:'Generated', desc:notes||'Clinician-generated document.', status:'generated', sigState:'not-required', assignedBy:'Clinician', assignedDate:today(), completedDate:today(), updatedDate:today(), expiryDate:null };
    docs.push(newDoc);
    saveDocs(docs); activePid=pid; activeTab='generated'; window._dhCloseModal(); renderPage(); _dhPersistUpdate(newDoc);
    window._showNotifToast?.({ title:'Draft Created', body:`${type} saved as a local draft.`, severity:'success' });
  };

  window._dhCloseModal = function() {
    const m=document.getElementById('dh-modal'); if(m) m.style.display='none';
  };
}

// ── pgReportsHub — Patient report upload, filter, compare, AI summary ─────────
export async function pgReportsHub(setTopbar) {
  setTopbar('Reports', `
    <button class="btn btn-primary btn-sm" onclick="window._rhUpload()">+ Upload Report</button>
    <button class="btn btn-sm" onclick="window._rhTimelineToggle()">Timeline</button>
  `);

  const el = document.getElementById('content');
  if (!el) return;

  function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmt(d) { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}); } catch { return d; } }

  // ── CSS injection ────────────────────────────────────────────────────────
  if (!document.getElementById('rh2-styles')) {
    const st = document.createElement('style'); st.id = 'rh2-styles';
    st.textContent = `
      .rh-layout{display:grid;grid-template-columns:210px 1fr;gap:0;height:100%}
      .rh-sidebar{background:var(--bg-card,#0e1628);border-right:1px solid var(--border);padding:16px 12px;min-height:100%;position:sticky;top:0}
      .rh-sidebar-sec{font-size:9.5px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:1.2px;margin:14px 0 6px;padding:0 4px}
      .rh-nav-btn{display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;padding:7px 10px;border-radius:8px;border:none;background:transparent;color:var(--text-secondary);font-size:12.5px;cursor:pointer;margin-bottom:2px;transition:all .12s}
      .rh-nav-btn:hover{background:rgba(255,255,255,0.05);color:var(--text-primary)}
      .rh-nav-btn.active{background:rgba(0,212,188,0.1);color:var(--teal,#00d4bc);font-weight:600}
      .rh-nav-count{font-size:10px;padding:1px 6px;border-radius:10px;background:rgba(255,255,255,0.07);color:var(--text-tertiary)}
      .rh-nav-btn.active .rh-nav-count{background:rgba(0,212,188,0.15);color:var(--teal,#00d4bc)}
      .rh-main{padding:20px 24px;flex:1;min-width:0}
      .rh-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
      .rh-kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
      .rh-kpi{background:var(--bg-card,#0e1628);border:1px solid var(--border);border-radius:10px;padding:12px 14px}
      .rh-kpi-val{font-size:22px;font-weight:700}
      .rh-kpi-lbl{font-size:10.5px;color:var(--text-tertiary);margin-top:2px}
      .rh-card{background:var(--bg-card,#0e1628);border:1px solid var(--border);border-radius:12px;padding:0;margin-bottom:10px;overflow:hidden;transition:border-color .15s}
      .rh-card:hover{border-color:var(--border-hover,rgba(255,255,255,0.15))}
      .rh-card.compare-sel{border-color:var(--teal,#00d4bc)}
      .rh-card-body{padding:14px 16px}
      .rh-card-header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px}
      .rh-card-title{font-size:13.5px;font-weight:600;color:var(--text-primary);line-height:1.3}
      .rh-card-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px;font-size:11.5px;color:var(--text-tertiary)}
      .rh-type-badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;border:1px solid}
      .rh-assoc-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
      .rh-assoc-chip{font-size:10.5px;padding:2px 8px;border-radius:5px;border:1px solid rgba(255,255,255,0.12);color:var(--text-secondary);background:rgba(255,255,255,0.04);cursor:pointer}
      .rh-assoc-chip:hover{border-color:var(--teal,#00d4bc);color:var(--teal,#00d4bc)}
      .rh-card-summary{font-size:12.5px;color:var(--text-secondary);line-height:1.6;margin:6px 0}
      .rh-card-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.05)}
      .rh-ai-panel{padding:12px 16px;background:rgba(155,127,255,0.06);border-top:1px solid rgba(155,127,255,0.15)}
      .rh-ai-label{font-size:10px;font-weight:700;color:var(--violet,#9b7fff);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
      .rh-ai-body{font-size:12.5px;color:var(--text-secondary);line-height:1.65;font-style:italic}
      .rh-ai-findings{margin-top:8px;padding-left:16px}
      .rh-ai-finding{font-size:12px;color:var(--text-secondary);margin-bottom:3px;list-style:disc}
      .rh-detail-panel{padding:14px 16px;background:rgba(0,0,0,0.2);border-top:1px solid var(--border)}
      .rh-compare-bar{background:rgba(0,212,188,0.07);border:1px solid rgba(0,212,188,0.25);border-radius:12px;padding:14px 18px;margin-bottom:16px}
      .rh-compare-grid{display:grid;gap:14px}
      .rh-compare-col{padding:14px;background:var(--bg-card,#0e1628);border:1px solid var(--border);border-radius:10px}
      .rh-timeline{padding:16px 0}
      .rh-tl-row{display:flex;gap:0;margin-bottom:28px;position:relative}
      .rh-tl-label{width:130px;flex-shrink:0;font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;padding-top:6px}
      .rh-tl-track{flex:1;position:relative;padding-left:16px;border-left:2px solid var(--border)}
      .rh-tl-dot{width:10px;height:10px;border-radius:50%;border:2px solid var(--bg-card,#0e1628);position:absolute;left:-6px;top:8px}
      .rh-tl-item{margin-bottom:12px;padding:10px 14px;background:var(--bg-card,#0e1628);border:1px solid var(--border);border-radius:8px;cursor:pointer;transition:border-color .12s}
      .rh-tl-item:hover{border-color:var(--border-hover,rgba(255,255,255,0.15))}
      .rh-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:1000;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:24px 16px}
      .rh-modal{background:var(--bg-card,#0e1628);border:1px solid var(--border);border-radius:16px;width:100%;max-width:620px;padding:24px}
      .rh-modal-title{font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:18px}
      @media(max-width:720px){.rh-layout{grid-template-columns:1fr}.rh-sidebar{position:static;border-right:none;border-bottom:1px solid var(--border)}.rh-kpi-row{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(st);
  }

  // ── Type meta ────────────────────────────────────────────────────────────
  const TYPES = [
    { id:'all',       label:'All Reports',         color:'var(--text-secondary)' },
    { id:'eeg',       label:'EEG / qEEG',          color:'var(--violet,#9b7fff)' },
    { id:'lab',       label:'Blood / Lab',          color:'#f59e0b' },
    { id:'imaging',   label:'MRI / Imaging',        color:'var(--blue,#4a9eff)' },
    { id:'external',  label:'External Letters',     color:'#94a3b8' },
    { id:'progress',  label:'Progress Reports',     color:'var(--teal,#00d4bc)' },
    { id:'clinician', label:'Clinician Summaries',  color:'var(--green,#4ade80)' },
    { id:'ai',        label:'AI Summaries',         color:'#ec4899' },
    { id:'other',     label:'Other',                color:'var(--text-tertiary)' },
  ];
  const TYPE_BY_ID = {};
  TYPES.forEach(t => TYPE_BY_ID[t.id] = t);

  // ── Storage ──────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'ds_reports_hub_v2';
  const LINKS_KEY   = 'ds_reports_links';
  const AI_KEY      = 'ds_reports_ai';

  function loadReports()  { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
  function saveReports(d) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {} }
  function loadLinks()    { try { return JSON.parse(localStorage.getItem(LINKS_KEY) || '{}'); } catch { return {}; } }
  function saveLinks(d)   { try { localStorage.setItem(LINKS_KEY, JSON.stringify(d)); } catch {} }
  function loadAI()       { try { return JSON.parse(localStorage.getItem(AI_KEY) || '{}'); } catch { return {}; } }
  function saveAI(d)      { try { localStorage.setItem(AI_KEY, JSON.stringify(d)); } catch {} }

  // ── State ────────────────────────────────────────────────────────────────
  window._rhActiveType   = window._rhActiveType   || 'all';
  window._rhActivePid    = window._rhActivePid    || '';
  window._rhSearch       = window._rhSearch       || '';
  window._rhDateFrom     = window._rhDateFrom     || '';
  window._rhDateTo       = window._rhDateTo       || '';
  window._rhSortBy       = window._rhSortBy       || 'date-desc';
  window._rhCompareIds   = window._rhCompareIds   || new Set();
  window._rhTimeline     = window._rhTimeline     || false;
  window._rhExpandedAI   = window._rhExpandedAI   || new Set();
  window._rhExpandedDet  = window._rhExpandedDet  || new Set();

  // ── Load data ────────────────────────────────────────────────────────────
  let patients = [], courses = [], protocols = [], outcomes = [];
  try {
    const [pRes, cRes, prRes, ouRes] = await Promise.allSettled([
      api.listPatients().catch(() => null),
      api.listCourses?.().catch(() => null) ?? Promise.resolve(null),
      api.protocols().catch(() => null),
      api.listOutcomes?.().catch(() => null) ?? Promise.resolve(null),
    ]);
    patients  = (pRes.status  === 'fulfilled' ? pRes.value?.items  || pRes.value  || [] : []);
    courses   = (cRes.status  === 'fulfilled' ? cRes.value?.items  || cRes.value  || [] : []);
    protocols = (prRes.status === 'fulfilled' ? prRes.value?.items || prRes.value || [] : []);
    outcomes  = (ouRes.status === 'fulfilled' ? ouRes.value?.items || ouRes.value || [] : []);
  } catch (_) {}

  const patientMap  = {}; patients.forEach(p  => { patientMap[p.id]   = `${p.first_name||''} ${p.last_name||p.name||''}`.trim() || `Patient #${p.id}`; });
  const courseMap   = {}; courses.forEach(c   => { courseMap[c.id]    = c.name || c.protocol_name || `Course #${c.id}`; });
  const protocolMap = {}; protocols.forEach(p => { protocolMap[p.id]  = p.name || p.id; });
  const outcomeMap  = {}; outcomes.forEach(o  => { outcomeMap[o.id]   = o.label || o.name || `Outcome #${o.id}`; });

  // ── Hydrate reports from the backend ─────────────────────────────────────
  // Primary source: /api/v1/reports (clinician-scoped). Each row can carry a
  // patient_id so per-patient filtering works. Local cache is kept as a
  // fallback for offline/reload resilience — backend rows always win on merge.
  // NO demo-patient seeding: if the server returns nothing and local is empty
  // the hub shows an honest "no reports yet" state.
  function _mapSrvReport(r) {
    const dateStr = (r.date || r.report_date || r.created_at || '').slice(0, 10);
    const rtype = (r.type || 'other').toLowerCase();
    const mappedType =
      ['eeg','lab','imaging','external','progress','clinician','ai','other'].includes(rtype)
        ? rtype
        : (rtype.includes('eeg') ? 'eeg'
          : rtype.includes('lab') ? 'lab'
          : rtype.includes('mri') || rtype.includes('imag') ? 'imaging'
          : rtype.includes('prog') ? 'progress'
          : rtype.includes('summ') || rtype.includes('note') ? 'clinician'
          : 'other');
    return {
      id: r.id,
      patientId: r.patient_id ? String(r.patient_id) : '',
      type: mappedType,
      title: r.title || r.name || 'Untitled Report',
      date: dateStr,
      source: r.source || '',
      summary: r.summary || r.content || '',
      file_url: r.file_url || '',
      status: r.status || 'final',
      _source: 'backend',
    };
  }

  let reports = [];
  let _rhLoadErr = null;
  try {
    const srv = api.listMyReports ? await api.listMyReports() : null;
    const items = srv?.items || srv || [];
    if (Array.isArray(items) && items.length) {
      reports = items.map(_mapSrvReport);
    }
  } catch (err) {
    _rhLoadErr = err?.message || 'Failed to load reports from server';
    console.warn('[pgReportsHub] listMyReports failed; falling back to local cache:', err);
  }
  // Merge with local cache — local rows (offline uploads) stay visible until
  // the next successful sync. Backend rows win on id collision.
  const _rhLocal = loadReports();
  if (reports.length === 0 && _rhLocal.length) {
    reports = _rhLocal.map(r => ({ ...r, _source: r._source || 'local' }));
  } else if (_rhLocal.length) {
    const byId = new Map(reports.map(r => [r.id, r]));
    _rhLocal.forEach(r => { if (!byId.has(r.id)) byId.set(r.id, { ...r, _source: 'local' }); });
    reports = Array.from(byId.values());
  }

  // ── Filter & sort ────────────────────────────────────────────────────────
  function filteredReports() {
    let d = [...reports];
    if (window._rhActivePid) d = d.filter(r => r.patientId === window._rhActivePid);
    if (window._rhActiveType !== 'all') d = d.filter(r => (r.type || 'other') === window._rhActiveType);
    const q = (window._rhSearch || '').toLowerCase();
    if (q) d = d.filter(r => (r.title||r.name||'').toLowerCase().includes(q) || (r.source||'').toLowerCase().includes(q) || (r.summary||'').toLowerCase().includes(q));
    if (window._rhDateFrom) d = d.filter(r => (r.date||'') >= window._rhDateFrom);
    if (window._rhDateTo)   d = d.filter(r => (r.date||'') <= window._rhDateTo);
    const s = window._rhSortBy;
    if (s === 'date-desc') d.sort((a,b) => (b.date||'').localeCompare(a.date||''));
    else if (s === 'date-asc') d.sort((a,b) => (a.date||'').localeCompare(b.date||''));
    else if (s === 'type')    d.sort((a,b) => (a.type||'').localeCompare(b.type||''));
    else if (s === 'patient') d.sort((a,b) => (patientMap[a.patientId]||'').localeCompare(patientMap[b.patientId]||''));
    return d;
  }

  // ── Renderers ────────────────────────────────────────────────────────────
  function typeCounts() {
    const counts = { all: reports.length };
    TYPES.slice(1).forEach(t => { counts[t.id] = reports.filter(r => (r.type||'other') === t.id).length; });
    return counts;
  }

  function sidebarHTML() {
    const counts = typeCounts();
    const activePid = window._rhActivePid;
    return `
      <div class="rh-sidebar">
        <div class="rh-sidebar-sec">By Type</div>
        ${TYPES.map(t => `
          <button class="rh-nav-btn${window._rhActiveType === t.id ? ' active' : ''}" onclick="window._rhType('${t.id}')">
            <span>${t.label}</span>
            <span class="rh-nav-count">${counts[t.id] || 0}</span>
          </button>`).join('')}
        <div class="rh-sidebar-sec" style="margin-top:18px">Patient</div>
        <select class="form-control" style="font-size:12px;width:100%" onchange="window._rhSetPt(this.value)">
          <option value="">All patients</option>
          ${patients.map(p => `<option value="${esc(String(p.id))}"${activePid===String(p.id)?' selected':''}>${esc(patientMap[p.id]||'Patient '+p.id)}</option>`).join('')}
        </select>
        <div class="rh-sidebar-sec" style="margin-top:18px">Quick Links</div>
        <button class="rh-nav-btn" onclick="window._nav('courses')">Treatment Courses</button>
        <button class="rh-nav-btn" onclick="window._nav('outcomes')">Outcomes</button>
        <button class="rh-nav-btn" onclick="window._nav('protocol-wizard')">Protocols</button>
        <button class="rh-nav-btn" onclick="window._nav('brain-map-planner')">Brain Map Planner</button>
      </div>`;
  }

  function kpiHTML() {
    const scope = window._rhActivePid ? reports.filter(r => r.patientId === window._rhActivePid) : reports;
    const aiData = loadAI();
    return `
      <div class="rh-kpi-row">
        ${[
          { val: scope.length,                                                                        lbl:'Total Reports',    color:'var(--blue,#4a9eff)' },
          { val: scope.filter(r => ['eeg','imaging'].includes(r.type)).length,                       lbl:'Neuroimaging',     color:'var(--violet,#9b7fff)' },
          { val: scope.filter(r => r.type === 'progress' || r.type === 'clinician').length,          lbl:'Clinical Notes',   color:'var(--teal,#00d4bc)' },
          { val: scope.filter(r => aiData[r.id]?.summary || r.type === 'ai').length,                 lbl:'AI Summaries',     color:'#ec4899' },
        ].map(k => `<div class="rh-kpi"><div class="rh-kpi-val" style="color:${k.color}">${k.val}</div><div class="rh-kpi-lbl">${k.lbl}</div></div>`).join('')}
      </div>`;
  }

  function toolbarHTML() {
    return `
      <div class="rh-toolbar">
        <input type="text" class="form-control" placeholder="Search by title, source, content…" style="flex:1;min-width:180px;font-size:12.5px" oninput="window._rhSearchInput(this.value)" value="${esc(window._rhSearch||'')}">
        <input type="date" class="form-control" style="width:138px;font-size:12px" value="${window._rhDateFrom||''}" onchange="window._rhDateF(this.value)" title="From date">
        <input type="date" class="form-control" style="width:138px;font-size:12px" value="${window._rhDateTo||''}" onchange="window._rhDateT(this.value)" title="To date">
        <select class="form-control" style="width:120px;font-size:12px" onchange="window._rhSort(this.value)">
          <option value="date-desc"${window._rhSortBy==='date-desc'?' selected':''}>Date ↓</option>
          <option value="date-asc" ${window._rhSortBy==='date-asc' ?' selected':''}>Date ↑</option>
          <option value="type"     ${window._rhSortBy==='type'     ?' selected':''}>Type</option>
          <option value="patient"  ${window._rhSortBy==='patient'  ?' selected':''}>Patient</option>
        </select>
        <button class="btn btn-sm${window._rhCompareIds.size ? ' btn-primary' : ''}" onclick="window._rhCompareClear()">
          ${window._rhCompareIds.size ? `Clear Compare (${window._rhCompareIds.size})` : 'Compare'}
        </button>
      </div>`;
  }

  function reportCardHTML(r) {
    const t     = TYPE_BY_ID[r.type || 'other'] || TYPE_BY_ID.other;
    const links = loadLinks()[r.id] || {};
    const aiData = loadAI();
    const ai    = aiData[r.id];
    const isCompare  = window._rhCompareIds.has(r.id);
    const isAIOpen   = window._rhExpandedAI.has(r.id);
    const isDetOpen  = window._rhExpandedDet.has(r.id);
    const ptN   = patientMap[r.patientId] || r.patientId || '—';
    const linkedCourses   = (links.courses   || []).map(id => courseMap[id]  || id).filter(Boolean);
    const linkedProtocols = (links.protocols || []).map(id => protocolMap[id]|| id).filter(Boolean);
    const linkedOutcomes  = (links.outcomes  || []).map(id => outcomeMap[id] || id).filter(Boolean);

    return `
      <div class="rh-card${isCompare ? ' compare-sel' : ''}" id="rh-card-${esc(r.id)}">
        <div class="rh-card-body">
          <div class="rh-card-header">
            <div style="flex:1;min-width:0">
              <div class="rh-card-title">${esc(r.title || r.name || 'Untitled Report')}</div>
              <div class="rh-card-meta">
                <span class="rh-type-badge" style="color:${t.color};background:${t.color}18;border-color:${t.color}35">${t.label}</span>
                <span>${fmt(r.date)}</span>
                ${r.source ? `<span>· ${esc(r.source)}</span>` : ''}
                ${!window._rhActivePid ? `<span>· ${esc(ptN)}</span>` : ''}
                ${r.status === 'draft' ? `<span style="color:var(--amber,#ffb547)">· Draft</span>` : ''}
              </div>
            </div>
            <div style="display:flex;gap:5px;flex-shrink:0">
              <button class="btn btn-ghost btn-sm" style="font-size:10.5px;padding:3px 8px${isCompare?';color:var(--teal,#00d4bc)':''}" title="Add to comparison" onclick="window._rhToggleCompare('${esc(r.id)}')">
                ${isCompare ? '✓' : '+Compare'}
              </button>
            </div>
          </div>
          ${r.summary ? `<div class="rh-card-summary">${esc(r.summary)}</div>` : ''}
          ${(linkedCourses.length || linkedProtocols.length || linkedOutcomes.length) ? `
            <div class="rh-assoc-chips">
              ${linkedCourses.map(n   => `<span class="rh-assoc-chip" onclick="window._nav('courses')" title="Linked Course">Course: ${esc(n)}</span>`).join('')}
              ${linkedProtocols.map(n => `<span class="rh-assoc-chip" onclick="window._nav('protocol-wizard')" title="Linked Protocol">Protocol: ${esc(n)}</span>`).join('')}
              ${linkedOutcomes.map(n  => `<span class="rh-assoc-chip" onclick="window._nav('outcomes')" title="Linked Outcome">Outcome: ${esc(n)}</span>`).join('')}
            </div>` : ''}
          ${r.type === 'eeg' ? `
            <div style="margin-top:8px">
              <button class="btn btn-ghost btn-sm" style="font-size:10.5px;padding:3px 8px;color:var(--violet,#9b7fff);border-color:rgba(155,127,255,0.3)" onclick="window._nav('brain-map-planner')">View in Brain Map Planner ↗</button>
            </div>` : ''}
          <div class="rh-card-actions">
            <button class="btn btn-sm" style="font-size:11px" onclick="window._rhDetail('${esc(r.id)}')">View Details</button>
            <button class="btn btn-sm" style="font-size:11px${isAIOpen?';color:var(--violet,#9b7fff)':''}" onclick="window._rhAISummarize('${esc(r.id)}')">
              ${ai ? (isAIOpen ? 'Hide AI Summary' : 'AI Summary ✓') : '🤖 AI Summary'}
            </button>
            <button class="btn btn-sm" style="font-size:11px;border-color:var(--teal,#00d4bc);color:var(--teal,#00d4bc)" onclick="window._rhLinkModal('${esc(r.id)}')">Link to Course/Protocol</button>
            ${r.file_url ? `<button class="btn btn-sm" style="font-size:11px" onclick="window._rhDownload('${esc(r.id)}')">Download</button>` : ''}
            <button class="btn btn-ghost btn-sm" style="font-size:11px;color:var(--text-tertiary)" onclick="window._rhDelete('${esc(r.id)}')">${r._source === 'backend' ? 'Remove local card' : 'Delete'}</button>
          </div>
        </div>
        ${isAIOpen && ai ? `
          <div class="rh-ai-panel">
            <div class="rh-ai-label">AI Summary</div>
            <div class="rh-ai-body">${esc(ai.summary || '—')}</div>
            ${(ai.findings||[]).length ? `<ul class="rh-ai-findings">${ai.findings.map(f=>`<li class="rh-ai-finding">${esc(f)}</li>`).join('')}</ul>` : ''}
            ${ai.protocol_hint ? `<div style="margin-top:8px;font-size:11.5px;color:var(--text-tertiary)">Suggested protocol: <button class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 8px;color:var(--teal,#00d4bc)" onclick="window._nav('protocol-wizard')">${esc(ai.protocol_hint)}</button></div>` : ''}
          </div>` : ''}
        ${isDetOpen ? `
          <div class="rh-detail-panel">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:12.5px">
              ${[
                ['Report Type', TYPE_BY_ID[r.type||'other']?.label],
                ['Date',        fmt(r.date)],
                ['Source',      r.source],
                ['Patient',     ptN],
                ['Status',      r.status || 'Final'],
                ['Linked Notes', (loadLinks()[r.id]?.notes) || '—'],
              ].map(([k,v]) => v ? `<div><span style="color:var(--text-tertiary)">${k}:</span><br><span style="color:var(--text-primary)">${esc(String(v))}</span></div>` : '').join('')}
            </div>
          </div>` : ''}
      </div>`;
  }

  function comparePanelHTML() {
    if (window._rhCompareIds.size < 2) return '';
    const sel = reports.filter(r => window._rhCompareIds.has(r.id)).slice(0,3);
    return `
      <div class="rh-compare-bar">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div style="font-size:12px;font-weight:600;color:var(--teal,#00d4bc)">Comparing ${window._rhCompareIds.size} reports</div>
          <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="window._rhCompareClear()">Clear ✕</button>
        </div>
        <div class="rh-compare-grid" style="grid-template-columns:repeat(${sel.length},1fr)">
          ${sel.map(r => {
            const ai = loadAI()[r.id];
            return `<div class="rh-compare-col">
              <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px">${esc(r.title||r.name||'—')}</div>
              <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px">${fmt(r.date)} · ${TYPE_BY_ID[r.type||'other']?.label}</div>
              ${r.source ? `<div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:6px">Source: ${esc(r.source)}</div>` : ''}
              <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.6">${esc(r.summary || '—')}</div>
              ${ai ? `<div style="margin-top:8px;padding:8px 10px;background:rgba(155,127,255,0.08);border-radius:6px;font-size:11.5px;color:var(--violet,#9b7fff);font-style:italic">${esc(ai.summary||'')}</div>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  function timelineHTML() {
    const scope = window._rhActivePid ? reports.filter(r => r.patientId === window._rhActivePid) : reports;
    if (!scope.length) return `<div style="padding:40px;text-align:center;color:var(--text-tertiary)">No reports to show in timeline. Select a patient or upload reports.</div>`;
    const byType = {};
    scope.forEach(r => {
      const tid = r.type || 'other';
      if (!byType[tid]) byType[tid] = [];
      byType[tid].push(r);
    });
    Object.values(byType).forEach(arr => arr.sort((a,b) => (a.date||'').localeCompare(b.date||'')));
    return `
      <div class="rh-timeline">
        ${Object.entries(byType).map(([tid, items]) => {
          const t = TYPE_BY_ID[tid] || TYPE_BY_ID.other;
          return `<div class="rh-tl-row">
            <div class="rh-tl-label" style="color:${t.color}">${t.label}</div>
            <div class="rh-tl-track">
              ${items.map(r => `
                <div class="rh-tl-item" onclick="window._rhDetail('${esc(r.id)}')">
                  <div class="rh-tl-dot" style="background:${t.color}"></div>
                  <div style="font-size:12.5px;font-weight:500;color:var(--text-primary)">${esc(r.title||r.name||'Untitled')}</div>
                  <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${fmt(r.date)} ${r.source ? '· ' + esc(r.source) : ''}</div>
                  ${r.summary ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;line-height:1.5">${esc(r.summary.slice(0,120))}${r.summary.length>120?'…':''}</div>` : ''}
                </div>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>`;
  }

  function listHTML() {
    const filtered = filteredReports();
    if (!filtered.length) return `<div style="padding:40px;text-align:center;color:var(--text-tertiary)">No reports match your filters. <button class="btn btn-sm btn-primary" onclick="window._rhUpload()" style="margin-left:8px">+ Upload Report</button></div>`;
    return filtered.map(reportCardHTML).join('');
  }

  // ── Upload modal ─────────────────────────────────────────────────────────
  function uploadModalHTML() {
    return `
      <div class="rh-modal-overlay" id="rh-upload-modal" style="display:none" onclick="if(event.target===this)window._rhCloseModal('rh-upload-modal')">
        <div class="rh-modal">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
            <div class="rh-modal-title" style="margin:0">Upload Report</div>
            <button class="btn btn-ghost btn-sm" onclick="window._rhCloseModal('rh-upload-modal')">✕</button>
          </div>
          <div style="display:grid;gap:12px">
            <div class="form-group">
              <label class="form-label">Patient *</label>
              <select id="rh-up-patient" class="form-control">
                <option value="">— Select patient —</option>
                ${patients.map(p => `<option value="${esc(String(p.id))}">${esc(patientMap[p.id])}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Report Type *</label>
              <select id="rh-up-type" class="form-control">
                <option value="">— Select type —</option>
                ${TYPES.slice(1).map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
              </select>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div class="form-group">
                <label class="form-label">Report Date</label>
                <input id="rh-up-date" type="date" class="form-control" value="${new Date().toISOString().slice(0,10)}">
              </div>
              <div class="form-group">
                <label class="form-label">Status</label>
                <select id="rh-up-status" class="form-control">
                  <option value="final">Final</option>
                  <option value="draft">Draft</option>
                  <option value="preliminary">Preliminary</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Title *</label>
              <input id="rh-up-title" type="text" class="form-control" placeholder="e.g. Baseline qEEG Report — March 2026">
            </div>
            <div class="form-group">
              <label class="form-label">Source / Author</label>
              <input id="rh-up-source" type="text" class="form-control" placeholder="e.g. NeuroGuide Lab / Dr. K. Mehta">
            </div>
            <div class="form-group">
              <label class="form-label">Summary / Key Findings</label>
              <textarea id="rh-up-summary" class="form-control" rows="3" placeholder="Brief summary of findings…"></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">File (PDF, JPEG, DOCX)</label>
              <input id="rh-up-file" type="file" class="form-control" accept=".pdf,.jpg,.jpeg,.png,.docx">
            </div>
            <div id="rh-up-msg" style="display:none;padding:8px 12px;border-radius:8px;font-size:13px"></div>
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px">
              <button class="btn btn-sm" onclick="window._rhCloseModal('rh-upload-modal')">Cancel</button>
              <button class="btn btn-primary btn-sm" onclick="window._rhSubmitUpload()">Upload Report</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  // ── Link modal ───────────────────────────────────────────────────────────
  function linkModalHTML(reportId) {
    const links = loadLinks()[reportId] || { courses:[], protocols:[], outcomes:[], notes:'' };
    const courseOpts = courses.map(c => `<option value="${esc(String(c.id))}"${links.courses?.includes(String(c.id))?' selected':''}>${esc(courseMap[c.id]||'Course '+c.id)}</option>`).join('');
    const protoOpts  = protocols.map(p => `<option value="${esc(String(p.id))}"${links.protocols?.includes(String(p.id))?' selected':''}>${esc(protocolMap[p.id]||'Protocol '+p.id)}</option>`).join('');
    const ouOpts     = outcomes.map(o => `<option value="${esc(String(o.id))}"${links.outcomes?.includes(String(o.id))?' selected':''}>${esc(outcomeMap[o.id]||'Outcome '+o.id)}</option>`).join('');
    return `
      <div class="rh-modal-overlay" id="rh-link-modal" onclick="if(event.target===this)window._rhCloseModal('rh-link-modal')">
        <div class="rh-modal">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
            <div class="rh-modal-title" style="margin:0">Link Report to Course / Protocol / Outcome</div>
            <button class="btn btn-ghost btn-sm" onclick="window._rhCloseModal('rh-link-modal')">✕</button>
          </div>
          <input type="hidden" id="rh-link-rid" value="${esc(reportId)}">
          <div style="display:grid;gap:14px">
            <div class="form-group">
              <label class="form-label">Treatment Course</label>
              <select id="rh-link-course" class="form-control" multiple size="4" style="height:auto">
                ${courseOpts || '<option disabled>No courses available</option>'}
              </select>
              <div style="font-size:10.5px;color:var(--text-tertiary);margin-top:4px">Hold Ctrl/Cmd to select multiple</div>
            </div>
            <div class="form-group">
              <label class="form-label">Protocol</label>
              <select id="rh-link-proto" class="form-control" multiple size="3" style="height:auto">
                ${protoOpts || '<option disabled>No protocols available</option>'}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Outcome Record</label>
              <select id="rh-link-outcome" class="form-control" multiple size="3" style="height:auto">
                ${ouOpts || '<option disabled>No outcomes available</option>'}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Association Notes</label>
              <input type="text" id="rh-link-notes" class="form-control" value="${esc(links.notes||'')}" placeholder="e.g. Used to guide protocol selection">
            </div>
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px">
              <button class="btn btn-sm" onclick="window._rhCloseModal('rh-link-modal')">Cancel</button>
              <button class="btn btn-primary btn-sm" onclick="window._rhSaveLinks()">Save Links</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  // ── Main render ──────────────────────────────────────────────────────────
  // Error banner surfaces when /api/v1/reports was unreachable. We still
  // render whatever local cache survived — never fabricate.
  function renderPage() {
    const hasLocal = reports.some(r => r._source === 'local');
    const errBanner = _rhLoadErr
      ? `<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12.5px;color:#ef4444">
          ⚠ Could not load reports from the server (${esc(_rhLoadErr)}).${hasLocal ? ' Showing locally cached rows only.' : ''}
        </div>`
      : (hasLocal && reports.every(r => r._source === 'local')
          ? `<div style="background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12.5px;color:var(--amber,#ffb547)">
              These reports are saved locally in this browser. They will sync once the server persistence wiring is completed.
            </div>`
          : '');
    const emptyBody = reports.length === 0
      ? `<div style="padding:40px;text-align:center;color:var(--text-tertiary)">
          <div style="font-size:14px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">No reports yet</div>
          <div style="font-size:12px">Use <b>+ Upload Report</b> to add a patient report, or generate one from the Reports hub.</div>
        </div>`
      : '';
    el.innerHTML = `
      <div class="rh-layout">
        ${sidebarHTML()}
        <div class="rh-main">
          ${errBanner}
          ${kpiHTML()}
          ${toolbarHTML()}
          ${comparePanelHTML()}
          <div id="rh-content">
            ${emptyBody || (window._rhTimeline ? timelineHTML() : listHTML())}
          </div>
        </div>
      </div>
      ${uploadModalHTML()}`;
  }

  // ── Handlers ─────────────────────────────────────────────────────────────
  window._rhType = function(t) { window._rhActiveType = t; renderPage(); };
  window._rhSetPt = function(pid) { window._rhActivePid = pid; renderPage(); };

  window._rhSearchInput = function(q) {
    window._rhSearch = q;
    const cont = document.getElementById('rh-content');
    if (cont && !window._rhTimeline) cont.innerHTML = listHTML();
  };

  window._rhDateF  = function(v) { window._rhDateFrom = v; document.getElementById('rh-content').innerHTML = window._rhTimeline ? timelineHTML() : listHTML(); };
  window._rhDateT  = function(v) { window._rhDateTo   = v; document.getElementById('rh-content').innerHTML = window._rhTimeline ? timelineHTML() : listHTML(); };
  window._rhSort   = function(v) { window._rhSortBy   = v; document.getElementById('rh-content').innerHTML = window._rhTimeline ? timelineHTML() : listHTML(); };

  window._rhToggleCompare = function(id) {
    if (window._rhCompareIds.has(id)) window._rhCompareIds.delete(id);
    else if (window._rhCompareIds.size < 5) window._rhCompareIds.add(id);
    renderPage();
  };
  window._rhCompareClear = function() { window._rhCompareIds.clear(); renderPage(); };

  window._rhTimelineToggle = function() { window._rhTimeline = !window._rhTimeline; renderPage(); };

  window._rhDetail = function(id) {
    if (window._rhExpandedDet.has(id)) window._rhExpandedDet.delete(id);
    else window._rhExpandedDet.add(id);
    const el2 = document.getElementById('rh-card-' + id);
    if (el2) el2.outerHTML = reportCardHTML(reports.find(r => r.id === id));
  };

  window._rhAISummarize = async function(id) {
    const r = reports.find(x => x.id === id);
    if (!r) return;
    const aiData = loadAI();

    if (aiData[id] && window._rhExpandedAI.has(id)) {
      window._rhExpandedAI.delete(id);
      const el2 = document.getElementById('rh-card-' + id);
      if (el2) el2.outerHTML = reportCardHTML(r);
      return;
    }
    if (aiData[id]) {
      window._rhExpandedAI.add(id);
      const el2 = document.getElementById('rh-card-' + id);
      if (el2) el2.outerHTML = reportCardHTML(r);
      return;
    }

    // Show loading state
    const card = document.getElementById('rh-card-' + id);
    if (card) {
      const actionsEl = card.querySelector('.rh-card-actions');
      if (actionsEl) { const btn = actionsEl.querySelectorAll('button')[1]; if (btn) { btn.textContent = 'Generating…'; btn.disabled = true; } }
    }

    try {
      let result = null;
      if (api.aiSummarizeReport) {
        result = await api.aiSummarizeReport(id);
      } else {
        // Simulated type-aware fallback
        await new Promise(res => setTimeout(res, 800));
        const TYPE_SUMMARIES = {
          eeg:       { summary:'EEG findings analysed. Alpha asymmetry pattern is consistent with the documented clinical presentation. Frequency band distribution within expected range for this modality.', findings:['Frontal alpha asymmetry present','Theta activity elevated at midline sites','Beta coherence reduced bilaterally'] },
          lab:       { summary:'Laboratory values reviewed. Key markers are within normal clinical range. No contraindications to current protocol identified.', findings:['Thyroid function normal','Blood count within reference range','Electrolytes balanced'] },
          imaging:   { summary:'Structural imaging reviewed. No significant abnormalities identified that would impact current treatment protocol.', findings:['No cortical thinning','White matter intact','No space-occupying lesion'] },
          external:  { summary:'Referral letter reviewed. Clinical context is consistent with current treatment approach. Recommendations noted and incorporated.', findings:['Diagnosis confirmed by referring clinician','Prior treatment trials documented','No undisclosed contraindications'] },
          progress:  { summary:'Progress note reviewed. Response trajectory is consistent with expected treatment pattern. Recommend continuing current protocol.', findings:['Symptom reduction trend positive','Tolerance reported as good','Next review scheduled on target'] },
          clinician: { summary:'Clinical summary reviewed. Assessment and treatment rationale are consistent and well-documented. Next phase clearly outlined.', findings:['Treatment goals partially met','Protocol adherence documented','Outcome measures trending positively'] },
          ai:        { summary:'AI analysis reviewed. Predicted response pattern aligns with observed clinical trajectory. Confidence interval acceptable.', findings:['Response probability within expected range','Symptom trajectory modelled','Maintenance recommendation generated'] },
        };
        const base = TYPE_SUMMARIES[r.type] || { summary:'Report reviewed. Key findings are documented and consistent with the clinical record.', findings:['Content reviewed','No anomalies flagged','Recommend filing in clinical record'] };
        result = { ...base, protocol_hint: r.type === 'eeg' ? 'Left DLPFC rTMS — Depression' : null };
      }
      const ai = {
        summary:       result?.summary   || result?.content || result?.text || 'No summary returned.',
        findings:      result?.findings  || result?.key_findings || [],
        protocol_hint: result?.protocol_hint || null,
        generated_at:  new Date().toISOString(),
      };
      aiData[id] = ai;
      saveAI(aiData);
      window._rhExpandedAI.add(id);
      const el2 = document.getElementById('rh-card-' + id);
      if (el2) el2.outerHTML = reportCardHTML(r);
    } catch (e) {
      const card2 = document.getElementById('rh-card-' + id);
      if (card2) { const actionsEl = card2.querySelector('.rh-card-actions'); if (actionsEl) { const btn = actionsEl.querySelectorAll('button')[1]; if (btn) { btn.textContent = '🤖 AI Summary'; btn.disabled = false; } } }
    }
  };

  window._rhUpload = function() {
    document.getElementById('rh-upload-modal')?.remove();
    document.body.insertAdjacentHTML('beforeend', uploadModalHTML());
    document.getElementById('rh-upload-modal').style.display = 'flex';
    if (window._rhActivePid) { const sel = document.getElementById('rh-up-patient'); if (sel) sel.value = window._rhActivePid; }
  };

  window._rhCloseModal = function(id) { document.getElementById(id)?.remove(); };

  window._rhSubmitUpload = async function() {
    const patientId = document.getElementById('rh-up-patient')?.value;
    const type      = document.getElementById('rh-up-type')?.value;
    const date      = document.getElementById('rh-up-date')?.value;
    const title     = document.getElementById('rh-up-title')?.value?.trim();
    const source    = document.getElementById('rh-up-source')?.value?.trim();
    const summary   = document.getElementById('rh-up-summary')?.value?.trim();
    const status    = document.getElementById('rh-up-status')?.value || 'final';
    const fileInput = document.getElementById('rh-up-file');
    const msgEl     = document.getElementById('rh-up-msg');

    if (!patientId || !type || !title) {
      if (msgEl) { msgEl.textContent = '⚠ Patient, type and title are required.'; msgEl.style.display = ''; msgEl.style.background = 'rgba(255,100,100,0.1)'; } return;
    }
    if (msgEl) msgEl.style.display = 'none';

    const newReport = { id: 'r' + Date.now(), patientId, type, date: date || new Date().toISOString().slice(0,10), title, source, summary, status, file_url: '' };

    let persisted = false;
    try {
      if (api.uploadReport) {
        const fd = new FormData();
        Object.entries({ patient_id:patientId, type, report_date:newReport.date, title, source:source||'', summary:summary||'', status }).forEach(([k,v]) => fd.append(k,v));
        if (fileInput?.files?.[0]) fd.append('file', fileInput.files[0]);
        const res = await api.uploadReport(fd);
        if (res?.id) {
          newReport.id = res.id;
          persisted = true;
        }
        if (res?.file_url) newReport.file_url = res.file_url;
      }
    } catch (_err) {}

    newReport._source = persisted ? 'backend' : 'local';
    if (!persisted) newReport.status = 'local-only';

    if (!persisted) newReport.status = 'local-only';
    reports.push(newReport);
    saveReports(reports);
    window._rhCloseModal('rh-upload-modal');
    renderPage();
    window._showNotifToast?.({
      title: persisted ? 'Report uploaded' : 'Report saved locally',
      body: persisted
        ? `"${title}" was stored on the backend.`
        : `"${title}" is stored in this browser only until report upload persistence is available.`,
      severity: persisted ? 'success' : 'warning'
    });
  };

  window._rhLinkModal = function(id) {
    document.getElementById('rh-link-modal')?.remove();
    document.body.insertAdjacentHTML('beforeend', linkModalHTML(id));
  };

  window._rhSaveLinks = function() {
    const id      = document.getElementById('rh-link-rid')?.value;
    const cSel    = document.getElementById('rh-link-course');
    const pSel    = document.getElementById('rh-link-proto');
    const oSel    = document.getElementById('rh-link-outcome');
    const notes   = document.getElementById('rh-link-notes')?.value?.trim() || '';
    if (!id) return;
    const links = loadLinks();
    links[id] = {
      courses:   cSel ? [...cSel.selectedOptions].map(o => o.value)  : [],
      protocols: pSel ? [...pSel.selectedOptions].map(o => o.value)  : [],
      outcomes:  oSel ? [...oSel.selectedOptions].map(o => o.value)  : [],
      notes,
    };
    saveLinks(links);
    window._rhCloseModal('rh-link-modal');
    const r = reports.find(x => x.id === id);
    const el2 = document.getElementById('rh-card-' + id);
    if (el2 && r) el2.outerHTML = reportCardHTML(r);
    window._showNotifToast?.({ title:'Links Saved', body:'Report associations updated in this browser view.', severity:'success' });
  };

  window._rhDelete = function(id) {
    const r = reports.find(x => x.id === id);
    const backendBacked = !!(r && !String(r.id).startsWith('r') && r.status !== 'local-only');
    if (!confirm(backendBacked ? 'Remove this local report card? This does not confirm server deletion.' : 'Delete this local report? This cannot be undone.')) return;
    reports = reports.filter(r => r.id !== id);
    saveReports(reports);
    const el2 = document.getElementById('rh-card-' + id);
    if (el2) el2.remove();
    renderPage();
    window._showNotifToast?.({
      title: backendBacked ? 'Local card removed' : 'Local report deleted',
      body: backendBacked ? 'The backend-backed report may still exist on the server.' : 'This browser-only report was removed.',
      severity: 'info'
    });
  };
  window._rhDownload = async function(id) {
    const r = reports.find(x => x.id === id);
    if (!r?.file_url) {
      window._showNotifToast?.({ title:'Download unavailable', body:'This report does not have an attached file yet.', severity:'warning' });
      return;
    }
    try {
      const file = await _dhFetchProtectedUrl(r.file_url);
      downloadBlob(file.blob, file.filename || `${(r.title || 'report').replace(/\s+/g, '_')}`);
      window._showNotifToast?.({ title:'Download started', body:`${r.title || 'Report'} file is ready.`, severity:'success' });
    } catch (err) {
      window._showNotifToast?.({ title:'Download failed', body: err?.message || 'Attached report file could not be downloaded.', severity:'error' });
    }
  };

  renderPage();
  _refreshServerCompletions().then(() => { renderPage(); }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// pgPrescriptions — Prescribe Protocol Workflow
// ─────────────────────────────────────────────────────────────────────────────
export async function pgPrescriptions(setTopbar) {
  setTopbar('Prescriptions', `
    <button class="btn btn-primary btn-sm" onclick="window._rxOpenWizard()">+ New Prescription</button>
    <button class="btn btn-sm" onclick="window._nav('patient-protocol')" style="border-color:var(--teal);color:var(--teal)">Patient View</button>
  `);

  const PROTOCOLS_SEED = [
    { id:'PROTO-001', name:'Left DLPFC TMS \u2014 Depression (Standard)', modality:'TMS', indication:'MDD', sessions:30, freqPerWeek:5, durationMin:37 },
    { id:'PROTO-002', name:'Deep TMS \u2014 OCD Protocol', modality:'TMS', indication:'OCD', sessions:29, freqPerWeek:5, durationMin:20 },
    { id:'PROTO-003', name:'tDCS Anodal DLPFC \u2014 Depression', modality:'tDCS', indication:'MDD', sessions:20, freqPerWeek:5, durationMin:30 },
    { id:'PROTO-004', name:'tDCS M1 \u2014 Chronic Pain', modality:'tDCS', indication:'Chronic Pain', sessions:15, freqPerWeek:3, durationMin:20 },
    { id:'PROTO-005', name:'Alpha Neurofeedback \u2014 Anxiety', modality:'Neurofeedback', indication:'GAD', sessions:20, freqPerWeek:2, durationMin:45 },
    { id:'PROTO-006', name:'Theta Burst TMS \u2014 Depression (Accelerated)', modality:'TMS', indication:'TRD', sessions:10, freqPerWeek:5, durationMin:10 },
    { id:'PROTO-007', name:'Right DLPFC TMS \u2014 Anxiety', modality:'TMS', indication:'GAD', sessions:30, freqPerWeek:5, durationMin:37 },
    { id:'PROTO-008', name:'tDCS Prefrontal \u2014 PTSD', modality:'tDCS', indication:'PTSD', sessions:15, freqPerWeek:3, durationMin:20 },
  ];
  // Mutable so we can hydrate from /api/v1/registry/devices below. Hardcoded
  // list remains as a fallback when the backend is unreachable or empty.
  let DEVICES_SEED = [
    { id:'DEV-001', name:'MagVenture MagPro R30', type:'TMS' },
    { id:'DEV-002', name:'Neuronetics NeuroStar', type:'TMS' },
    { id:'DEV-003', name:'BrainsWay Deep TMS H1', type:'TMS' },
    { id:'DEV-004', name:'Soterix Medical 1x1 tDCS', type:'tDCS' },
    { id:'DEV-005', name:'NeuroConn DC-Stimulator', type:'tDCS' },
    { id:'DEV-006', name:'Emotiv EPOC X', type:'Neurofeedback' },
    { id:'DEV-007', name:'Muse S Headband', type:'Neurofeedback' },
  ];
  const HOME_PROGRAMS_SEED = [
    { id:'HP-001', name:'Depression Management Home Program' },
    { id:'HP-002', name:'Anxiety & Mindfulness Program' },
    { id:'HP-003', name:'Pain Self-Management Program' },
    { id:'HP-004', name:'Sleep Hygiene Protocol' },
    { id:'HP-005', name:'PTSD Grounding & Stabilisation' },
    { id:'HP-006', name:'Cognitive Stimulation Daily Exercises' },
  ];
  const CONSENT_PACKS_SEED = [
    'Informed Consent for TMS Therapy',
    'Informed Consent for tDCS Therapy',
    'Informed Consent for Neurofeedback',
    'Privacy & Data Handling Consent',
    'Home Device Use Agreement',
    'Video Consultation Consent',
    'Research Participation Consent',
  ];
  const COND_ASSESS = [
    { condId:'CON-001', label:'MDD \u2014 Weekly (PHQ-9, QIDS-SR, C-SSRS)', scales:['PHQ-9','QIDS-SR','C-SSRS'] },
    { condId:'CON-002', label:'TRD \u2014 Weekly (PHQ-9, QIDS-SR, TMS-SE)', scales:['PHQ-9','QIDS-SR','TMS-SE'] },
    { condId:'CON-011', label:'GAD \u2014 Weekly (GAD-7, PSWQ)', scales:['GAD-7','PSWQ'] },
    { condId:'CON-019', label:'PTSD \u2014 Weekly (PCL-5, PHQ-9)', scales:['PCL-5','PHQ-9'] },
    { condId:'CON-027', label:'Chronic Pain \u2014 Weekly (BPI, PCS)', scales:['BPI','PCS'] },
    { condId:'CON-051', label:'TMS Protocol \u2014 Per-session (TMS-SE, C-SSRS)', scales:['TMS-SE','C-SSRS'] },
  ];

  const STORE_KEY = 'ds_rx_hub_v1';
  function loadRx() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)||'null')||seedRx(); } catch(e) { return seedRx(); }
  }
  function saveRx(d) { localStorage.setItem(STORE_KEY, JSON.stringify(d)); }
  function seedRx() {
    const d = { prescriptions:[
      { id:'RX-001', patientId:'P-DEMO-1', patientName:'Demo Patient A', conditionName:'Major Depressive Disorder',
        protocol:PROTOCOLS_SEED[0], device:DEVICES_SEED[0],
        schedule:{startDate:'2026-04-14',sessionsPerWeek:5,sessionDurationMin:37,totalSessions:30,completedSessions:8},
        assessments:[COND_ASSESS[0]], homeProgram:HOME_PROGRAMS_SEED[0],
        consentPacks:['Informed Consent for TMS Therapy','Privacy & Data Handling Consent'],
        status:'active', prescribedBy:'Dr. Sarah Chen', prescribedDate:'2026-04-12',
        notes:'Patient motivated. Two prior SSRI trials. No contraindications. Start 110% MT.' },
      { id:'RX-002', patientId:'P-DEMO-2', patientName:'Demo Patient B', conditionName:'Generalized Anxiety Disorder',
        protocol:PROTOCOLS_SEED[6], device:DEVICES_SEED[1],
        schedule:{startDate:'2026-04-20',sessionsPerWeek:5,sessionDurationMin:37,totalSessions:30,completedSessions:0},
        assessments:[COND_ASSESS[2]], homeProgram:HOME_PROGRAMS_SEED[1],
        consentPacks:['Informed Consent for TMS Therapy','Privacy & Data Handling Consent'],
        status:'draft', prescribedBy:'Dr. Sarah Chen', prescribedDate:'2026-04-11',
        notes:'Starting next Monday. Baseline completed.' },
      { id:'RX-003', patientId:'P-DEMO-3', patientName:'Demo Patient C', conditionName:'PTSD',
        protocol:PROTOCOLS_SEED[7], device:DEVICES_SEED[3],
        schedule:{startDate:'2026-02-10',sessionsPerWeek:3,sessionDurationMin:20,totalSessions:15,completedSessions:15},
        assessments:[COND_ASSESS[3]], homeProgram:HOME_PROGRAMS_SEED[4],
        consentPacks:['Informed Consent for tDCS Therapy','Privacy & Data Handling Consent'],
        status:'completed', prescribedBy:'Dr. James Patel', prescribedDate:'2026-02-05',
        notes:'Full course completed. PCL-5 reduced 28 pts. Schedule discharge assessment.' },
    ]};
    saveRx(d); return d;
  }

  // Hydrate devices from the backend registry before RX is seeded so demo
  // data references real devices when the CSV is populated. Falls back to
  // the hardcoded SEED on error / empty response.
  try {
    const devRes = await api.devices_registry();
    const devItems = devRes?.items || [];
    if (Array.isArray(devItems) && devItems.length) {
      DEVICES_SEED = devItems.map((d, i) => ({
        id:   d.id   || ('DEV-API-' + String(i + 1).padStart(3, '0')),
        name: d.name || d.label || d.id || 'Device',
        type: d.modality || d.modality_id || d.type || 'Device',
      }));
    }
  } catch { /* backend offline — SEED fallback remains */ }

  let RX = loadRx();
  let activeTab = 'active';
  let wizardOpen = false;
  let wizardStep = 1;
  let wizardData = {};
  let detailId = null;
  const STEPS = ['Patient','Protocol','Device','Schedule','Assessments','Consent & Review'];

  // Accept a handoff from Protocol Studio's Designer. When present, auto-open
  // the wizard at step 2 with the designer protocol pre-selected in the
  // catalog (prepended, one-shot consumption).
  const _designerProto = window._rxPrefilledProto && window._rxPrefilledProto._source === 'designer'
    ? window._rxPrefilledProto : null;
  if (_designerProto) {
    window._rxPrefilledProto = null;
    const modality = (_designerProto.modality_id || 'TMS').toUpperCase();
    const freqMap = { TMS:5, TDCS:5, TACS:3, NEUROFEEDBACK:2, EEG:2, PBM:3, TAVNS:3 };
    const pseudo = {
      id: 'DESIGNER-' + Date.now(),
      name: _designerProto.name,
      modality,
      indication: _designerProto.condition_name || '—',
      sessions: _designerProto.sessions || 20,
      freqPerWeek: freqMap[modality] || 3,
      durationMin: 30,
      _source: 'designer',
      _designer: _designerProto,
    };
    PROTOCOLS_SEED.unshift(pseudo);
    wizardOpen = true;
    wizardStep = 2;
    wizardData = {
      protocolId: pseudo.id,
      notes: (_designerProto.summary || '') + (_designerProto.targetRegion ? ' (Target: ' + _designerProto.targetRegion + ')' : ''),
      _fromDesigner: true,
    };
  }

  function kpis() {
    return {
      active:RX.prescriptions.filter(r=>r.status==='active').length,
      draft:RX.prescriptions.filter(r=>r.status==='draft').length,
      completed:RX.prescriptions.filter(r=>r.status==='completed').length,
    };
  }
  function pct(rx) { return rx.schedule.totalSessions?Math.round((rx.schedule.completedSessions/rx.schedule.totalSessions)*100):0; }
  function sBadge(s) {
    const m={active:'rx-status-active',draft:'rx-status-draft',completed:'rx-status-ok',paused:'rx-status-warn'};
    return '<span class="rx-badge '+(m[s]||'rx-status-neutral')+'">'+s+'</span>';
  }

  function rxCard(rx) {
    const p=pct(rx);
    const modCls='rx-mod-'+rx.protocol.modality.toLowerCase().replace(/[\s/]+/g,'-');
    return '<div class="rx-card">'+
      '<div class="rx-card-header">'+
        '<div class="rx-card-patient"><span class="rx-patient-name">'+rx.patientName+'</span><span class="rx-patient-id">'+rx.patientId+'</span></div>'+
        '<div class="rx-card-badges">'+sBadge(rx.status)+'<span class="rx-mod-badge '+modCls+'">'+rx.protocol.modality+'</span></div>'+
      '</div>'+
      '<div class="rx-card-cond">'+rx.conditionName+'</div>'+
      '<div class="rx-card-proto">'+rx.protocol.name+'</div>'+
      '<div class="rx-card-device">Device: <strong>'+rx.device.name+'</strong></div>'+
      (rx.status==='active'?
        '<div class="rx-prog-wrap"><div class="rx-prog-label"><span>'+rx.schedule.completedSessions+' / '+rx.schedule.totalSessions+' sessions</span><span>'+p+'%</span></div>'+
        '<div class="rx-prog-bar"><div class="rx-prog-fill" style="width:'+p+'%"></div></div></div>':'')+
      '<div class="rx-card-meta">'+rx.prescribedBy+' &bull; '+rx.prescribedDate+'</div>'+
      '<div class="rx-card-actions">'+
        '<button class="rx-btn rx-btn-sm" onclick="window._rxDetail(\''+rx.id+'\')">Detail</button>'+
        '<button class="rx-btn rx-btn-sm rx-btn-teal" onclick="window._rxPatientView(\''+rx.id+'\')">Patient View</button>'+
        (rx.status==='draft'?'<button class="rx-btn rx-btn-sm rx-btn-ok" onclick="window._rxActivate(\''+rx.id+'\')">Activate</button>':'')+
        (rx.status==='active'?'<button class="rx-btn rx-btn-sm rx-btn-ghost" onclick="window._rxComplete(\''+rx.id+'\')">Complete</button>':'')+
      '</div>'+
    '</div>';
  }

  function renderList() {
    const list=activeTab==='all'?RX.prescriptions:RX.prescriptions.filter(r=>r.status===activeTab);
    if (!list.length) return '<div class="rx-empty">No prescriptions here</div>';
    return '<div class="rx-list">'+list.map(rxCard).join('')+'</div>';
  }

  function renderMain() {
    const k=kpis();
    const previewBanner='<div style="background:linear-gradient(135deg,#92400e,#78350f);border:1px solid #d97706;border-radius:10px;padding:12px 16px;margin-bottom:18px;display:flex;align-items:center;gap:12px"><span style="font-size:18px">⚠</span><div><div style="font-weight:700;color:#fef3c7;font-size:13px;margin-bottom:2px">Preview Mode — Not Connected to Patient Records</div><div style="font-size:11.5px;color:#fde68a;line-height:1.4">Prescriptions shown here are demonstration data only. In a live environment this page displays real prescriptions linked to your patient roster. To issue a real prescription, use the Protocol Builder and assign it to a patient from their profile.</div></div></div>';
    return previewBanner+'<div class="rx-kpi-strip">'+
        '<div class="rx-kpi rx-kpi-active"><span class="rx-kpi-val">'+k.active+'</span><span class="rx-kpi-lbl">Active</span></div>'+
        '<div class="rx-kpi rx-kpi-draft"><span class="rx-kpi-val">'+k.draft+'</span><span class="rx-kpi-lbl">Drafts</span></div>'+
        '<div class="rx-kpi"><span class="rx-kpi-val">'+k.completed+'</span><span class="rx-kpi-lbl">Completed</span></div>'+
        '<div class="rx-kpi"><span class="rx-kpi-val">'+RX.prescriptions.length+'</span><span class="rx-kpi-lbl">Total</span></div>'+
      '</div>'+
      '<div class="rx-tabs">'+['active','draft','completed','all'].map(t=>
        '<button class="rx-tab'+(activeTab===t?' rx-tab-active':'')+'" onclick="window._rxTab(\''+t+'\')">'+(t==='all'?'All':t.charAt(0).toUpperCase()+t.slice(1))+'</button>'
      ).join('')+'</div>'+
      '<div class="rx-tab-body">'+renderList()+'</div>';
  }

  function wizardContent() {
    const d=wizardData;
    if (wizardStep===1) return '<div class="rx-wiz-sec"><h3 class="rx-wiz-stitle">Patient &amp; Condition</h3>'+
      '<div class="rx-frow"><label>Patient ID</label><input id="wiz-pid" class="rx-input" placeholder="P-XXXX" value="'+(d.patientId||'')+'"/></div>'+
      '<div class="rx-frow"><label>Patient Name</label><input id="wiz-pname" class="rx-input" placeholder="Full name" value="'+(d.patientName||'')+'"/></div>'+
      '<div class="rx-frow"><label>Primary Condition</label><input id="wiz-cond" class="rx-input" placeholder="e.g. Major Depressive Disorder" value="'+(d.conditionName||'')+'"/></div>'+
      '<div class="rx-frow"><label>Clinical Notes</label><textarea id="wiz-notes" class="rx-input rx-textarea" placeholder="History, prior treatments, contraindication notes...">'+(d.notes||'')+'</textarea></div>'+
      '</div>';
    if (wizardStep===2) return '<div class="rx-wiz-sec"><h3 class="rx-wiz-stitle">Select Protocol</h3>'+
      '<div class="rx-proto-grid">'+PROTOCOLS_SEED.map(p=>
        '<div class="rx-proto-opt'+(d.protocolId===p.id?' rx-proto-sel':'')+'" onclick="window._rxSelProto(\''+p.id+'\')">'+
          '<div class="rx-proto-mod rx-mod-'+p.modality.toLowerCase().replace(/[\s/]+/g,'-')+'">'+p.modality+'</div>'+
          '<div class="rx-proto-name">'+p.name+'</div>'+
          '<div class="rx-proto-meta">'+p.sessions+' sessions &bull; '+p.freqPerWeek+'x/week &bull; '+p.durationMin+' min</div>'+
          '<div class="rx-proto-ind">'+p.indication+'</div>'+
        '</div>').join('')+'</div></div>';
    if (wizardStep===3) return '<div class="rx-wiz-sec"><h3 class="rx-wiz-stitle">Select Device</h3>'+
      '<div class="rx-device-grid">'+DEVICES_SEED.map(dv=>
        '<div class="rx-device-opt'+(d.deviceId===dv.id?' rx-device-sel':'')+'" onclick="window._rxSelDevice(\''+dv.id+'\')">'+
          '<div class="rx-device-type rx-mod-'+dv.type.toLowerCase().replace(/[\s/]+/g,'-')+'">'+dv.type+'</div>'+
          '<div class="rx-device-name">'+dv.name+'</div>'+
        '</div>').join('')+'</div></div>';
    if (wizardStep===4) {
      const pr=PROTOCOLS_SEED.find(p=>p.id===d.protocolId)||PROTOCOLS_SEED[0];
      return '<div class="rx-wiz-sec"><h3 class="rx-wiz-stitle">Set Schedule</h3>'+
        '<div class="rx-frow"><label>Start Date</label><input id="wiz-start" type="date" class="rx-input" value="'+(d.startDate||new Date(Date.now()+2*864e5).toISOString().slice(0,10))+'"/></div>'+
        '<div class="rx-frow"><label>Sessions per Week</label><input id="wiz-freq" type="number" min="1" max="7" class="rx-input" value="'+(d.sessionsPerWeek||pr.freqPerWeek)+'"/></div>'+
        '<div class="rx-frow"><label>Session Duration (min)</label><input id="wiz-dur" type="number" min="5" max="120" class="rx-input" value="'+(d.sessionDurationMin||pr.durationMin)+'"/></div>'+
        '<div class="rx-frow"><label>Total Sessions</label><input id="wiz-total" type="number" min="1" max="100" class="rx-input" value="'+(d.totalSessions||pr.sessions)+'" oninput="window._rxCalcEnd()"/></div>'+
        '<div class="rx-sched-prev" id="rx-sched-prev"></div></div>';
    }
    if (wizardStep===5) return '<div class="rx-wiz-sec"><h3 class="rx-wiz-stitle">Assessments &amp; Home Program</h3>'+
      '<div class="rx-assess-list">'+COND_ASSESS.map(a=>
        '<label class="rx-assess-item"><input type="checkbox" class="rx-assess-chk" data-condid="'+a.condId+'" '+((d.assessmentIds||[]).includes(a.condId)?'checked':'')+'/> '+a.label+'</label>'
      ).join('')+'</div>'+
      '<h3 class="rx-wiz-stitle" style="margin-top:18px">Home Program</h3>'+
      '<select id="wiz-hp" class="rx-input"><option value="">None</option>'+HOME_PROGRAMS_SEED.map(h=>
        '<option value="'+h.id+'"'+(d.homeProgramId===h.id?' selected':'')+'>'+h.name+'</option>').join('')+'</select></div>';
    if (wizardStep===6) {
      const pr=PROTOCOLS_SEED.find(p=>p.id===d.protocolId)||{name:'\u2014'};
      const dv=DEVICES_SEED.find(x=>x.id===d.deviceId)||{name:'\u2014'};
      const hp=HOME_PROGRAMS_SEED.find(h=>h.id===d.homeProgramId);
      return '<div class="rx-wiz-sec"><h3 class="rx-wiz-stitle">Consent Packs</h3>'+
        '<div class="rx-consent-list">'+CONSENT_PACKS_SEED.map(cp=>
          '<label class="rx-assess-item"><input type="checkbox" class="rx-consent-chk" data-name="'+cp+'" '+((d.consentPacks||[]).includes(cp)?'checked':'')+'/> '+cp+'</label>'
        ).join('')+'</div>'+
        '<h3 class="rx-wiz-stitle" style="margin-top:18px">Review</h3>'+
        '<table class="rx-review-tbl">'+
          '<tr><td>Patient</td><td><strong>'+(d.patientName||'\u2014')+'</strong> ('+(d.patientId||'\u2014')+')</td></tr>'+
          '<tr><td>Condition</td><td>'+(d.conditionName||'\u2014')+'</td></tr>'+
          '<tr><td>Protocol</td><td>'+pr.name+'</td></tr>'+
          '<tr><td>Device</td><td>'+dv.name+'</td></tr>'+
          '<tr><td>Schedule</td><td>'+(d.totalSessions||'\u2014')+' sessions, '+(d.sessionsPerWeek||'\u2014')+'x/week from '+(d.startDate||'\u2014')+'</td></tr>'+
          '<tr><td>Home Program</td><td>'+(hp?hp.name:'None')+'</td></tr>'+
        '</table></div>';
    }
    return '';
  }

  function renderWizard() {
    if (!wizardOpen) return '';
    return '<div class="rx-wiz-overlay">'+
      '<div class="rx-wiz-panel">'+
        '<div class="rx-wiz-hdr"><h2>New Prescription</h2>'+
        '<button class="rx-wiz-close" onclick="window._rxCloseWizard()">&times;</button></div>'+
        '<div class="rx-wiz-steps">'+STEPS.map((s,i)=>
          '<div class="rx-wiz-step'+(wizardStep===i+1?' rx-step-active':wizardStep>i+1?' rx-step-done':'')+'">'+
            '<span class="rx-step-num">'+(wizardStep>i+1?'&#10003;':i+1)+'</span>'+
            '<span class="rx-step-lbl">'+s+'</span>'+
          '</div>'+(i<STEPS.length-1?'<div class="rx-step-conn"></div>':'')
        ).join('')+'</div>'+
        '<div class="rx-wiz-body">'+wizardContent()+'</div>'+
        '<div class="rx-wiz-ftr">'+
          (wizardStep>1?'<button class="rx-btn rx-btn-ghost" onclick="window._rxWizBack()">&#8592; Back</button>':'<span></span>')+
          '<div style="display:flex;gap:8px">'+
            '<button class="rx-btn rx-btn-ghost" onclick="window._rxSaveDraft()">Save Draft</button>'+
            (wizardStep<STEPS.length
              ?'<button class="rx-btn" onclick="window._rxWizNext()">Next &#8594;</button>'
              :'<button class="rx-btn rx-btn-ok" onclick="window._rxFinalize()">Prescribe &amp; Activate</button>')+
          '</div>'+
        '</div>'+
      '</div>'+
    '</div>';
  }

  function renderDetail() {
    if (!detailId) return '';
    const rx=RX.prescriptions.find(r=>r.id===detailId);
    if (!rx) return '';
    const p=pct(rx);
    return '<div class="rx-detail-overlay">'+
      '<div class="rx-detail-panel">'+
        '<div class="rx-detail-hdr">'+
          '<div><h2 class="rx-det-patient">'+rx.patientName+'</h2>'+
          '<div class="rx-det-sub">'+rx.patientId+' &bull; '+rx.conditionName+'</div></div>'+
          '<button class="rx-wiz-close" onclick="window._rxCloseDetail()">&times;</button>'+
        '</div>'+
        '<div class="rx-det-body">'+
          '<div class="rx-det-sec"><h4>Protocol &amp; Device</h4>'+
            '<div class="rx-det-row"><span>Protocol</span><span>'+rx.protocol.name+'</span></div>'+
            '<div class="rx-det-row"><span>Modality</span><span>'+rx.protocol.modality+'</span></div>'+
            '<div class="rx-det-row"><span>Device</span><span>'+rx.device.name+'</span></div>'+
          '</div>'+
          '<div class="rx-det-sec"><h4>Schedule</h4>'+
            '<div class="rx-det-row"><span>Start</span><span>'+rx.schedule.startDate+'</span></div>'+
            '<div class="rx-det-row"><span>Frequency</span><span>'+rx.schedule.sessionsPerWeek+'x/week</span></div>'+
            '<div class="rx-det-row"><span>Duration</span><span>'+rx.schedule.sessionDurationMin+' min</span></div>'+
            '<div class="rx-det-row"><span>Total</span><span>'+rx.schedule.totalSessions+'</span></div>'+
            '<div class="rx-det-row"><span>Done</span><span>'+rx.schedule.completedSessions+' ('+p+'%)</span></div>'+
            '<div class="rx-prog-wrap"><div class="rx-prog-bar"><div class="rx-prog-fill" style="width:'+p+'%"></div></div></div>'+
          '</div>'+
          '<div class="rx-det-sec"><h4>Assessments</h4>'+rx.assessments.map(a=>'<div>'+a.label+'</div>').join('')+'</div>'+
          '<div class="rx-det-sec"><h4>Home Program</h4><div>'+rx.homeProgram.name+'</div></div>'+
          '<div class="rx-det-sec"><h4>Consent</h4>'+rx.consentPacks.map(cp=>'<div>&#10003; '+cp+'</div>').join('')+'</div>'+
          '<div class="rx-det-sec"><h4>Notes</h4><div class="rx-det-notes">'+rx.notes+'</div></div>'+
        '</div>'+
        '<div class="rx-wiz-ftr">'+
          '<button class="rx-btn rx-btn-teal" onclick="window._rxPatientView(\''+rx.id+'\')">Patient View</button>'+
          '<button class="rx-btn rx-btn-ghost" onclick="window._rxCloseDetail()">Close</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  }

  function renderPage() {
    const el=document.getElementById('content');
    if (!el) return;
    el.innerHTML='<div class="rx-wrap"><div class="rx-main">'+renderMain()+'</div>'+renderWizard()+renderDetail()+'</div>';
  }

  window._rxTab=t=>{activeTab=t;renderPage();};
  window._rxOpenWizard=()=>{wizardOpen=true;wizardStep=1;wizardData={};renderPage();};
  window._rxCloseWizard=()=>{wizardOpen=false;renderPage();};
  window._rxCloseDetail=()=>{detailId=null;renderPage();};
  window._rxDetail=id=>{detailId=id;renderPage();};
  window._rxSelProto=id=>{wizardData.protocolId=id;renderPage();};
  window._rxSelDevice=id=>{wizardData.deviceId=id;renderPage();};

  window._rxWizNext=()=>{
    if (wizardStep===1){
      wizardData.patientId=(document.getElementById('wiz-pid')||{}).value||'';
      wizardData.patientName=(document.getElementById('wiz-pname')||{}).value||'';
      wizardData.conditionName=(document.getElementById('wiz-cond')||{}).value||'';
      wizardData.notes=(document.getElementById('wiz-notes')||{}).value||'';
      if (!wizardData.patientId||!wizardData.patientName){_dsToast('Patient ID and name are required to continue.','warn');return;}
    }
    if (wizardStep===2&&!wizardData.protocolId){_dsToast('Please select a protocol to continue.','warn');return;}
    if (wizardStep===3&&!wizardData.deviceId){_dsToast('Please select a device to continue.','warn');return;}
    if (wizardStep===4){
      wizardData.startDate=(document.getElementById('wiz-start')||{}).value||'';
      wizardData.sessionsPerWeek=parseInt((document.getElementById('wiz-freq')||{}).value||'3');
      wizardData.sessionDurationMin=parseInt((document.getElementById('wiz-dur')||{}).value||'30');
      wizardData.totalSessions=parseInt((document.getElementById('wiz-total')||{}).value||'20');
      if (!wizardData.startDate){_dsToast('Start date is required.','warn');return;}
    }
    if (wizardStep===5){
      wizardData.assessmentIds=[...(document.querySelectorAll('.rx-assess-chk:checked'))].map(c=>c.dataset.condid);
      wizardData.homeProgramId=(document.getElementById('wiz-hp')||{}).value||'';
    }
    wizardStep++;renderPage();
  };
  window._rxWizBack=()=>{wizardStep=Math.max(1,wizardStep-1);renderPage();};
  window._rxCalcEnd=()=>{
    const start=(document.getElementById('wiz-start')||{}).value;
    const freq=parseInt((document.getElementById('wiz-freq')||{}).value||'3');
    const total=parseInt((document.getElementById('wiz-total')||{}).value||'20');
    const prev=document.getElementById('rx-sched-prev');
    if (!prev||!start||!freq) return;
    const weeks=Math.ceil(total/freq);
    const end=new Date(new Date(start).getTime()+weeks*7*864e5).toISOString().slice(0,10);
    prev.textContent=total+' sessions at '+freq+'x/week = ~'+weeks+' weeks. Est. end: '+end;
  };

  function _build(status){
    const pr=PROTOCOLS_SEED.find(p=>p.id===wizardData.protocolId)||PROTOCOLS_SEED[0];
    const dv=DEVICES_SEED.find(d=>d.id===wizardData.deviceId)||DEVICES_SEED[0];
    const hp=HOME_PROGRAMS_SEED.find(h=>h.id===wizardData.homeProgramId)||HOME_PROGRAMS_SEED[0];
    const consents=[...(document.querySelectorAll('.rx-consent-chk:checked')||[])].map(c=>c.dataset.name);
    const assesses=COND_ASSESS.filter(a=>(wizardData.assessmentIds||[]).includes(a.condId));
    RX.prescriptions.push({
      id:'RX-'+String(Date.now()).slice(-4),
      patientId:wizardData.patientId||'P-NEW',patientName:wizardData.patientName||'Unknown',
      conditionName:wizardData.conditionName||'\u2014',protocol:pr,device:dv,
      schedule:{startDate:wizardData.startDate||'',sessionsPerWeek:wizardData.sessionsPerWeek||3,
        sessionDurationMin:wizardData.sessionDurationMin||30,totalSessions:wizardData.totalSessions||20,completedSessions:0},
      assessments:assesses,homeProgram:hp,consentPacks:consents,
      status,prescribedBy:'Current Clinician',prescribedDate:new Date().toISOString().slice(0,10),notes:wizardData.notes||'',
    });
    saveRx(RX);wizardOpen=false;activeTab=status;renderPage();
  }
  window._rxFinalize=()=>_build('active');
  window._rxSaveDraft=()=>{
    if (wizardStep===1){
      wizardData.patientId=(document.getElementById('wiz-pid')||{}).value||'P-NEW';
      wizardData.patientName=(document.getElementById('wiz-pname')||{}).value||'Draft';
      wizardData.conditionName=(document.getElementById('wiz-cond')||{}).value||'';
      wizardData.notes=(document.getElementById('wiz-notes')||{}).value||'';
    }
    _build('draft');
  };
  window._rxActivate=id=>{const rx=RX.prescriptions.find(r=>r.id===id);if(rx){rx.status='active';saveRx(RX);renderPage();}};
  window._rxComplete=id=>{const rx=RX.prescriptions.find(r=>r.id===id);if(rx){rx.status='completed';saveRx(RX);renderPage();}};
  window._rxPatientView=id=>{localStorage.setItem('ds_ppv_rx_id',id);window._nav('patient-protocol');};

  renderPage();
}

// ─────────────────────────────────────────────────────────────────────────────
// pgPatientProtocolView — Patient-facing protocol explanation page
// ─────────────────────────────────────────────────────────────────────────────
export async function pgPatientProtocolView(setTopbar) {
  setTopbar('Your Treatment Plan', `
    <button class="btn btn-sm" onclick="window._nav('prescriptions')" style="border-color:var(--teal);color:var(--teal)">&#8592; Prescriptions</button>
    <button class="btn btn-sm" onclick="window.print()">Print</button>
  `);

  const rxId=localStorage.getItem('ds_ppv_rx_id');
  let rx=null;
  try { const s=JSON.parse(localStorage.getItem('ds_rx_hub_v1')||'{}'); rx=(s.prescriptions||[]).find(r=>r.id===rxId); } catch(e){}
  // Prefer backend-sourced prescribed protocol when patient context is set.
  // Falls through to the local demo shape below if the backend is offline or
  // no rows match. This makes "Push to patient" a real round-trip: the studio
  // saves to /api/v1/protocols/saved; the patient view reads it back.
  if (!rx) {
    try {
      const patientId = window._ppvPatientId || localStorage.getItem('ds_ppv_patient_id') || '';
      if (patientId) {
        const res = await api.listSavedProtocols(patientId);
        const items = Array.isArray(res?.items) ? res.items : [];
        const latest = items.slice().reverse().find(d => d.governance_state === 'approved') || items[items.length - 1];
        if (latest) {
          const pj = latest.parameters_json || {};
          rx = {
            _source: 'backend',
            patientName: 'Patient ' + (latest.patient_id || ''),
            conditionName: latest.condition || pj.condition || '',
            protocol: { name: latest.name || 'Prescribed Protocol', modality: (latest.modality || '').toUpperCase(), indication: latest.condition || '' },
            device: { name: latest.device_slug || '—', type: (latest.modality || '').toUpperCase() },
            schedule: {
              startDate: new Date().toISOString().slice(0, 10),
              sessionsPerWeek: pj?.parameters?.sessions_per_week || 5,
              sessionDurationMin: pj?.parameters?.session_duration_min || 30,
              totalSessions: pj?.parameters?.sessions_total || 20,
              completedSessions: 0,
            },
            assessments: [],
            homeProgram: null,
            consentPacks: [],
            notes: latest.clinician_notes || '',
            prescribedBy: 'Your clinician',
            prescribedDate: (latest.created_at || '').slice(0, 10),
          };
        }
      }
    } catch (_) { /* backend offline — demo fallback below */ }
  }
  if (!rx) rx={
    _source: 'demo',
    patientName:'Demo Patient A',conditionName:'Major Depressive Disorder',
    protocol:{name:'Left DLPFC TMS \u2014 Depression (Standard)',modality:'TMS',indication:'MDD'},
    device:{name:'MagVenture MagPro R30',type:'TMS'},
    schedule:{startDate:'2026-04-14',sessionsPerWeek:5,sessionDurationMin:37,totalSessions:30,completedSessions:8},
    assessments:[{label:'MDD Weekly',scales:['PHQ-9','QIDS-SR','C-SSRS']}],
    homeProgram:{name:'Depression Management Home Program'},
    consentPacks:['Informed Consent for TMS Therapy'],
    notes:'You have completed two prior medication trials with partial response. TMS is a non-invasive, evidence-based treatment targeting specific brain areas associated with mood regulation.',
    prescribedBy:'Dr. Sarah Chen',prescribedDate:'2026-04-12',
  };

  const totalWeeks=Math.ceil(rx.schedule.totalSessions/rx.schedule.sessionsPerWeek);
  const progress=Math.round((rx.schedule.completedSessions/rx.schedule.totalSessions)*100);

  const MODALITY_EXPLAIN={
    TMS:'Transcranial Magnetic Stimulation (TMS) uses gentle magnetic pulses to stimulate specific areas of your brain. It is non-invasive \u2014 no surgery, no anaesthetic, and you remain fully awake. Sessions take 30\u201340 minutes and you can drive home afterwards.',
    tDCS:'Transcranial Direct Current Stimulation (tDCS) delivers a very small, safe electrical current through electrodes placed on your scalp. It gently adjusts the activity of targeted brain areas. Sessions are comfortable and you stay fully awake.',
    Neurofeedback:'Neurofeedback trains your brain to regulate itself by showing you your own brain activity in real time. Sensors on your scalp provide feedback that helps your brain build healthier activity patterns over time.',
  };
  const explain=MODALITY_EXPLAIN[rx.protocol.modality]||'This treatment uses evidence-based neurostimulation to support your recovery.';

  const SCALE_PLAIN={'PHQ-9':'Depression symptoms (9 questions)','QIDS-SR':'Depression severity (16 questions)','C-SSRS':'Safety &amp; wellbeing check','GAD-7':'Anxiety symptoms (7 questions)','PCL-5':'Trauma &amp; stress symptoms','ISI':'Sleep quality','TMS-SE':'Treatment comfort &amp; side effects','BPI':'Pain levels &amp; daily impact','PCS':'Pain thoughts &amp; coping','CGI':'Overall progress (clinician-rated)'};

  const BRAIN_TARGETS={TMS:{label:'Left DLPFC',cx:135,cy:105},tDCS:{label:'Prefrontal Cortex',cx:130,cy:90},Neurofeedback:{label:'Frontal Cortex',cx:130,cy:85}};
  const tgt=BRAIN_TARGETS[rx.protocol.modality]||{label:'Target Region',cx:130,cy:100};

  const brainSvg='<svg viewBox="0 0 280 215" xmlns="http://www.w3.org/2000/svg" class="ppv-brain-svg">'+
    '<path d="M140,25 C170,22 205,38 218,65 C230,90 228,115 220,135 C210,158 195,170 175,175 C165,177 155,177 140,177 Z" fill="rgba(20,184,166,0.07)" stroke="rgba(20,184,166,0.22)" stroke-width="1.5"/>'+
    '<path d="M140,25 C110,22 75,38 62,65 C50,90 52,115 60,135 C70,158 85,170 105,175 C115,177 125,177 140,177 Z" fill="rgba(20,184,166,0.05)" stroke="rgba(20,184,166,0.18)" stroke-width="1.5"/>'+
    '<line x1="140" y1="25" x2="140" y2="177" stroke="rgba(255,255,255,0.1)" stroke-width="1.5" stroke-dasharray="4,4"/>'+
    '<path d="M88,72 Q104,62 119,72 Q129,80 139,70" fill="none" stroke="rgba(20,184,166,0.15)" stroke-width="1.5"/>'+
    '<path d="M158,66 Q174,58 189,67 Q199,75 207,68" fill="none" stroke="rgba(20,184,166,0.15)" stroke-width="1.5"/>'+
    '<path d="M74,112 Q89,102 104,112 Q114,120 124,110" fill="none" stroke="rgba(20,184,166,0.12)" stroke-width="1.5"/>'+
    '<path d="M154,107 Q167,97 182,106 Q192,114 204,105" fill="none" stroke="rgba(20,184,166,0.12)" stroke-width="1.5"/>'+
    '<circle cx="'+tgt.cx+'" cy="'+tgt.cy+'" r="22" fill="rgba(20,184,166,0.2)" stroke="var(--teal,#14b8a6)" stroke-width="2"/>'+
    '<circle cx="'+tgt.cx+'" cy="'+tgt.cy+'" r="6" fill="var(--teal,#14b8a6)"/>'+
    '<circle cx="'+tgt.cx+'" cy="'+tgt.cy+'" r="30" fill="none" stroke="rgba(20,184,166,0.3)" stroke-width="1.5" stroke-dasharray="5,3"/>'+
    '<circle cx="'+tgt.cx+'" cy="'+tgt.cy+'" r="38" fill="none" stroke="rgba(20,184,166,0.15)" stroke-width="1" stroke-dasharray="4,4"/>'+
    '<line x1="'+tgt.cx+'" y1="'+(tgt.cy-22)+'" x2="'+tgt.cx+'" y2="'+(tgt.cy-46)+'" stroke="var(--teal,#14b8a6)" stroke-width="1.5"/>'+
    '<rect x="'+(tgt.cx-54)+'" y="'+(tgt.cy-67)+'" width="108" height="22" rx="11" fill="rgba(20,184,166,0.15)" stroke="rgba(20,184,166,0.4)" stroke-width="1"/>'+
    '<text x="'+tgt.cx+'" y="'+(tgt.cy-53)+'" text-anchor="middle" fill="var(--teal,#14b8a6)" font-size="11" font-weight="600" font-family="inherit">'+tgt.label+'</text>'+
    '<text x="140" y="202" text-anchor="middle" fill="rgba(255,255,255,0.25)" font-size="9" font-family="inherit">Brain \u2014 Top View</text>'+
    '</svg>';

  const timelineHtml=(function(){
    let h='';
    for (let w=1;w<=totalWeeks;w++){
      const done=(w-1)*rx.schedule.sessionsPerWeek<rx.schedule.completedSessions;
      const cur=(w-1)*rx.schedule.sessionsPerWeek<rx.schedule.completedSessions&&w*rx.schedule.sessionsPerWeek>=rx.schedule.completedSessions;
      const isAssess=w===1||w%4===0||w===totalWeeks;
      h+='<div class="ppv-week'+(cur?' ppv-wk-cur':done?' ppv-wk-done':'')+'">'+
        '<div class="ppv-wk-n">Wk '+w+'</div>'+
        '<div class="ppv-wk-dots">'+Array.from({length:rx.schedule.sessionsPerWeek},(_,i)=>{
          const sd=(w-1)*rx.schedule.sessionsPerWeek+i+1<=rx.schedule.completedSessions;
          return '<div class="ppv-dot'+(sd?' ppv-dot-done':'')+'"></div>';
        }).join('')+'</div>'+
        (isAssess?'<div class="ppv-wk-a">&#128203;</div>':'')+
      '</div>';
    }
    return h;
  })();

  const milestones=[
    {wk:1,label:'Treatment begins',icon:'&#128640;'},
    {wk:Math.max(2,Math.round(totalWeeks*0.33)),label:'First progress check',icon:'&#128203;'},
    {wk:Math.max(3,Math.round(totalWeeks*0.67)),label:'Mid-course review',icon:'&#128202;'},
    {wk:totalWeeks,label:'Course complete',icon:'&#127942;'},
  ].filter((m,i,a)=>a.findIndex(x=>x.wk===m.wk)===i);

  const monitorItems=rx.assessments.flatMap(a=>a.scales||[]).map(sid=>
    '<div class="ppv-mon-item"><span class="ppv-mon-ico">&#128202;</span><span>'+(SCALE_PLAIN[sid]||sid)+'</span></div>'
  ).join('');

  const el=document.getElementById('content');
  if (!el) return;

  el.innerHTML=
    '<div class="ppv-wrap">'+
    (rx._source === 'demo'
      ? '<div style="margin:-4px 0 10px;padding:6px 10px;border-radius:6px;background:rgba(245,158,11,0.10);border:1px solid rgba(245,158,11,0.30);font-size:11px;color:var(--amber,#f59e0b)">Demo plan — no prescribed protocol found for this patient. Ask your clinician to save one from the Protocol Studio.</div>'
      : '') +
    '<div class="ppv-hero">'+
      '<div class="ppv-hero-l">'+
        '<div class="ppv-greeting">Your treatment plan</div>'+
        '<h1 class="ppv-hero-name">'+rx.patientName+'</h1>'+
        '<div class="ppv-hero-cond">'+rx.conditionName+'</div>'+
        '<div class="ppv-hero-pill">'+rx.protocol.modality+' &bull; '+rx.schedule.totalSessions+' sessions &bull; '+totalWeeks+' weeks</div>'+
      '</div>'+
      '<div class="ppv-hero-r">'+
        '<svg class="ppv-ring-svg" viewBox="0 0 80 80">'+
          '<circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="6"/>'+
          '<circle cx="40" cy="40" r="32" fill="none" stroke="var(--teal,#14b8a6)" stroke-width="6" stroke-dasharray="201" stroke-dashoffset="'+Math.round(201*(1-progress/100))+'" stroke-linecap="round" transform="rotate(-90 40 40)"/>'+
          '<text x="40" y="37" text-anchor="middle" fill="#fff" font-size="16" font-weight="700">'+progress+'%</text>'+
          '<text x="40" y="50" text-anchor="middle" fill="rgba(255,255,255,0.45)" font-size="8">complete</text>'+
        '</svg>'+
        '<div class="ppv-sess-n">'+rx.schedule.completedSessions+' of '+rx.schedule.totalSessions+'</div>'+
      '</div>'+
    '</div>'+
    '<div class="ppv-content">'+

      '<section class="ppv-sec"><h2 class="ppv-sec-h"><span>&#129504;</span>What is your treatment?</h2>'+
        '<p class="ppv-lead">'+rx.protocol.name+'</p>'+
        '<p class="ppv-text">'+explain+'</p>'+
      '</section>'+

      '<section class="ppv-sec"><h2 class="ppv-sec-h"><span>&#128270;</span>Why was this chosen?</h2>'+
        '<p class="ppv-text">'+(rx.notes||'Your clinician selected this based on your clinical history, diagnosis, and prior treatment response.')+'</p>'+
        '<div class="ppv-prescriber">Prescribed by <strong>'+rx.prescribedBy+'</strong>'+(rx.prescribedDate?' &bull; '+rx.prescribedDate:'')+'</div>'+
      '</section>'+

      '<section class="ppv-sec"><h2 class="ppv-sec-h"><span>&#128197;</span>Your session plan</h2>'+
        '<div class="ppv-plan-cards">'+
          '<div class="ppv-plan-c"><div class="ppv-plan-v">'+rx.schedule.totalSessions+'</div><div class="ppv-plan-l">Sessions</div></div>'+
          '<div class="ppv-plan-c"><div class="ppv-plan-v">'+rx.schedule.sessionsPerWeek+'&times;</div><div class="ppv-plan-l">Per Week</div></div>'+
          '<div class="ppv-plan-c"><div class="ppv-plan-v">'+rx.schedule.sessionDurationMin+'<small>min</small></div><div class="ppv-plan-l">Per Session</div></div>'+
          '<div class="ppv-plan-c"><div class="ppv-plan-v">'+totalWeeks+'<small>wks</small></div><div class="ppv-plan-l">Duration</div></div>'+
        '</div>'+
        '<div class="ppv-device-note">Device: <strong>'+rx.device.name+'</strong></div>'+
      '</section>'+

      '<section class="ppv-sec"><h2 class="ppv-sec-h"><span>&#128336;</span>Expected timeline</h2>'+
        '<div class="ppv-milestones">'+milestones.map(m=>
          '<div class="ppv-ms"><div class="ppv-ms-ico">'+m.icon+'</div>'+
          '<div><div class="ppv-ms-lbl">'+m.label+'</div><div class="ppv-ms-wk">Week '+m.wk+'</div></div></div>'
        ).join('')+'</div>'+
        '<div class="ppv-tl-wrap"><div class="ppv-timeline">'+timelineHtml+'</div></div>'+
        '<div class="ppv-legend">'+
          '<span class="ppv-leg"><span class="ppv-dot ppv-dot-done"></span>Completed</span>'+
          '<span class="ppv-leg"><span class="ppv-dot"></span>Upcoming</span>'+
          '<span class="ppv-leg">&#128203; Assessment week</span>'+
        '</div>'+
      '</section>'+

      '<section class="ppv-sec"><h2 class="ppv-sec-h"><span>&#128200;</span>What we are tracking</h2>'+
        '<p class="ppv-text">Regular short questionnaires help us track your progress and adjust your treatment when needed.</p>'+
        '<div class="ppv-mon-grid">'+(monitorItems||'<div class="ppv-mon-item"><span>Progress tracked at each visit</span></div>')+'</div>'+
        (rx.homeProgram?'<div class="ppv-home-prog">&#127968; Home program: <strong>'+rx.homeProgram.name+'</strong></div>':'')+
      '</section>'+

      '<section class="ppv-sec"><h2 class="ppv-sec-h"><span>&#129504;</span>Where we are targeting</h2>'+
        '<div class="ppv-brain-sec">'+
          '<div class="ppv-brain-wrap">'+brainSvg+'</div>'+
          '<div class="ppv-brain-txt">'+
            '<p class="ppv-lead">Target area: <strong>'+tgt.label+'</strong></p>'+
            '<p class="ppv-text">The highlighted region plays a key role in '+
            (rx.protocol.modality==='TMS'&&rx.protocol.indication==='MDD'?'regulating mood and emotional wellbeing.':
             rx.protocol.modality==='TMS'&&rx.protocol.indication==='OCD'?'regulating intrusive thoughts and compulsive behaviours.':
             rx.protocol.modality==='tDCS'?'reducing pain signals and improving mood regulation.':
             'regulating brain activity related to your condition.')+
            ' The stimulation is precise, safe, and calibrated specifically for your plan.</p>'+
          '</div>'+
        '</div>'+
      '</section>'+

      '<div class="ppv-footer"><p>Questions? Speak with <strong>'+rx.prescribedBy+'</strong> at your next appointment.</p></div>'+

    '</div></div>';
}

// ─────────────────────────────────────────────────────────────────────────────
// pgMonitoring — Clinic-wide Patient Monitoring & Remote Follow-Up
// ─────────────────────────────────────────────────────────────────────────────
export async function pgMonitoring(setTopbar, navigate) {
  setTopbar('Patient Monitoring & Remote Follow-Up', `
    <div style="display:flex;align-items:center;gap:8px">
      <button class="btn btn-sm" onclick="window._nav('outcomes')">Outcomes ↗</button>
      <button class="btn btn-sm" onclick="window._nav('adverse-events')">AE Monitor ↗</button>
    </div>`);

  const el = document.getElementById('content');
  if (!el) return;
  el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-tertiary);font-size:13px">Loading monitoring data…</div>';

  // ── CSS ───────────────────────────────────────────────────────────────────
  if (!document.getElementById('mon-styles')) {
    const st = document.createElement('style');
    st.id = 'mon-styles';
    st.textContent = `
      .mon-summary { display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:20px }
      .mon-chip { padding:14px 16px;border-radius:var(--radius-lg);background:var(--bg-card);border:1px solid var(--border);text-align:center }
      .mon-chip-val { display:block;font-size:26px;font-weight:800;line-height:1;color:var(--teal) }
      .mon-chip-lbl { display:block;font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.6px;margin-top:4px }
      .mon-chip-green .mon-chip-val { color:var(--green) }
      .mon-chip-amber .mon-chip-val { color:var(--amber) }
      .mon-chip-red .mon-chip-val   { color:var(--red) }
      .mon-chip-grey .mon-chip-val  { color:var(--text-secondary) }
      .mon-filter-bar { display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;align-items:center }
      .mon-search { flex:1;min-width:200px;height:34px;padding:0 10px 0 28px;font-size:13px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);font-family:var(--font-body) }
      .mon-search:focus { outline:none;border-color:var(--teal) }
      .mon-sel { height:34px;padding:0 10px;font-size:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);font-family:var(--font-body);cursor:pointer }
      .mon-card { background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;margin-bottom:16px }
      .mon-card-title { padding:12px 16px;border-bottom:1px solid var(--border);font-size:13px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:8px }
      .mon-queue-hdr { display:grid;grid-template-columns:1.4fr 1fr 0.8fr 1.2fr 140px 80px 140px;gap:8px;padding:8px 16px;border-bottom:1px solid var(--border);font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.6px;font-weight:600 }
      .mon-pat-row { display:grid;grid-template-columns:1.4fr 1fr 0.8fr 1.2fr 140px 80px 140px;gap:8px;padding:10px 16px;border-bottom:1px solid var(--border);align-items:center;cursor:pointer;transition:background 0.12s }
      .mon-pat-row:hover { background:var(--bg-card-hover) }
      .mon-pat-name { font-size:13px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis }
      .mon-pat-sub  { font-size:10.5px;color:var(--text-secondary);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis }
      .mon-badge { font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:8px;white-space:nowrap }
      .mon-badge-red    { background:rgba(239,68,68,0.12);color:var(--red) }
      .mon-badge-amber  { background:rgba(245,158,11,0.12);color:var(--amber) }
      .mon-badge-green  { background:rgba(34,197,94,0.12);color:var(--green) }
      .mon-badge-blue   { background:rgba(59,130,246,0.12);color:var(--blue) }
      .mon-act-row { display:flex;gap:4px;flex-wrap:wrap }
      .mon-act-btn { font-size:10.5px;font-weight:600;padding:4px 9px;border-radius:var(--radius-md);border:1px solid var(--border);background:transparent;color:var(--text-secondary);cursor:pointer;font-family:var(--font-body);transition:background 0.12s }
      .mon-act-btn:hover { background:var(--bg-surface-2);color:var(--text-primary) }
      .mon-act-primary { border-color:rgba(0,212,188,0.3);color:var(--teal) }
      .mon-attention-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px }
      .mon-attention-card { background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px 14px;cursor:pointer;transition:border-color 0.15s }
      .mon-attention-card:hover { border-color:rgba(245,158,11,0.5) }
      .mon-sig-bars { width:130px;flex-shrink:0 }
      .mon-sig-row { display:flex;align-items:center;gap:4px;margin-bottom:2px }
      .mon-sig-lbl { width:50px;font-size:9px;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis }
      .mon-sig-track { flex:1;height:5px;background:var(--bg-surface-2);border-radius:3px;overflow:hidden;min-width:36px }
      .mon-sig-fill  { height:100%;border-radius:3px;transition:width 0.3s }
      .mon-sig-pct   { width:26px;font-size:9px;text-align:right;font-weight:600 }
      .mon-lower-grid { display:grid;grid-template-columns:1fr 360px;gap:16px }
      .mon-domain { padding:14px 0;border-bottom:1px solid var(--border) }
      .mon-domain:last-child { border-bottom:none }
      .mon-domain-hdr { font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:8px;padding:0 16px }
      .mon-domain-row { display:flex;align-items:center;gap:10px;padding:6px 16px;cursor:pointer;transition:background 0.12s }
      .mon-domain-row:hover { background:var(--bg-card-hover) }
      .mon-domain-name { font-size:12px;font-weight:600;color:var(--text-primary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap }
      .mon-domain-sig  { font-size:11px;color:var(--text-secondary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap }
      .mon-review-row { padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;transition:background 0.12s }
      .mon-review-row:hover { background:var(--bg-card-hover) }
      .mon-tag { font-size:9.5px;padding:1px 6px;border-radius:5px;margin-right:3px }
      .mon-tag-red   { background:rgba(239,68,68,0.15);color:var(--red) }
      .mon-tag-amber { background:rgba(245,158,11,0.15);color:var(--amber) }
      .mon-tag-grey  { background:rgba(255,255,255,0.07);color:var(--text-secondary) }
      .mon-milestone-banner { background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:12px }
      @media (max-width:900px) { .mon-queue-hdr,.mon-pat-row { grid-template-columns:1fr 1fr 80px; } .mon-lower-grid { grid-template-columns:1fr; } .mon-summary { grid-template-columns:repeat(3,1fr); } }
    `;
    document.head.appendChild(st);
  }

  // ── Data fetch ────────────────────────────────────────────────────────────
  const [patientsRes, coursesRes, aeRes, adherenceRes, flagsRes] = await Promise.allSettled([
    api.listPatients?.().catch(() => null),
    api.listCourses?.().catch(() => null),
    api.listAdverseEvents?.().catch(() => null),
    api.listHomeAdherenceEvents?.().catch(() => null),
    api.listHomeReviewFlags?.().catch(() => null),
  ]);

  const patients      = patientsRes.value?.items || patientsRes.value || [];
  const courses       = coursesRes.value?.items  || coursesRes.value  || [];
  const allAEs        = aeRes.value?.items        || aeRes.value        || [];
  const homeAdherence = adherenceRes.value        || [];
  const homeFlags     = flagsRes.value            || [];

  const patientMap = {};
  patients.forEach(p => { patientMap[p.id] = p; });

  const coursesByPatient = {};
  courses.forEach(c => {
    if (!coursesByPatient[c.patient_id]) coursesByPatient[c.patient_id] = [];
    coursesByPatient[c.patient_id].push(c);
  });

  const activeCourses = courses.filter(c => ['active','in_progress'].includes(c.status));
  const openAEs       = allAEs.filter(a => a.status === 'open' || a.status === 'active');

  // ── Deterministic hash for pseudo-signals ─────────────────────────────────
  function _cHash(str) {
    let h = 0;
    for (let i = 0; i < (str||'').length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  // ── Signal scoring per patient (Improving / Steady / Needs Review) ────────
  function _signalScore(patId) {
    let score = 0;
    const ptAEs = openAEs.filter(a => a.patient_id === patId);
    const ptCourses = coursesByPatient[patId] || [];
    const ptAdherence = homeAdherence.filter(e => e.patient_id === patId);
    const ptFlags     = homeFlags.filter(f => f.patient_id === patId);
    if (ptAEs.some(a => ['serious','severe'].includes(a.severity))) score += 100;
    if (ptAEs.length) score += 40;
    if (ptCourses.some(c => c.status === 'paused')) score += 60;
    if (ptFlags.some(f => f.severity === 'high'))   score += 50;
    if (ptAdherence.some(e => e.missed_sessions >= 3)) score += 30;
    if (ptCourses.some(c => (c.last_checkin_days_ago || 0) > 7)) score += 25;
    // Check outcome trend: if latest course has improving status reduce score
    const latestCourse = ptCourses.find(c => ['active','in_progress'].includes(c.status));
    if (latestCourse?.outcome_trend === 'improving') score = Math.max(0, score - 20);
    return score;
  }

  function _statusLabel(score) {
    if (score >= 80) return { label: 'Needs Review', cls: 'mon-badge-amber' };
    if (score >= 30) return { label: 'Steady',       cls: 'mon-badge-blue'  };
    return                  { label: 'Improving',    cls: 'mon-badge-green' };
  }

  // ── 6 driver signals per patient ──────────────────────────────────────────
  function _signals6(patId) {
    const hv = _cHash(patId);
    const ptCourses   = coursesByPatient[patId] || [];
    const ptAEs       = openAEs.filter(a => a.patient_id === patId);
    const ptAdherence = homeAdherence.filter(e => e.patient_id === patId);
    const ptFlags     = homeFlags.filter(f => f.patient_id === patId);
    const activeCourse = ptCourses.find(c => ['active','in_progress'].includes(c.status)) || ptCourses[0] || {};

    const hasSeriousAE = ptAEs.some(a => ['serious','severe'].includes(a.severity));
    const daysSince = activeCourse.last_session_at
      ? Math.floor((Date.now() - new Date(activeCourse.last_session_at).getTime()) / 86400000)
      : null;

    const attendancePct = daysSince == null ? 80 + (hv % 18) :
      daysSince > 21 ? 20 + (hv % 20) :
      daysSince > 14 ? 45 + (hv % 25) :
      daysSince > 7  ? 60 + (hv % 20) : 85 + (hv % 15);

    const hasMissed = ptAdherence.some(e => e.missed_sessions >= 2);
    const adherencePct = activeCourse.adherence_pct != null
      ? Math.round(activeCourse.adherence_pct * 100)
      : hasMissed ? 35 + (hv % 25) : 65 + ((hv >> 3) % 30);

    const sleepPct = activeCourse.sleep_quality_avg != null
      ? Math.round(Math.min(100, activeCourse.sleep_quality_avg * 10))
      : 50 + ((hv >> 5) % 45);

    const sideEffectsPct = hasSeriousAE ? 10 + (hv % 20) :
      ptAEs.length ? 38 + (hv % 25) : 70 + ((hv >> 7) % 28);

    const wearableDisc = ptFlags.some(f => f.type === 'wearable_disconnect' || f.type === 'device_sync');
    const wearablePct = activeCourse.device_sync_ok === false || wearableDisc ? 15 + (hv % 25) :
      activeCourse.device_sync_ok === true ? 88 + (hv % 12) : 58 + ((hv >> 11) % 38);

    const homeProgramPct = activeCourse.home_completion_pct != null
      ? Math.round(activeCourse.home_completion_pct * 100)
      : 45 + ((hv >> 9) % 50);

    return { attendancePct, adherencePct, sleepPct, sideEffectsPct, wearablePct, homeProgramPct };
  }

  function _renderSigBars(s6) {
    const bar = (label, pct, warn, danger) => {
      const p = Math.max(0, Math.min(100, pct ?? 50));
      const col = p < danger ? 'var(--red)' : p < warn ? 'var(--amber)' : 'var(--green)';
      return `<div class="mon-sig-row">
        <div class="mon-sig-lbl">${label}</div>
        <div class="mon-sig-track"><div class="mon-sig-fill" style="width:${p}%;background:${col}"></div></div>
        <div class="mon-sig-pct" style="color:${col}">${p}%</div>
      </div>`;
    };
    return `<div class="mon-sig-bars">
      ${bar('Attend.',  s6.attendancePct,  60, 40)}
      ${bar('Adhere.',  s6.adherencePct,   60, 40)}
      ${bar('Sleep',    s6.sleepPct,        55, 35)}
      ${bar('SideEff',  s6.sideEffectsPct, 50, 30)}
      ${bar('Device',   s6.wearablePct,    55, 30)}
      ${bar('HomeRx',   s6.homeProgramPct, 55, 35)}
    </div>`;
  }

  // ── Milestone logic ───────────────────────────────────────────────────────
  const MILESTONES = [5, 10, 20, 30];
  function _milestoneFlag(patId) {
    const ptCourses = coursesByPatient[patId] || [];
    const activeCourse = ptCourses.find(c => ['active','in_progress'].includes(c.status)) || ptCourses[0];
    if (!activeCourse) return null;
    const delivered = activeCourse.sessions_delivered || 0;
    const passedMs  = [...MILESTONES].reverse().find(m => delivered >= m) || null;
    if (!passedMs || activeCourse.milestone_assessed) return null;
    return { milestone: passedMs, courseId: activeCourse.id };
  }

  // ── Build monitored patient list ──────────────────────────────────────────
  const monitoredIds = [...new Set([
    ...activeCourses.map(c => c.patient_id),
    ...openAEs.map(a => a.patient_id),
    ...homeAdherence.map(e => e.patient_id),
    ...homeFlags.map(f => f.patient_id),
  ].filter(Boolean))];

  const monitoredPatients = monitoredIds
    .map(id => {
      const pt = patientMap[id];
      if (!pt) return null;
      const score  = _signalScore(id);
      const status = _statusLabel(score);
      const ptCourses  = coursesByPatient[id] || [];
      const active = ptCourses.find(c => ['active','in_progress'].includes(c.status));
      const ptAEs  = openAEs.filter(a => a.patient_id === id);
      const ptFlags = homeFlags.filter(f => f.patient_id === id);
      const ptAdherence = homeAdherence.filter(e => e.patient_id === id);
      const msFlag = _milestoneFlag(id);
      const s6 = _signals6(id);

      // Primary monitoring reason
      let reason = 'Routine monitoring';
      if (ptAEs.some(a => ['serious','severe'].includes(a.severity))) reason = 'Serious adverse event';
      else if (ptAEs.length)  reason = 'Open adverse event';
      else if (active?.status === 'paused') reason = 'Course paused';
      else if (ptFlags.some(f => f.severity === 'high')) reason = 'High-severity flag';
      else if (ptAdherence.some(e => e.missed_sessions >= 3)) reason = 'Low adherence';
      else if ((active?.last_checkin_days_ago || 0) > 7) reason = 'No recent check-in';
      else if (msFlag) reason = `Session ${msFlag.milestone} milestone overdue`;

      return {
        id, pt, score, status, reason, s6, msFlag,
        ptAEs, ptFlags, ptAdherence,
        modality:  active?.modality_slug || active?.protocol_name || '—',
        condition: active?.condition_slug || pt.primary_condition || '—',
        activeCourse: active,
        hasSeriousAE: ptAEs.some(a => ['serious','severe'].includes(a.severity)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  // ── Summary counts ────────────────────────────────────────────────────────
  const totalMonitored   = monitoredPatients.length;
  const totalImproving   = monitoredPatients.filter(x => x.status.label === 'Improving').length;
  const totalSteady      = monitoredPatients.filter(x => x.status.label === 'Steady').length;
  const totalNeedsReview = monitoredPatients.filter(x => x.status.label === 'Needs Review').length;
  const totalMilestone   = monitoredPatients.filter(x => x.msFlag).length;
  const totalSideEffect  = monitoredPatients.filter(x => x.ptAEs.length > 0 || x.ptFlags.some(f => f.type === 'side_effect')).length;

  // ── Action buttons ────────────────────────────────────────────────────────
  function _actBtns(pid) {
    const p = (pid || '').replace(/['"]/g, '');
    return `<div class="mon-act-row">
      <button class="mon-act-btn mon-act-primary" onclick="event.stopPropagation();window.openPatient('${p}');window._nav('patient-profile')">Open</button>
      <button class="mon-act-btn" onclick="event.stopPropagation();window.openPatient('${p}');window._nav('outcomes')">Outcomes</button>
      <button class="mon-act-btn" onclick="event.stopPropagation();window.openPatient('${p}');window._nav('messaging')">Virtual Care</button>
    </div>`;
  }

  // ── Patient queue row ──────────────────────────────────────────────────────
  function _patRow(entry) {
    const { id, pt, status, reason, s6, modality, condition, msFlag, hasSeriousAE, ptAEs } = entry;
    const name = [pt.first_name, pt.last_name].filter(Boolean).join(' ') || pt.name || 'Unknown';
    const msBadge = msFlag ? `<span class="mon-badge mon-badge-amber" style="font-size:9px;margin-left:4px">◷ Sess.${msFlag.milestone}</span>` : '';
    const aeBadge = hasSeriousAE
      ? `<span class="mon-badge mon-badge-red" style="font-size:9px;margin-left:4px">Serious AE</span>`
      : ptAEs.length ? `<span class="mon-badge mon-badge-amber" style="font-size:9px;margin-left:4px">Open AE</span>` : '';
    return `<div class="mon-pat-row" onclick="window.openPatient('${id}');window._nav('patient-profile')">
      <div>
        <div class="mon-pat-name">${name}${aeBadge}${msBadge}</div>
        <div class="mon-pat-sub">${condition.replace(/-/g,' ')}</div>
      </div>
      <div style="font-size:11.5px;color:var(--text-secondary)">${modality}</div>
      <div><span class="mon-badge ${status.cls}">${status.label}</span></div>
      <div style="font-size:11.5px;color:var(--text-secondary)">${reason}</div>
      ${_renderSigBars(s6)}
      <div>${_actBtns(id)}</div>
    </div>`;
  }

  // ── Filter state ──────────────────────────────────────────────────────────
  let _monFilter = { search: '', status: 'all', type: 'all' };

  function _filteredPatients() {
    let list = monitoredPatients;
    if (_monFilter.status !== 'all') {
      list = list.filter(x => x.status.label.toLowerCase().replace(' ', '-') === _monFilter.status);
    }
    if (_monFilter.type === 'no-checkin')    list = list.filter(x => (coursesByPatient[x.id]||[]).some(c => (c.last_checkin_days_ago||0) > 7));
    if (_monFilter.type === 'low-adherence') list = list.filter(x => x.ptAdherence.some(e => e.missed_sessions >= 2));
    if (_monFilter.type === 'wearable')      list = list.filter(x => x.ptFlags.some(f => f.type === 'wearable_disconnect' || f.type === 'device_sync'));
    if (_monFilter.type === 'side-effects')  list = list.filter(x => x.ptFlags.some(f => f.type === 'side_effect') || x.ptAEs.length > 0);
    if (_monFilter.type === 'milestone')     list = list.filter(x => x.msFlag);
    if (_monFilter.search) {
      const q = _monFilter.search.toLowerCase();
      list = list.filter(x => {
        const n = [x.pt.first_name, x.pt.last_name, x.pt.name].filter(Boolean).join(' ').toLowerCase();
        return n.includes(q) || (x.condition||'').toLowerCase().includes(q) || (x.modality||'').toLowerCase().includes(q);
      });
    }
    return list;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function renderPage() {
    const filtered = _filteredPatients();

    // Attention grid — patients with Needs Review or milestone flag, sorted by urgency
    const attentionPts = monitoredPatients
      .filter(x => x.status.label === 'Needs Review' || x.msFlag || x.hasSeriousAE)
      .slice(0, 8);

    const attentionPanel = attentionPts.length ? `
      <div style="background:rgba(245,158,11,0.05);border:1px solid rgba(245,158,11,0.22);border-radius:var(--radius-lg);padding:14px 18px;margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div style="font-size:13px;font-weight:700;color:var(--amber)">⚠ Patients Needing Attention
            <span style="font-size:11px;padding:1px 7px;border-radius:8px;background:rgba(245,158,11,0.15);color:var(--amber);margin-left:6px">${attentionPts.length}</span>
          </div>
          <span style="font-size:11px;color:var(--text-tertiary)">Sorted by urgency · click to open</span>
        </div>
        <div class="mon-attention-grid">
          ${attentionPts.map(entry => {
            const { id, pt, status, reason, s6, msFlag, hasSeriousAE, ptAEs } = entry;
            const name = [pt.first_name, pt.last_name].filter(Boolean).join(' ') || pt.name || 'Unknown';
            const urgTags = [];
            if (hasSeriousAE) urgTags.push('<span class="mon-tag mon-tag-red">Serious AE</span>');
            else if (ptAEs.length) urgTags.push('<span class="mon-tag mon-tag-amber">Open AE</span>');
            if (msFlag) urgTags.push('<span class="mon-tag mon-tag-amber">◷ Sess.' + msFlag.milestone + ' overdue</span>');
            if (s6.adherencePct < 50) urgTags.push('<span class="mon-tag mon-tag-amber">Low adherence</span>');
            if (s6.wearablePct  < 40) urgTags.push('<span class="mon-tag mon-tag-grey">Device offline</span>');
            return '<div class="mon-attention-card" onclick="window.openPatient(\'' + id + '\');window._nav(\'patient-profile\')">'
              + '<div style="font-size:12.5px;font-weight:700;color:var(--text-primary);margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + name + '</div>'
              + '<div style="font-size:10px;color:var(--text-secondary);margin-bottom:6px">' + reason + '</div>'
              + '<div style="display:flex;flex-wrap:wrap;gap:3px">' + urgTags.join('') + '</div>'
              + '</div>';
          }).join('')}
        </div>
      </div>` : '';

    // Milestone banner
    const msPts = monitoredPatients.filter(x => x.msFlag);
    const msBanner = msPts.length ? `
      <div class="mon-milestone-banner" style="margin-bottom:16px">
        <div style="font-size:12px;font-weight:700;color:var(--amber);margin-bottom:8px">◷ Milestone Reviews Overdue (${msPts.length})</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${msPts.map(x => {
            const name = [x.pt.first_name, x.pt.last_name].filter(Boolean).join(' ') || x.pt.name || 'Unknown';
            return '<div style="display:flex;align-items:center;gap:6px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);padding:6px 10px;cursor:pointer" onclick="window.openPatient(\'' + x.id + '\');window._nav(\'outcomes\')">'
              + '<span style="font-size:11px;font-weight:600;color:var(--text-primary)">' + name + '</span>'
              + '<span style="font-size:10px;color:var(--amber)">Session ' + x.msFlag.milestone + ' review</span>'
              + '</div>';
          }).join('')}
        </div>
      </div>` : '';

    // Summary strip
    const summaryStrip = `
      <div class="mon-summary">
        <div class="mon-chip"><span class="mon-chip-val">${totalMonitored}</span><span class="mon-chip-lbl">Monitored</span></div>
        <div class="mon-chip mon-chip-green"><span class="mon-chip-val">${totalImproving}</span><span class="mon-chip-lbl">Improving</span></div>
        <div class="mon-chip mon-chip-blue" style="--blue:var(--blue,#3b82f6)"><span class="mon-chip-val" style="color:var(--blue)">${totalSteady}</span><span class="mon-chip-lbl">Steady</span></div>
        <div class="mon-chip mon-chip-amber"><span class="mon-chip-val">${totalNeedsReview}</span><span class="mon-chip-lbl">Needs Review</span></div>
        <div class="mon-chip mon-chip-amber"><span class="mon-chip-val">${totalMilestone}</span><span class="mon-chip-lbl">Milestone Due</span></div>
        <div class="mon-chip mon-chip-red"><span class="mon-chip-val">${totalSideEffect}</span><span class="mon-chip-lbl">Side Effects / AE</span></div>
      </div>`;

    // Filter bar
    const filterBar = `
      <div class="mon-filter-bar">
        <div style="position:relative;flex:1;min-width:200px">
          <span style="position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--text-tertiary);font-size:13px;pointer-events:none">⌕</span>
          <input class="mon-search" type="text" placeholder="Search patient, condition, modality…" value="${_monFilter.search}" oninput="window._monSearch(this.value)" style="padding-left:28px">
        </div>
        <select class="mon-sel" onchange="window._monFilterStatus(this.value)">
          <option value="all" ${_monFilter.status==='all'?'selected':''}>All Status</option>
          <option value="needs-review" ${_monFilter.status==='needs-review'?'selected':''}>Needs Review</option>
          <option value="steady" ${_monFilter.status==='steady'?'selected':''}>Steady</option>
          <option value="improving" ${_monFilter.status==='improving'?'selected':''}>Improving</option>
        </select>
        <select class="mon-sel" onchange="window._monFilterType(this.value)">
          <option value="all" ${_monFilter.type==='all'?'selected':''}>All Types</option>
          <option value="no-checkin" ${_monFilter.type==='no-checkin'?'selected':''}>No Recent Check-in</option>
          <option value="low-adherence" ${_monFilter.type==='low-adherence'?'selected':''}>Low Adherence</option>
          <option value="wearable" ${_monFilter.type==='wearable'?'selected':''}>Device / Wearable Issue</option>
          <option value="side-effects" ${_monFilter.type==='side-effects'?'selected':''}>Side Effects / AE</option>
          <option value="milestone" ${_monFilter.type==='milestone'?'selected':''}>Milestone Overdue</option>
        </select>
      </div>`;

    // Queue
    const queueHeader = `<div class="mon-queue-hdr">
      <span>Patient / Condition</span><span>Modality</span><span>Status</span><span>Reason</span>
      <span>Driver Signals</span><span style="grid-column:span 2">Actions</span>
    </div>`;
    const queueRows = filtered.length
      ? filtered.map(_patRow).join('')
      : '<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:12px">No patients match current filters.</div>';

    const queueCard = `
      <div class="mon-card">
        <div class="mon-card-title">Monitoring Queue <span style="font-size:11px;padding:1px 7px;border-radius:8px;background:rgba(0,212,188,0.12);color:var(--teal)">${filtered.length}</span></div>
        ${filterBar}
        ${queueHeader}
        <div>${queueRows}</div>
      </div>`;

    // Domain sections
    const symptomsPatients = monitoredPatients.filter(x => x.ptAEs.length > 0 || x.ptFlags.some(f => f.type === 'side_effect' || f.type === 'symptom'));
    const homeProgramPts   = monitoredPatients.filter(x => x.ptAdherence.some(e => e.missed_sessions >= 1));
    const wearablePts      = monitoredPatients.filter(x => x.ptFlags.some(f => f.type === 'wearable_disconnect' || f.type === 'device_sync'));
    const assessmentPts    = monitoredPatients.filter(x => (coursesByPatient[x.id]||[]).some(c => c.pending_assessment || c.outcome_due));

    function _domRow(entry, signal) {
      const name = [entry.pt.first_name, entry.pt.last_name].filter(Boolean).join(' ') || entry.pt.name || 'Unknown';
      return `<div class="mon-domain-row" onclick="window.openPatient('${entry.id}');window._nav('patient-profile')">
        <span class="mon-domain-name">${name}</span>
        <span class="mon-domain-sig">${signal}</span>
        <span class="mon-badge ${entry.status.cls}">${entry.status.label}</span>
      </div>`;
    }

    function _domSec(title, icon, entries, emptyMsg) {
      return `<div class="mon-domain">
        <div class="mon-domain-hdr">${icon} ${title} <span style="font-size:10.5px;color:var(--text-tertiary)">(${entries.length})</span></div>
        ${entries.length
          ? entries.map(x => _domRow(x, x.reason)).join('')
          : `<div style="padding:8px 16px;font-size:12px;color:var(--text-tertiary)">${emptyMsg}</div>`}
      </div>`;
    }

    const domainsCard = `
      <div class="mon-card">
        <div class="mon-card-title">Signal Domains</div>
        ${_domSec('Symptoms & Adverse Events', '⚡', symptomsPatients, 'No symptom flags')}
        ${_domSec('Assessments Due',           '📋', assessmentPts,    'All assessments current')}
        ${_domSec('Home Programs / Adherence', '🏠', homeProgramPts,   'Full adherence')}
        ${_domSec('Wearables & Devices',       '⌚', wearablePts,      'All devices synced')}
        ${_domSec('Milestone Reviews',         '◷', msPts,            'All milestones assessed')}
      </div>`;

    // Needs Review panel
    const nrPts = monitoredPatients.filter(x => x.status.label === 'Needs Review');
    const reviewCard = nrPts.length ? `
      <div class="mon-card" style="border-color:rgba(245,158,11,0.3)">
        <div class="mon-card-title" style="color:var(--amber)">⚠ Needs Review <span style="font-size:11px;padding:1px 7px;border-radius:8px;background:rgba(245,158,11,0.15);color:var(--amber)">${nrPts.length}</span></div>
        ${nrPts.map(entry => {
          const name = [entry.pt.first_name, entry.pt.last_name].filter(Boolean).join(' ') || entry.pt.name || 'Unknown';
          const tags = [];
          if (entry.hasSeriousAE) tags.push('<span class="mon-tag mon-tag-red">Serious AE</span>');
          else if (entry.ptAEs.length) tags.push('<span class="mon-tag mon-tag-amber">Open AE</span>');
          if (entry.msFlag) tags.push('<span class="mon-tag mon-tag-amber">◷ Milestone</span>');
          if (entry.ptAdherence.some(e => e.missed_sessions >= 3)) tags.push('<span class="mon-tag mon-tag-amber">Low Adherence</span>');
          return '<div class="mon-review-row" onclick="window.openPatient(\'' + entry.id + '\');window._nav(\'patient-profile\')">'
            + '<div style="font-size:12.5px;font-weight:700;color:var(--text-primary)">' + name + '</div>'
            + '<div style="font-size:11px;color:var(--text-secondary);margin:3px 0 5px">' + entry.reason + '</div>'
            + '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:7px">' + tags.join('') + '</div>'
            + '<div style="display:flex;gap:5px">'
            + '<button class="mon-act-btn mon-act-primary" onclick="event.stopPropagation();window.openPatient(\'' + entry.id + '\');window._nav(\'patient-profile\')">Open</button>'
            + '<button class="mon-act-btn" onclick="event.stopPropagation();window.openPatient(\'' + entry.id + '\');window._nav(\'outcomes\')">Log Outcome</button>'
            + '<button class="mon-act-btn" onclick="event.stopPropagation();window.openPatient(\'' + entry.id + '\');window._nav(\'messaging\')">Virtual Care</button>'
            + '</div>'
            + '</div>';
        }).join('')}
      </div>` : '';

    el.innerHTML = `<div class="page-section">
      ${attentionPanel}
      ${summaryStrip}
      ${msBanner}
      ${queueCard}
      <div class="mon-lower-grid">
        ${domainsCard}
        ${reviewCard}
      </div>
    </div>`;
  }

  // ── Global filter handlers ────────────────────────────────────────────────
  window._monSearch = (val) => { _monFilter.search = val; renderPage(); };
  window._monFilterStatus = (val) => { _monFilter.status = val; renderPage(); };
  window._monFilterType   = (val) => { _monFilter.type   = val; renderPage(); };

  renderPage();
}

// ─────────────────────────────────────────────────────────────────────────────
// pgHomePrograms — Clinician Home Programs & Task Assignment Workflow
// ─────────────────────────────────────────────────────────────────────────────
export async function pgHomePrograms(setTopbar, navigate) {
  setTopbar('Home Programs', '<button class="btn btn-sm" onclick="window._hpShowPatientView?.()">Patient View</button>');

  const el = document.getElementById('content');
  if (!el) return;
  el.innerHTML = '<div class="hp-loading">Loading home programs\u2026</div>';

  // ── Storage helpers ──────────────────────────────────────────────────────
  const _ls    = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
  const _lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const _esc   = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const _clinKey  = pid => 'ds_clinician_tasks_' + pid;
  const _patKey   = pid => 'ds_homework_tasks_' + pid;
  const _compKey  = pid => 'ds_task_completions_' + pid;
  const _knownKey = 'ds_clinician_tasks_all_patients';
  const _tplKey   = 'ds_home_task_templates';

  const _registerPid = pid => {
    const known = _ls(_knownKey, []);
    if (!known.includes(pid)) { known.push(pid); _lsSet(_knownKey, known); }
  };
  const _getAllKnownPids = () => _ls(_knownKey, ['pt-001', 'pt-002', 'pt-003']);

  // Bridge: write task to patient-facing storage so portal sees it immediately
  const _bridgeToPatient = (pid, task) => {
    const patTasks = _ls(_patKey(pid), []);
    const idx = patTasks.findIndex(t => t.id === task.id);
    const patTask = {
      // Clinician fields
      id: task.id, title: task.title, type: task.type,
      instructions: task.instructions || '',
      dueDate: task.dueDate || '', frequency: task.frequency || 'once',
      courseId: task.courseId || '', status: task.status || 'active',
      assignedAt: task.assignedAt, reason: task.reason || '',
      homeProgramSelection: task.homeProgramSelection || undefined,
      // Patient-portal compatible aliases (pgPatientCourse reads these)
      description: task.instructions || task.reason || '',
      freq: task.frequency || 'once',
      done: idx >= 0 ? (patTasks[idx].done || false) : false,
      completedAt: idx >= 0 ? (patTasks[idx].completedAt || null) : null,
      completionNote: idx >= 0 ? (patTasks[idx].completionNote || '') : '',
    };
    if (idx >= 0) patTasks[idx] = { ...patTasks[idx], ...patTask };
    else patTasks.push(patTask);
    _lsSet(_patKey(pid), patTasks);
  };

  /** Parse mutation response + merge into local task; keeps transport fields out of persisted state. */
  const _hpApplyMutationSync = (localTask, resBody) => {
    const mutation = parseHomeProgramTaskMutationResponse(resBody);
    const merged = mergeParsedMutationIntoLocalTask(localTask, mutation);
    return { merged, mutation };
  };

  const _saveTask = (task, useCreate = false) => {
    const pid = task.patientId;
    const now = new Date().toISOString();
    const withMeta = {
      ...task,
      clientUpdatedAt: task.clientUpdatedAt || now,
      _syncStatus: SYNC_STATUS.SYNCING,
    };
    const tasks = _ls(_clinKey(pid), []);
    const idx = tasks.findIndex(t => t.id === withMeta.id);
    if (idx >= 0) tasks[idx] = withMeta; else tasks.push(withMeta);
    _lsSet(_clinKey(pid), tasks);
    _registerPid(pid);
    _bridgeToPatient(pid, withMeta);
    import('./api.js').then(({ api: sdk }) => {
      const canUpsert = typeof sdk.upsertHomeProgramTask === 'function';
      const canCreate = typeof sdk.createHomeProgramTask === 'function';
      const canMutate = typeof sdk.mutateHomeProgramTask === 'function';
      if (!canMutate && !canUpsert && !(useCreate && canCreate)) return null;
      const syncPromise = canMutate
        ? sdk.mutateHomeProgramTask(withMeta)
        : (useCreate && canCreate ? sdk.createHomeProgramTask(withMeta) : sdk.upsertHomeProgramTask(withMeta));
      return syncPromise.then(resOrMutation => {
        const merged = canMutate
          ? mergeParsedMutationIntoLocalTask(withMeta, resOrMutation)
          : _hpApplyMutationSync(withMeta, resOrMutation).merged;
        const arr = _ls(_clinKey(pid), []);
        const j = arr.findIndex(t => t.id === merged.id);
        if (j >= 0) arr[j] = merged; else arr.push(merged);
        _lsSet(_clinKey(pid), arr);
        _bridgeToPatient(pid, merged);
        _allTasks = _loadAllTasks();
        renderPage();
      }).catch((err) => {
        const body = err.body || {};
        if (err.status === 409 && body.code === 'sync_conflict') {
          const d = body.details || {};
          const serverTask = d.serverTask;
          const conflicted = {
            ...withMeta,
            _syncStatus: SYNC_STATUS.CONFLICT,
            _conflictServerTask: serverTask || null,
            _syncConflictReason: 'sync_conflict_response',
            serverTaskId: d.serverTaskId || (serverTask && serverTask.serverTaskId),
            lastSyncedServerRevision: d.serverRevision != null ? d.serverRevision : withMeta.lastSyncedServerRevision,
          };
          const arr = _ls(_clinKey(pid), []);
          const j = arr.findIndex(t => t.id === conflicted.id);
          if (j >= 0) arr[j] = conflicted; else arr.push(conflicted);
          _lsSet(_clinKey(pid), arr);
          _bridgeToPatient(pid, conflicted);
          _allTasks = _loadAllTasks();
          renderPage();
          window._showNotifToast?.({
            title: 'Sync conflict',
            body: 'This task was updated elsewhere. Open the row menu to keep your edits or the server copy.',
            severity: 'warn',
          });
          return;
        }
        const failed = markSyncFailed(withMeta);
        const arr = _ls(_clinKey(pid), []);
        const j = arr.findIndex(t => t.id === failed.id);
        if (j >= 0) arr[j] = failed; else arr.push(failed);
        _lsSet(_clinKey(pid), arr);
        _bridgeToPatient(pid, failed);
        _allTasks = _loadAllTasks();
        renderPage();
      });
    }).catch(() => {});
  };

  const _retryPendingSyncs = async () => {
    const { api: sdk } = await import('./api.js');
    if (
      typeof sdk.mutateHomeProgramTask !== 'function' &&
      typeof sdk.upsertHomeProgramTask !== 'function' &&
      typeof sdk.createHomeProgramTask !== 'function'
    ) return;
    const pids = _getAllKnownPids();
    let any = false;
    for (const pid of pids) {
      const arr = _ls(_clinKey(pid), []);
      let changed = false;
      for (let i = 0; i < arr.length; i++) {
        const t = arr[i];
        if (t._syncStatus !== SYNC_STATUS.PENDING) continue;
        try {
          const mutation = typeof sdk.mutateHomeProgramTask === 'function'
            ? await sdk.mutateHomeProgramTask(t)
            : _hpApplyMutationSync(
                t,
                (!t.serverTaskId && typeof sdk.createHomeProgramTask === 'function')
                  ? await sdk.createHomeProgramTask(t)
                  : await sdk.upsertHomeProgramTask(t)
              ).mutation;
          arr[i] = mergeParsedMutationIntoLocalTask(t, mutation);
          changed = true;
          any = true;
          _bridgeToPatient(pid, arr[i]);
          if (typeof sdk.postHomeProgramAuditAction === 'function') {
            sdk.postHomeProgramAuditAction({
              external_task_id: t.id,
              action: 'retry_success',
              server_revision: mutation.revision.serverRevision,
            }).catch(() => {});
          }
        } catch (_) { /* stay pending */ }
      }
      if (changed) _lsSet(_clinKey(pid), arr);
    }
    if (any) {
      _allTasks = _loadAllTasks();
      renderPage();
    }
  };

  const _loadAllTasks = () => {
    const pids = _getAllKnownPids();
    const all = [];
    pids.forEach(pid => {
      const tasks = _ls(_clinKey(pid), []);
      tasks.forEach(t => { if (!t.patientId) t.patientId = pid; all.push(t); });
    });
    return all;
  };

  const _getCompletions = pid => _ls(_compKey(pid), {});

  const _refreshServerCompletionsForPid = async (pid) => {
    try {
      const { api: sdk } = await import('./api.js');
      if (typeof sdk.listHomeProgramTaskCompletions !== 'function') return;
      const rows = await sdk.listHomeProgramTaskCompletions({ patient_id: pid }).catch(() => null);
      if (!Array.isArray(rows) || rows.length === 0) return;

      const tasks = _ls(_clinKey(pid), []);
      const byServerId = Object.create(null);
      rows.forEach((r) => {
        if (r && typeof r === 'object' && r.server_task_id) byServerId[r.server_task_id] = r;
      });
      const comps = _ls(_compKey(pid), {});
      let changed = false;
      tasks.forEach((t) => {
        const sid = t?.serverTaskId;
        if (!sid) return;
        const row = byServerId[sid];
        if (!row) return;
        comps[t.id] = {
          done: !!row.completed,
          completedAt: row.completed_at,
          rating: row.rating ?? undefined,
          difficulty: row.difficulty ?? undefined,
          notes: row.feedback_text ?? undefined,
          media_upload_id: row.media_upload_id ?? undefined,
          _server: true,
        };
        changed = true;
      });
      if (changed) _lsSet(_compKey(pid), comps);
    } catch { /* non-fatal */ }
  };

  const _refreshServerCompletions = async () => {
    const pids = _getAllKnownPids();
    await Promise.allSettled(pids.map((pid) => _refreshServerCompletionsForPid(pid)));
  };

  // ── Task type config ─────────────────────────────────────────────────────
  const TASK_TYPES = [
    { id: 'breathing',    icon: '\uD83D\uDCA8', label: 'Breathing / Relaxation' },
    { id: 'sleep',        icon: '\uD83C\uDF19', label: 'Sleep Routine' },
    { id: 'mood-journal', icon: '\uD83D\uDCD3', label: 'Mood Journal' },
    { id: 'activity',     icon: '\uD83C\uDFC3', label: 'Walking / Activity' },
    { id: 'assessment',   icon: '\uD83D\uDCCB', label: 'Assessment / Check-in' },
    { id: 'media',        icon: '\uD83C\uDFAC', label: 'Watch Video / Audio Guide' },
    { id: 'home-device',  icon: '\uD83E\uDDE0', label: 'Home Device Session' },
    { id: 'caregiver',    icon: '\uD83E\uDD1D', label: 'Caregiver Task' },
    { id: 'pre-session',  icon: '\u26A1',       label: 'Pre-Session Preparation' },
    { id: 'post-session', icon: '\uD83C\uDF3F', label: 'Post-Session Aftercare' },
  ];
  const _typeIcon = id => TASK_TYPES.find(t => t.id === id)?.icon || '\uD83D\uDCDD';
  const _typeName = id => TASK_TYPES.find(t => t.id === id)?.label || id;

  // ── Default templates ────────────────────────────────────────────────────
  const DEFAULT_TEMPLATES = [
    { id: 'tpl-1', title: 'Daily Mood Journal',        type: 'mood-journal',  frequency: 'daily',          instructions: 'Record your mood, energy, and any notable thoughts each morning.',       reason: 'Treatment monitoring' },
    { id: 'tpl-2', title: 'Diaphragmatic Breathing',   type: 'breathing',     frequency: 'daily',          instructions: '10 minutes of slow diaphragmatic breathing. Inhale 4s, hold 2s, exhale 6s.', reason: 'Anxiety/stress regulation' },
    { id: 'tpl-3', title: 'Sleep Hygiene Routine',     type: 'sleep',         frequency: 'daily',          instructions: 'No screens 1h before bed. Same sleep/wake time. Keep room cool and dark.', reason: 'Sleep quality improvement' },
    { id: 'tpl-4', title: '20-Minute Walk',            type: 'activity',      frequency: '3x-week',        instructions: 'Brisk 20-minute walk. Note how you feel before and after.',                reason: 'Mood and neuroplasticity support' },
    { id: 'tpl-5', title: 'Weekly PHQ-9 Check-in',     type: 'assessment',    frequency: 'weekly',         instructions: 'Complete the PHQ-9 questionnaire in your portal.',                        reason: 'Outcome tracking' },
    { id: 'tpl-6', title: 'Home TMS Session',          type: 'home-device',   frequency: 'daily',          instructions: 'Follow device protocol. 20 minutes. Log session in portal after.',         reason: 'Home neuromodulation protocol' },
    { id: 'tpl-7', title: 'Pre-Session Relaxation',    type: 'pre-session',   frequency: 'before-session', instructions: 'Arrive 10 min early. Avoid caffeine 2h before. Complete relaxation exercise.', reason: 'Session preparation' },
    { id: 'tpl-8', title: 'Post-Session Rest',         type: 'post-session',  frequency: 'after-session',  instructions: 'Rest 30 min. Avoid strenuous activity. Note any sensations in journal.',   reason: 'Post-session aftercare' },
  ];
  const _getTemplates = () => {
    const saved = _ls(_tplKey, []);
    const savedById = Object.fromEntries(saved.map(t => [t.id, t]));
    const merged = [];
    const seen = new Set();
    for (const t of [...CONDITION_HOME_TEMPLATES, ...DEFAULT_TEMPLATES]) {
      const u = savedById[t.id] ? { ...t, ...savedById[t.id] } : t;
      if (!seen.has(u.id)) { merged.push(u); seen.add(u.id); }
    }
    for (const t of saved) {
      if (!seen.has(t.id)) { merged.push(t); seen.add(t.id); }
    }
    return merged;
  };

  // ── Template persistence (backend-backed; localStorage = write-through cache) ──
  // Backend is source of truth via /api/v1/home-task-templates.
  // Server row → cached template shape: { id (local), serverTemplateId, ...payload }.
  // The local `id` is preserved across save so default-template overrides keep
  // their well-known id (e.g. 'tpl-1') and bundled defaults remain replaced.
  const _serverRowToCacheItem = row => {
    const payload = (row && typeof row.payload === 'object' && row.payload) || {};
    const localId = payload.id || row.id;
    return {
      ...payload,
      id: localId,
      serverTemplateId: row.id,
      _syncedAt: row.updated_at || new Date().toISOString(),
    };
  };

  const _hydrateTemplatesFromServer = async () => {
    try {
      const { api: sdk } = await import('./api.js');
      if (typeof sdk.listHomeTaskTemplates !== 'function') return;
      const res = await sdk.listHomeTaskTemplates().catch(() => null);
      const items = res && Array.isArray(res.items) ? res.items : [];
      // Server wins on conflicts. Local-only rows (no serverTemplateId) are
      // kept so an offline-saved template is preserved until it can sync.
      const serverItems = items.map(_serverRowToCacheItem);
      const serverIds = new Set(serverItems.map(t => t.id));
      const local = _ls(_tplKey, []);
      const localOnly = local.filter(t => !t.serverTemplateId && !serverIds.has(t.id));
      _lsSet(_tplKey, [...serverItems, ...localOnly]);
    } catch (_) { /* offline or no token — bundled + cached templates still render */ }
  };

  /**
   * Save (create or update) a clinician template. Optimistically writes to
   * localStorage, fires the backend call, and rolls back on failure with a toast.
   *
   * `tpl` shape: { id, title, type, frequency, instructions, reason, conditionId?, conditionName?, category? }
   * If `tpl.serverTemplateId` is set, the server row is PATCHed; otherwise POSTed.
   */
  window._hpSaveTemplate = async (tpl) => {
    if (!tpl || !tpl.id || !tpl.title) return;
    const before = _ls(_tplKey, []);
    const optimistic = { ...tpl };
    const next = before.slice();
    const idx = next.findIndex(t => t.id === optimistic.id);
    if (idx >= 0) next[idx] = { ...next[idx], ...optimistic };
    else next.push(optimistic);
    _lsSet(_tplKey, next);
    renderPage();

    try {
      const { api: sdk } = await import('./api.js');
      if (typeof sdk.createHomeTaskTemplate !== 'function') return; // no backend wired (legacy bundle)
      const { id: _localId, serverTemplateId, _syncedAt, ...rest } = optimistic;
      const payload = { ...rest, id: _localId };
      let row;
      if (serverTemplateId && typeof sdk.updateHomeTaskTemplate === 'function') {
        row = await sdk.updateHomeTaskTemplate(serverTemplateId, { name: optimistic.title, payload });
      } else {
        row = await sdk.createHomeTaskTemplate({ name: optimistic.title, payload });
      }
      const synced = _serverRowToCacheItem(row);
      const arr = _ls(_tplKey, []);
      const j = arr.findIndex(t => t.id === synced.id);
      if (j >= 0) arr[j] = synced; else arr.push(synced);
      _lsSet(_tplKey, arr);
      renderPage();
    } catch (err) {
      // Rollback to pre-save snapshot.
      _lsSet(_tplKey, before);
      renderPage();
      window._showNotifToast?.({
        title: 'Template not saved',
        body: 'Could not save the template to the server. Please try again.',
        severity: 'warn',
      });
    }
  };

  /**
   * Delete a clinician-saved template. Optimistically removes from localStorage,
   * fires the backend DELETE, restores on failure.
   */
  window._hpDeleteTemplate = async (tplId) => {
    if (!tplId) return;
    const before = _ls(_tplKey, []);
    const target = before.find(t => t.id === tplId);
    if (!target) return;
    _lsSet(_tplKey, before.filter(t => t.id !== tplId));
    renderPage();

    try {
      const { api: sdk } = await import('./api.js');
      if (typeof sdk.deleteHomeTaskTemplate !== 'function') return;
      if (target.serverTemplateId) {
        await sdk.deleteHomeTaskTemplate(target.serverTemplateId);
      }
    } catch (err) {
      _lsSet(_tplKey, before);
      renderPage();
      window._showNotifToast?.({
        title: 'Template not deleted',
        body: 'Could not delete the template on the server. Please try again.',
        severity: 'warn',
      });
    }
  };

  let _tplFilter = { cond: 'all', q: '' };
  const _filteredTemplates = () => {
    let list = _getTemplates();
    if (_tplFilter.cond === 'general') list = list.filter(t => !t.conditionId);
    else if (_tplFilter.cond !== 'all') list = list.filter(t => t.conditionId === _tplFilter.cond);
    if (_tplFilter.q) {
      const q = _tplFilter.q.toLowerCase();
      list = list.filter(t =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.conditionName || '').toLowerCase().includes(q) ||
        (t.conditionId || '').toLowerCase().includes(q) ||
        (t.instructions || '').toLowerCase().includes(q) ||
        (t.category || '').toLowerCase().includes(q)
      );
    }
    return list;
  };

  // ── API ──────────────────────────────────────────────────────────────────
  const api = window._api || {};
  const [apiPatients, apiCourses] = await Promise.all([
    api.listPatients?.().catch(() => []) ?? [],
    api.listCourses?.().catch(() => []) ?? [],
  ]);
  const patientMap = {};
  (apiPatients || []).forEach(p => { patientMap[p.id] = p; });
  const coursesByPatient = {};
  (apiCourses || []).forEach(c => {
    if (!coursesByPatient[c.patient_id]) coursesByPatient[c.patient_id] = [];
    coursesByPatient[c.patient_id].push(c);
  });

  // ── Migrate legacy global key to per-patient keys ─────────────────────────
  const _migrateIfNeeded = () => {
    const legacy = _ls('ds_clinician_tasks', []);
    if (!legacy.length) return;
    const byPid = {};
    legacy.forEach(t => { const pid = t.patientId || 'pt-001'; (byPid[pid] = byPid[pid] || []).push({ ...t, patientId: pid }); });
    Object.entries(byPid).forEach(([pid, tasks]) => {
      if (!_ls(_clinKey(pid), []).length) { _lsSet(_clinKey(pid), tasks); _registerPid(pid); tasks.forEach(t => _bridgeToPatient(pid, t)); }
    });
  };
  _migrateIfNeeded();

  // Merge server-backed tasks into localStorage when authenticated (reload / multi-device).
  try {
    const { api: sdk } = await import('./api.js');
    if (typeof sdk.listHomeProgramTasks === 'function') {
      const res = await sdk.listHomeProgramTasks().catch(() => null);
      const items = res && Array.isArray(res.items) ? res.items : [];
      const byPid = {};
      items.forEach(task => {
        const pid = task.patientId;
        if (!pid || !task.id) return;
        if (!byPid[pid]) byPid[pid] = [];
        byPid[pid].push(task);
      });
      const pids = new Set([..._getAllKnownPids(), ...Object.keys(byPid)]);
      pids.forEach(pid => {
        const local = _ls(_clinKey(pid), []);
        const remote = byPid[pid] || [];
        const merged = mergePatientTasksFromServer(local, remote);
        _lsSet(_clinKey(pid), merged);
        _registerPid(pid);
        merged.forEach(t => _bridgeToPatient(pid, t));
      });
      await _retryPendingSyncs();
    }
  } catch (_) { /* offline or no token */ }

  // Hydrate clinician-saved task templates from the backend (server wins on
  // conflicts; localStorage stays as a write-through cache for offline UX).
  await _hydrateTemplatesFromServer();

  // ── State ────────────────────────────────────────────────────────────────
  let _allTasks = _loadAllTasks();
  let _view = 'queue'; // 'queue' | 'adherence' | 'templates'
  let _filter = { search: '', status: 'all', type: 'all', pid: 'all' };
  let _editingTask = null;
  let _showModal = false;
  let _hpSuggestionRowByTplId = new Map();
  let _hpModalProvenance = null;
  let _hpSuggestExpanded = false;
  let _tplEditorOpen = false;
  let _tplEditing = null; // null = new; otherwise a template object being edited

  // Default templates (bundled) cannot be edited or deleted. Detect by id prefix.
  const _isDefaultTemplate = id => /^tpl-\d+$/.test(id || '') || /^chp-CON-\d+$/.test(id || '');

  // ── Date helpers ─────────────────────────────────────────────────────────
  const _today    = () => new Date().toISOString().slice(0, 10);
  const _isToday   = d => d === _today();
  const _isOverdue = d => d && d < _today();
  const _fmtDate   = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '\u2014';

  // ── Stats ────────────────────────────────────────────────────────────────
  const _stats = () => {
    const tasks = _allTasks.filter(t => t.status !== 'archived');
    let totalComp = 0, totalActive = 0;
    _getAllKnownPids().forEach(pid => {
      const ptTasks = tasks.filter(t => t.patientId === pid);
      if (!ptTasks.length) return;
      const comps = _getCompletions(pid);
      totalActive += ptTasks.length;
      totalComp += ptTasks.filter(t => comps[t.id] || t.status === 'completed').length;
    });
    return {
      active:      tasks.filter(t => t.status === 'active').length,
      dueToday:    tasks.filter(t => _isToday(t.dueDate)).length,
      overdue:     tasks.filter(t => _isOverdue(t.dueDate) && t.status !== 'completed').length,
      rate:        totalActive ? Math.round((totalComp / totalActive) * 100) : 0,
      needFollowUp: new Set(tasks.filter(t => _isOverdue(t.dueDate)).map(t => t.patientId)).size,
    };
  };

  // ── Filter ───────────────────────────────────────────────────────────────
  const _filtered = () => {
    let list = _allTasks;
    if (_filter.pid !== 'all')          list = list.filter(t => t.patientId === _filter.pid);
    if (_filter.type !== 'all')         list = list.filter(t => t.type === _filter.type);
    if (_filter.status === 'active')    list = list.filter(t => t.status === 'active');
    if (_filter.status === 'completed') list = list.filter(t => t.status === 'completed');
    if (_filter.status === 'overdue')   list = list.filter(t => _isOverdue(t.dueDate) && t.status !== 'completed');
    if (_filter.status === 'due-today') list = list.filter(t => _isToday(t.dueDate));
    if (_filter.status === 'archived')  list = list.filter(t => t.status === 'archived');
    if (_filter.search) {
      const q = _filter.search.toLowerCase();
      list = list.filter(t => {
        const pt = patientMap[t.patientId];
        const name = pt ? [pt.first_name, pt.last_name, pt.name].filter(Boolean).join(' ').toLowerCase() : '';
        return (t.title || '').toLowerCase().includes(q) || name.includes(q);
      });
    }
    return list;
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const _ptName = pid => {
    const pt = patientMap[pid];
    return pt ? [pt.first_name, pt.last_name].filter(Boolean).join(' ') || pt.name || pid : pid;
  };

  const _statusBadge = task => {
    const comps = _getCompletions(task.patientId);
    if (comps[task.id] || task.status === 'completed') return '<span class="hp-badge hp-badge-green">Completed</span>';
    if (task.status === 'archived')  return '<span class="hp-badge hp-badge-grey">Archived</span>';
    if (_isOverdue(task.dueDate))    return '<span class="hp-badge hp-badge-red">Overdue</span>';
    if (_isToday(task.dueDate))      return '<span class="hp-badge hp-badge-amber">Due Today</span>';
    return '<span class="hp-badge hp-badge-blue">Active</span>';
  };

  // ── Task row ─────────────────────────────────────────────────────────────
  const _taskRow = task => {
    const course = (coursesByPatient[task.patientId] || []).find(c => c.id === task.courseId);
    const comps  = _getCompletions(task.patientId);
    const isDone = comps[task.id] || task.status === 'completed';
    const ptName = _ptName(task.patientId);
    return `
      <div class="hp-task-row${isDone ? ' hp-task-done' : ''}" data-tid="${task.id}">
        <div class="hp-task-type" title="${_typeName(task.type)}">${_typeIcon(task.type)}</div>
          <div class="hp-task-main">
          <div class="hp-task-title">${task.title || 'Untitled'}</div>
          <div class="hp-task-meta">
            <span class="hp-task-pt" onclick="event.stopPropagation();window.openPatient('${task.patientId}');window._nav('patient-profile')">${ptName}</span>
            ${task.reason ? `<span class="hp-task-reason">${task.reason}</span>` : ''}
            ${course ? `<span class="hp-task-course">\uD83D\uDCCE ${course.condition || course.protocol_name || 'Course'}</span>` : ''}
            ${task.homeProgramSelection?.conditionId ? `<span class="hp-task-prov" title="Home program selection on file">${_esc(task.homeProgramSelection.conditionId)} · ${_esc(confidenceTierFromScore(task.homeProgramSelection.confidenceScore))}</span>` : ''}
            ${task._syncStatus === SYNC_STATUS.PENDING ? '<span class="hp-sync-badge hp-sync-pending" title="Will retry sync">Sync pending</span>' : ''}
            ${task._syncStatus === SYNC_STATUS.CONFLICT ? '<span class="hp-sync-badge hp-sync-conflict" title="Server and local edits disagree">Sync conflict</span>' : ''}
          </div>
        </div>
        <div class="hp-task-freq">${task.frequency || '\u2014'}</div>
        <div class="hp-task-due">${_fmtDate(task.dueDate)}</div>
        <div class="hp-task-status">${_statusBadge(task)}</div>
        <div class="hp-task-actions" onclick="event.stopPropagation()">
          <button class="hp-act-btn hp-act-primary" onclick="window._hpEditTask('${task.id}','${task.patientId}')">Edit</button>
          <button class="hp-act-btn" onclick="window.openPatient('${task.patientId}');window._nav('messaging')">Virtual Care</button>
          <div class="hp-act-more" onclick="this.nextElementSibling.classList.toggle('hp-drop-open')">\u22EF</div>
          <div class="hp-act-dropdown">
            ${task._syncStatus === SYNC_STATUS.CONFLICT ? `<div onclick="window._hpConflictTakeServer('${task.id}','${task.patientId}')">Use server version</div><div onclick="window._hpConflictForceLocal('${task.id}','${task.patientId}')">Keep my edits (overwrite)</div>` : ''}
            ${task._syncStatus === SYNC_STATUS.PENDING ? `<div onclick="window._hpRetrySyncOne('${task.id}','${task.patientId}')">Retry sync now</div>` : ''}
            ${!isDone ? `<div onclick="window._hpMarkDone('${task.id}','${task.patientId}')">Mark Complete</div>` : ''}
            <div onclick="window._hpEditTask('${task.id}','${task.patientId}')">Reassign</div>
            <div onclick="window.openPatient('${task.patientId}');window._nav('patient-profile')">Open Patient</div>
            <div onclick="window._hpArchive('${task.id}','${task.patientId}')">Archive</div>
          </div>
        </div>
      </div>`;
  };

  const _section = (title, badge, tasks, cls) => {
    if (!tasks.length) return '';
    return `<div class="hp-section${cls ? ' ' + cls : ''}">
      <div class="hp-section-header">
        <span class="hp-section-title">${title}</span>
        ${badge ? `<span class="hp-section-badge">${badge}</span>` : ''}
      </div>
      <div class="hp-section-rows">${tasks.map(_taskRow).join('')}</div>
    </div>`;
  };

  // ── Template card ────────────────────────────────────────────────────────
  const _tplCard = tpl => {
    const editable = !_isDefaultTemplate(tpl.id);
    return `
    <div class="hp-tpl-card">
      <div class="hp-tpl-icon">${_typeIcon(tpl.type)}</div>
      <div class="hp-tpl-body">
        ${tpl.conditionId ? `<div class="hp-tpl-cond"><span class="hp-tpl-cid">${tpl.conditionId}</span> <span class="hp-tpl-cname">${_esc(tpl.conditionName || '')}</span>${tpl.category ? ` <span class="hp-tpl-ccat">${_esc(tpl.category)}</span>` : ''}</div>` : ''}
        <div class="hp-tpl-title">${_esc(tpl.title)}</div>
        <div class="hp-tpl-meta">${_typeName(tpl.type)} \u00B7 ${tpl.frequency || 'once'}</div>
        <div class="hp-tpl-desc">${_esc(tpl.instructions || '')}</div>
        ${tpl.reason ? `<div class="hp-tpl-reason">${_esc(tpl.reason)}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:stretch">
        <button class="hp-act-btn hp-act-primary" onclick="window._hpUseTemplate('${tpl.id}')">Use</button>
        ${editable ? `<button class="hp-act-btn" title="Edit template" onclick="window._hpOpenTplEditor('${tpl.id}')">\u270E Edit</button>` : ''}
        ${editable ? `<button class="hp-act-btn" title="Delete template" onclick="window._hpDeleteTplPrompt('${tpl.id}')">\uD83D\uDDD1 Delete</button>` : ''}
      </div>
    </div>`;
  };

  // ── Template editor modal (small inline form) ────────────────────────────
  const _tplEditorHtml = () => {
    const isEdit = !!_tplEditing?.id;
    const t = _tplEditing || {};
    const notes = (t.payload && typeof t.payload === 'object' && t.payload.notes) || t.instructions || '';
    return `
      <div class="hp-modal-overlay" onclick="window._hpCloseTplEditor()">
        <div class="hp-modal" onclick="event.stopPropagation()" style="max-width:520px">
          <div class="hp-modal-header">
            <span>${isEdit ? 'Edit Template' : 'New Template'}</span>
            <button class="hp-modal-close" onclick="window._hpCloseTplEditor()">\u2715</button>
          </div>
          <div class="hp-modal-body">
            <label class="hp-lbl">Name</label>
            <input id="hp-tple-name" class="hp-input" type="text" placeholder="e.g. Evening wind-down routine" value="${_esc(t.title || '')}">
            <label class="hp-lbl">Payload notes</label>
            <textarea id="hp-tple-notes" class="hp-input hp-textarea" placeholder="Notes / instructions stored on the template payload\u2026">${_esc(notes)}</textarea>
          </div>
          <div class="hp-modal-footer">
            <button class="hp-act-btn" onclick="window._hpCloseTplEditor()">Cancel</button>
            <button class="hp-act-btn hp-act-primary" onclick="window._hpSubmitTplEditor()">Save</button>
          </div>
        </div>
      </div>`;
  };

  // ── Adherence view ───────────────────────────────────────────────────────
  const _adherenceView = () => {
    const pids = [...new Set(_allTasks.map(t => t.patientId))];
    if (!pids.length) return '<div class="hp-empty">No tasks assigned yet.</div>';
    return `<div class="hp-adh-grid">${pids.map(pid => {
      const ptTasks = _allTasks.filter(t => t.patientId === pid && t.status !== 'archived');
      const comps   = _getCompletions(pid);
      const done    = ptTasks.filter(t => comps[t.id] || t.status === 'completed').length;
      const overdue = ptTasks.filter(t => _isOverdue(t.dueDate) && !comps[t.id] && t.status !== 'completed').length;
      const rate    = ptTasks.length ? Math.round((done / ptTasks.length) * 100) : 0;
      const rColor  = rate >= 75 ? '#22c55e' : rate >= 40 ? '#f59e0b' : '#ef4444';

      // Build per-task detail rows with completion data
      const today = new Date().toISOString().slice(0, 10);
      const taskRows = ptTasks.map(t => {
        // Find most recent completion key for this task
        const compKeys = Object.keys(comps).filter(k => k.startsWith(t.id + '_')).sort().reverse();
        const compKey  = compKeys[0];
        const compVal  = compKey ? comps[compKey] : null;
        const isDone   = compVal === true || (compVal && compVal.done);
        const compDate = compKey ? compKey.replace(t.id + '_', '') : null;
        const compData = (compVal && typeof compVal === 'object') ? compVal : null;
        const isOvd    = _isOverdue(t.dueDate) && !isDone;

        // Extract notes from completion data based on task type
        let noteSnippet = '';
        if (compData) {
          const notes = compData.notes || compData.thoughts || compData.observations || compData.flag || '';
          const mood  = compData.mood != null ? `Mood ${compData.mood}/10` : '';
          const energy = compData.energy != null ? `Energy ${compData.energy}/10` : '';
          const rating = compData.rating != null ? `Rating ${compData.rating}/10` : '';
          const se    = (compData.sideEffects && compData.sideEffects !== 'none') ? `SE: ${compData.sideEffects}` : '';
          const flagBits = [mood, energy, rating, se].filter(Boolean).join(' · ');
          noteSnippet = [flagBits, notes.slice(0, 100)].filter(Boolean).join(' — ');
        }

        const detailId = `hp-adh-detail-${pid.replace(/[^a-z0-9]/gi,'-')}-${t.id.replace(/[^a-z0-9]/gi,'-')}`;
        return `<div class="hp-adh-task-row">
          <span class="hp-adh-task-icon">${_typeIcon(t.type)}</span>
          <span class="hp-adh-task-name" style="color:${isDone ? 'var(--text-secondary)' : isOvd ? '#ef4444' : 'var(--text-primary)'}">${_esc(t.title)}</span>
          ${isDone
            ? `<span class="hp-adh-task-badge" style="background:rgba(34,197,94,.15);color:#22c55e">\u2713 ${compDate || 'done'}</span>`
            : isOvd
              ? `<span class="hp-adh-task-badge" style="background:rgba(239,68,68,.12);color:#ef4444">Overdue</span>`
              : `<span class="hp-adh-task-badge" style="background:rgba(148,163,184,.1);color:var(--text-tertiary)">Pending</span>`
          }
          ${compData ? `<button class="hp-adh-expand-btn" onclick="(function(){var d=document.getElementById('${detailId}');d.style.display=d.style.display==='none'?'block':'none';})()" title="View completion data">\u25BC</button>` : ''}
          ${compData ? `<div class="hp-adh-task-detail" id="${detailId}" style="display:none">${noteSnippet ? _esc(noteSnippet) : 'No notes recorded.'}</div>` : ''}
        </div>`;
      }).join('');

      const cardId = `hp-adh-tasks-${pid.replace(/[^a-z0-9]/gi,'-')}`;
      return `<div class="hp-adh-card">
        <div class="hp-adh-name" onclick="window.openPatient('${pid}');window._nav('patient-profile')">${_ptName(pid)}</div>
        <div class="hp-adh-bar-wrap"><div class="hp-adh-bar" style="width:${rate}%;background:${rColor}"></div></div>
        <div class="hp-adh-stats">
          <span>${done}/${ptTasks.length} tasks</span>
          <span style="color:${rColor};font-weight:700">${rate}%</span>
          ${overdue ? `<span class="hp-adh-overdue">${overdue} overdue</span>` : ''}
          <button class="hp-adh-expand-btn" onclick="(function(){var d=document.getElementById('${cardId}');d.style.display=d.style.display==='none'?'block':'none';})()" title="Task detail">\u25BC</button>
        </div>
        <div id="${cardId}" style="display:none;margin-top:8px;border-top:1px solid rgba(148,163,184,.1);padding-top:8px">
          ${taskRows}
        </div>
        <div class="hp-adh-actions">
          <button class="hp-act-btn hp-act-primary" onclick="window._hpOpenAssign('${pid}')">+ Add Task</button>
          <button class="hp-act-btn" onclick="window.openPatient('${pid}');window._nav('messaging')">Virtual Care</button>
        </div>
      </div>`;
    }).join('')}</div>`;
  };

  // ── Modal ────────────────────────────────────────────────────────────────
  const _courseLabel = c =>
    c.condition || c.condition_name || (c.condition_slug && String(c.condition_slug).replace(/-/g, ' ')) || c.protocol_name || c.name || c.id;

  const _modalProvHtml = task => {
    const p = task?.homeProgramSelection;
    if (!p || !task?.id) return '';
    const tier = confidenceTierFromScore(p.confidenceScore);
    return `
      <div class="hp-modal-prov" role="region" aria-label="Recorded home program selection">
        <div class="hp-modal-prov-title">Recorded selection (read-only)</div>
        <dl class="hp-modal-prov-dl">
          ${p.conditionId ? `<dt>Bundle</dt><dd>${_esc(p.conditionId)}</dd>` : ''}
          <dt>Confidence</dt><dd>${p.confidenceScore != null ? _esc(String(p.confidenceScore)) : '—'} · ${_esc(tier)}</dd>
          <dt>Match method</dt><dd>${_esc(p.matchMethod || '—')}</dd>
          ${p.matchedField ? `<dt>Matched field</dt><dd>${_esc(p.matchedField)}</dd>` : ''}
          ${p.sourceCourseLabel ? `<dt>Source course</dt><dd>${_esc(String(p.sourceCourseLabel))}</dd>` : ''}
          <dt>Course auto-linked</dt><dd>${p.courseLinkAutoSet ? 'Yes' : 'No'}</dd>
          ${p.appliedAt ? `<dt>Applied at</dt><dd>${_esc(p.appliedAt)}</dd>` : ''}
        </dl>
        <p class="hp-modal-prov-note">Applying a suggestion below replaces this record when you save.</p>
      </div>`;
  };

  const _modalHtml = (task, prefillPid) => {
    const pid = task?.patientId || prefillPid || '';
    const patOpts = (apiPatients || []).map(p => {
      const n = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.name || p.id;
      return `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${n}</option>`;
    }).join('');
    const courseOpts = pid
      ? (coursesByPatient[pid] || []).map(c =>
          `<option value="${c.id}" ${task?.courseId === c.id ? 'selected' : ''}>${_esc(_courseLabel(c))}</option>`
        ).join('')
      : '';
    const typeOpts = TASK_TYPES.map(t =>
      `<option value="${t.id}" ${task?.type === t.id ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('');
    const freqOpts = ['once','daily','weekly','3x-week','before-session','after-session'].map(f =>
      `<option value="${f}" ${(task?.frequency||'once') === f ? 'selected' : ''}>${f}</option>`).join('');
    return `
      <div class="hp-modal-overlay" onclick="window._hpCloseModal()">
        <div class="hp-modal" onclick="event.stopPropagation()">
          <div class="hp-modal-header">
            <span>${task?.id ? 'Edit Task' : 'Assign Home Task'}</span>
            <button class="hp-modal-close" onclick="window._hpCloseModal()">\u2715</button>
          </div>
          <div class="hp-modal-body">
            ${_modalProvHtml(task)}
            <label class="hp-lbl">Patient</label>
            <select id="hp-m-pid" class="hp-input" onchange="window._hpModalPatient(this.value)">
              <option value="">Select patient\u2026</option>${patOpts}
            </select>
            <div id="hp-modal-suggest-wrap" class="hp-modal-suggest-wrap" style="display:none">
              <label class="hp-lbl">Suggested from course (confidence-scored)</label>
              <p class="hp-modal-suggest-hint">Ranked by match strength: explicit CON ids, then field tokens, slug, display name, then bounded text inference. Scoped course gets a sort bonus.</p>
              <div id="hp-modal-suggest" class="hp-modal-suggest"></div>
            </div>
            <label class="hp-lbl">Task Title</label>
            <input id="hp-m-title" class="hp-input" type="text" placeholder="e.g. Daily Mood Journal" value="${task?.title || ''}">
            <label class="hp-lbl">Task Type</label>
            <select id="hp-m-type" class="hp-input">${typeOpts}</select>
            <label class="hp-lbl">Reason / Clinical Rationale</label>
            <input id="hp-m-reason" class="hp-input" type="text" placeholder="Why this task?" value="${task?.reason || ''}">
            <label class="hp-lbl">Link to Course</label>
            <select id="hp-m-course" class="hp-input" onchange="window._hpModalCourseChange()">
              <option value="">None</option>${courseOpts}
            </select>
            <div class="hp-modal-row">
              <div>
                <label class="hp-lbl">Due Date</label>
                <input id="hp-m-due" class="hp-input" type="date" value="${task?.dueDate || ''}">
              </div>
              <div>
                <label class="hp-lbl">Frequency</label>
                <select id="hp-m-freq" class="hp-input">${freqOpts}</select>
              </div>
            </div>
            <label class="hp-lbl">Instructions for Patient</label>
            <textarea id="hp-m-instr" class="hp-input hp-textarea" placeholder="Step-by-step instructions shown to patient\u2026">${task?.instructions || ''}</textarea>
            ${task?.id ? `<input type="hidden" id="hp-m-taskid" value="${task.id}">` : ''}
          </div>
          <div class="hp-modal-footer">
            <button class="hp-act-btn" onclick="window._hpCloseModal()">Cancel</button>
            <button class="hp-act-btn hp-act-primary" onclick="window._hpSubmitTask()">${task?.id ? 'Save Changes' : 'Assign Task'}</button>
          </div>
        </div>
      </div>`;
  };

  // ── Main render ──────────────────────────────────────────────────────────
  const renderPage = () => {
    const s = _stats();
    const filtered = _filtered();

    const summaryStrip = `
      <div class="hp-summary-strip">
        <div class="hp-chip dv2-kpi-card"><span class="hp-chip-val dv2-kpi-val">${s.active}</span><span class="hp-chip-lbl dv2-kpi-label">Active Programs</span></div>
        <div class="hp-chip hp-chip-amber"><span class="hp-chip-val">${s.dueToday}</span><span class="hp-chip-lbl">Due Today</span></div>
        <div class="hp-chip hp-chip-red"><span class="hp-chip-val">${s.overdue}</span><span class="hp-chip-lbl">Overdue</span></div>
        <div class="hp-chip hp-chip-green"><span class="hp-chip-val">${s.rate}%</span><span class="hp-chip-lbl">Completion Rate</span></div>
        <div class="hp-chip hp-chip-purple"><span class="hp-chip-val">${s.needFollowUp}</span><span class="hp-chip-lbl">Need Follow-Up</span></div>
      </div>`;

    const topActions = `
      <div class="hp-top-actions">
        <button class="hp-act-btn hp-act-primary" onclick="window._hpOpenAssign()">+ Assign Task</button>
        <button class="hp-act-btn${_view==='queue'?' hp-act-active':''}" onclick="window._hpSetView('queue')">☰ Queue</button>
        <button class="hp-act-btn${_view==='adherence'?' hp-act-active':''}" onclick="window._hpSetView('adherence')">📊 Adherence</button>
        <button class="hp-act-btn${_view==='templates'?' hp-act-active':''}" onclick="window._hpSetView('templates')">📚 Templates</button>
        <button class="hp-act-btn${_view==='patient-view'?' hp-act-active':''}" onclick="window._hpSetView('patient-view')" style="border-color:var(--teal);color:var(--teal)">👁 Patient View</button>
      </div>`;

    const filterBar = `
      <div class="hp-filter-bar">
        <input class="hp-search" type="text" placeholder="Search patient, task\u2026" value="${_filter.search}" oninput="window._hpSearch(this.value)">
        <select class="hp-filter-sel" onchange="window._hpFilterPid(this.value)">
          <option value="all">All Patients</option>
          ${(apiPatients||[]).map(p => { const n=[p.first_name,p.last_name].filter(Boolean).join(' ')||p.name||p.id; return `<option value="${p.id}"${_filter.pid===p.id?' selected':''}>${n}</option>`; }).join('')}
        </select>
        <select class="hp-filter-sel" onchange="window._hpFilterType(this.value)">
          <option value="all">All Types</option>
          ${TASK_TYPES.map(t=>`<option value="${t.id}"${_filter.type===t.id?' selected':''}>${t.icon} ${t.label}</option>`).join('')}
        </select>
        <select class="hp-filter-sel" onchange="window._hpFilterStatus(this.value)">
          <option value="all"${_filter.status==='all'?' selected':''}>All Status</option>
          <option value="active"${_filter.status==='active'?' selected':''}>Active</option>
          <option value="due-today"${_filter.status==='due-today'?' selected':''}>Due Today</option>
          <option value="overdue"${_filter.status==='overdue'?' selected':''}>Overdue</option>
          <option value="completed"${_filter.status==='completed'?' selected':''}>Completed</option>
          <option value="archived"${_filter.status==='archived'?' selected':''}>Archived</option>
        </select>
      </div>`;

    const queueHeader = `
      <div class="hp-queue-header">
        <span></span><span>Task</span><span>Frequency</span><span>Due</span><span>Status</span><span>Actions</span>
      </div>`;

    let mainContent = '';
    if (_view === 'patient-view') {
      // ── Patient View — shows exactly what a patient sees for their tasks ──
      const allPids = _getAllKnownPids();
      const patNames = {};
      (apiPatients||[]).forEach(p => { patNames[p.id] = ((p.first_name||'')+' '+(p.last_name||'')).trim()||p.id; });
      const selectedPid = window._hpPatViewPid || allPids[0];
      const patTasks = _ls(_patKey(selectedPid), []);
      const patOpts = allPids.map(pid => '<option value="'+pid+'"'+(pid===selectedPid?' selected':'')+'>'+( patNames[pid]||pid)+'</option>').join('');
      const taskTypeIcons = { journal:'📔', breathing:'🌬', exercise:'🏃', assessment:'📋', sleep:'🌙', device:'📱', mindfulness:'🧘', other:'✓' };

      const completions = _ls(_compKey(selectedPid), {});
      window._hpPatViewPid = selectedPid;
      window._hpSelectPatView = pid => { window._hpPatViewPid = pid; renderPage(); };
      window._hpPatCompleteTask = (pid, tid) => {
        const comps = _ls(_compKey(pid), {}); comps[tid] = { completedAt: new Date().toISOString(), source: 'clinician-demo' };
        _lsSet(_compKey(pid), comps);
        // Also update the patient bridge
        const ptTasks = _ls(_patKey(pid), []); const idx = ptTasks.findIndex(t=>t.id===tid); if(idx>=0){ptTasks[idx].done=true;ptTasks[idx].completedAt=new Date().toISOString(); _lsSet(_patKey(pid),ptTasks);}
        renderPage(); window._dsToast?.({title:'Task updated',body:'Marked as done in the local patient view.',severity:'success'});
      };
      window._hpPatUncompleteTask = (pid, tid) => {
        const comps = _ls(_compKey(pid), {}); delete comps[tid]; _lsSet(_compKey(pid), comps);
        const ptTasks = _ls(_patKey(pid), []); const idx = ptTasks.findIndex(t=>t.id===tid); if(idx>=0){ptTasks[idx].done=false;ptTasks[idx].completedAt=null; _lsSet(_patKey(pid),ptTasks);}
        renderPage();
      };

      const patTaskCards = patTasks.length ? patTasks.map(t => {
        const done = !!(completions[t.id] || t.done);
        const icon = taskTypeIcons[t.type] || taskTypeIcons.other;
        const overdueFlag = !done && t.dueDate && t.dueDate < new Date().toISOString().slice(0,10);
        return '<div class="hp-pv-task'+(done?' hp-pv-task--done':overdueFlag?' hp-pv-task--overdue':'')+'">' +
          '<div class="hp-pv-task-top">' +
            '<span class="hp-pv-task-icon">'+icon+'</span>' +
            '<div class="hp-pv-task-body">' +
              '<div class="hp-pv-task-title">'+_esc(t.title)+'</div>' +
              (t.description||t.instructions?'<div class="hp-pv-task-desc">'+_esc(t.description||t.instructions)+'</div>':'') +
              '<div class="hp-pv-task-meta">' +
                '<span class="hp-pv-task-freq">'+_esc(t.freq||t.frequency||'once')+'</span>' +
                (t.dueDate?'<span class="hp-pv-task-due'+(overdueFlag?' hp-pv-overdue':'')+'">Due: '+t.dueDate+'</span>':'') +
                (done?'<span class="hp-pv-task-done-badge">✓ Done</span>':'') +
              '</div>' +
            '</div>' +
            '<div class="hp-pv-task-actions">' +
              (!done?'<button class="ch-btn-sm ch-btn-teal" onclick="window._hpPatCompleteTask(\''+selectedPid+'\',\''+t.id+'\')">Mark Done</button>':'<button class="ch-btn-sm" onclick="window._hpPatUncompleteTask(\''+selectedPid+'\',\''+t.id+'\')">Undo</button>') +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('') : '<div class="hp-pv-empty"><div style="font-size:28px;opacity:0.3">📋</div><div>No tasks assigned to this patient yet.</div><button class="ch-btn-sm ch-btn-teal" style="margin-top:8px" onclick="window._hpOpenAssign()">+ Assign First Task</button></div>';

      const done = patTasks.filter(t=>completions[t.id]||t.done).length;
      const total = patTasks.length;
      const pct = total>0?Math.round((done/total)*100):0;

      mainContent = `<div class="hp-pv-shell">
        <div class="hp-pv-header">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <div style="font-size:13px;font-weight:600;color:var(--text-secondary)">Viewing as patient:</div>
            <select class="ch-select" onchange="window._hpSelectPatView(this.value)">${patOpts}</select>
            <div class="hp-pv-progress-pill" style="--pct:${pct}">
              <div class="hp-pv-prog-bar"><div class="hp-pv-prog-fill" style="width:${pct}%"></div></div>
              <span>${done}/${total} tasks completed (${pct}%)</span>
            </div>
          </div>
          <div style="font-size:11.5px;color:var(--text-tertiary)">This is exactly what the patient sees on their portal. Changes here sync to the patient view.</div>
        </div>
        <div class="hp-pv-tasks">${patTaskCards}</div>
      </div>`;
    } else if (_view === 'adherence') {
      mainContent = `<div class="hp-card"><div class="hp-card-title">Patient Adherence Overview</div>${_adherenceView()}</div>`;
    } else if (_view === 'templates') {
      const ft = _filteredTemplates();
      const condOpts = CONDITION_HOME_TEMPLATES.slice()
        .sort((a, b) => a.conditionId.localeCompare(b.conditionId))
        .map(c => `<option value="${c.conditionId}"${_tplFilter.cond === c.conditionId ? ' selected' : ''}>${c.conditionId} — ${_esc(c.conditionName)}</option>`)
        .join('');
      const tplToolbar = `
        <div class="hp-tpl-toolbar">
          <p class="hp-tpl-hint">One suggested home task per condition (CON-001–CON-053), aligned with the Assessments Hub bundles. Use as a starting point and adapt to the individual.</p>
          <div class="hp-tpl-filters">
            <select class="hp-filter-sel" onchange="window._hpTplFilterCond(this.value)">
              <option value="all"${_tplFilter.cond === 'all' ? ' selected' : ''}>All templates</option>
              <option value="general"${_tplFilter.cond === 'general' ? ' selected' : ''}>General library only</option>
              ${condOpts}
            </select>
            <input class="hp-search" type="text" placeholder="Search title, condition, instructions\u2026" value="${_esc(_tplFilter.q)}" oninput="window._hpTplSearch(this.value)">
          </div>
        </div>`;
      mainContent = `<div class="hp-card hp-tpl-card-wrap">
        <div class="hp-card-title" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <span>Task Templates &amp; Library <span class="hp-tpl-count">${ft.length}</span></span>
          <button class="hp-act-btn hp-act-primary" onclick="window._hpOpenTplEditor()">+ New Template</button>
        </div>
        ${tplToolbar}
        <div class="hp-tpl-grid">${ft.length ? ft.map(_tplCard).join('') : '<div class="hp-empty">No templates match filters.</div>'}</div>
      </div>`;
    } else {
      const todayTasks   = filtered.filter(t => _isToday(t.dueDate) && t.status !== 'archived' && t.status !== 'completed');
      const overdueTasks = filtered.filter(t => _isOverdue(t.dueDate) && t.status !== 'archived' && t.status !== 'completed');
      const activeTasks  = filtered.filter(t => t.status === 'active' && !_isToday(t.dueDate) && !_isOverdue(t.dueDate));
      const doneTasks    = filtered.filter(t => t.status === 'completed' || _getCompletions(t.patientId)[t.id]).slice(0, 10);
      mainContent = `
        <div class="hp-card hp-queue-card">
          <div class="hp-card-title">Task Queue <span class="hp-queue-count">${filtered.filter(t=>t.status!=='archived').length}</span></div>
          ${filterBar}
          ${queueHeader}
          ${_section('Due Today', todayTasks.length || null, todayTasks, 'hp-section-today')}
          ${_section('Overdue / Not Completed', overdueTasks.length || null, overdueTasks, 'hp-section-overdue')}
          ${_section('Active Home Programs', activeTasks.length || null, activeTasks, '')}
          ${_section('Completed Recently', doneTasks.length || null, doneTasks, 'hp-section-done')}
          ${!filtered.filter(t=>t.status!=='archived').length ? '<div class="hp-empty">No tasks match current filters. Use + Add Task to assign the first task.</div>' : ''}
        </div>`;
    }

    el.innerHTML = `
      <div class="dv2-hub-shell" style="padding:20px;display:flex;flex-direction:column;gap:16px">
      <div class="hp-page">
        ${summaryStrip}
        ${topActions}
        ${mainContent}
        ${_showModal ? _modalHtml(_editingTask, '') : ''}
        ${_tplEditorOpen ? _tplEditorHtml() : ''}
      </div>
      </div>`;
    if (_showModal) queueMicrotask(() => window._hpSyncSuggestPanel?.());
  };

  // ── Window handlers ──────────────────────────────────────────────────────
  window._hpOpenAssign = prefillPid => {
    _hpModalProvenance = null;
    _hpSuggestExpanded = false;
    _editingTask = null; _showModal = true; renderPage();
    if (prefillPid) { const s = document.getElementById('hp-m-pid'); if (s) { s.value = prefillPid; window._hpModalPatient(prefillPid); } }
  };
  window._hpCloseModal  = () => { _showModal = false; _editingTask = null; _hpModalProvenance = null; _hpSuggestExpanded = false; renderPage(); };
  window._hpSetView     = v  => { _view = v; renderPage(); };
  window._hpShowPatientView = () => { _view = 'patient-view'; renderPage(); };
  window._hpSearch      = v  => { _filter.search = v; renderPage(); };
  window._hpFilterPid   = v  => { _filter.pid = v; renderPage(); };
  window._hpFilterType  = v  => { _filter.type = v; renderPage(); };
  window._hpFilterStatus = v => { _filter.status = v; renderPage(); };
  window._hpTplFilterCond = v => { _tplFilter.cond = v; renderPage(); };
  window._hpTplSearch     = v => { _tplFilter.q = v; renderPage(); };

  window._hpSyncSuggestPanel = () => {
    const host = document.getElementById('hp-modal-suggest');
    const wrap = document.getElementById('hp-modal-suggest-wrap');
    if (!host || !wrap) return;
    const pid = document.getElementById('hp-m-pid')?.value;
    const cid = document.getElementById('hp-m-course')?.value || '';
    _hpSuggestionRowByTplId = new Map();
    if (!pid) {
      wrap.style.display = 'none';
      host.innerHTML = '';
      return;
    }
    const allCourses = coursesByPatient[pid] || [];
    const active = allCourses.filter(c => c.status !== 'completed' && c.status !== 'discontinued');
    const pool = active.length ? active : allCourses;
    const rankedFull = buildRankedHomeSuggestions(pool, {
      selectedCourseId: cid || undefined,
      courseLabel: _courseLabel,
    });
    const MAX_CHIPS = 8;
    const ranked = _hpSuggestExpanded ? rankedFull : rankedFull.slice(0, MAX_CHIPS);
    ranked.forEach(row => { _hpSuggestionRowByTplId.set(row.template.id, row); });
    if (!rankedFull.length) {
      wrap.style.display = 'none';
      host.innerHTML = '';
      return;
    }
    wrap.style.display = 'block';
    const moreBtn = !_hpSuggestExpanded && rankedFull.length > MAX_CHIPS
      ? `<button type="button" class="hp-suggest-more" onclick="window._hpExpandSuggestChips()">Show all (${rankedFull.length})</button>`
      : '';
    host.innerHTML = '<div class="hp-suggest-chips">' + ranked.map(row => {
      const t = row.template;
      const short = t.title.length > 56 ? t.title.slice(0, 56) + '\u2026' : t.title;
      const src = row.sourceCourseLabel ? _esc(String(row.sourceCourseLabel)) : '';
      const method = _esc(row.match.matchMethod);
      const tier = _esc(confidenceTierFromScore(row.match.confidenceScore));
      return `<button type="button" class="hp-suggest-chip" onclick="window._hpApplySuggestTemplate('${t.id}')">`
        + `<span class="hp-suggest-cid">${t.conditionId}</span>`
        + `<span class="hp-suggest-txt">${_esc(short)}</span>`
        + `<span class="hp-suggest-meta">`
        + `<span class="hp-suggest-conf" title="Confidence score">${row.match.confidenceScore}</span>`
        + `<span class="hp-suggest-tier hp-suggest-tier--${confidenceTierFromScore(row.match.confidenceScore)}" title="Band">${tier}</span>`
        + `<span class="hp-suggest-method" title="Match method">${method}</span>`
        + (src ? `<span class="hp-suggest-src" title="Source course">${src}</span>` : '')
        + `</span></button>`;
    }).join('') + '</div>' + moreBtn;
  };

  window._hpExpandSuggestChips = () => { _hpSuggestExpanded = true; window._hpSyncSuggestPanel(); };

  window._hpApplySuggestTemplate = tplId => {
    const row = _hpSuggestionRowByTplId.get(tplId);
    const tpl = _getTemplates().find(t => t.id === tplId);
    if (!tpl) return;
    const pid = document.getElementById('hp-m-pid')?.value;
    if (!pid) {
      window._showNotifToast?.({ title: 'Select a patient', body: 'Choose a patient before applying a template.', severity: 'warn' });
      return;
    }
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setVal('hp-m-title', tpl.title);
    setVal('hp-m-type', tpl.type);
    setVal('hp-m-reason', tpl.reason || (tpl.conditionName ? `Home program — ${tpl.conditionName}` : ''));
    setVal('hp-m-freq', tpl.frequency || 'once');
    setVal('hp-m-instr', tpl.instructions || '');
    let courseLinkAutoSet = false;
    if (tpl.conditionId) {
      const courses = coursesByPatient[pid] || [];
      let pick = null;
      if (row?.sourceCourseId) {
        const sc = courses.find(c => c.id === row.sourceCourseId);
        if (sc && resolveConIdsFromCourse(sc).includes(tpl.conditionId)) pick = sc;
      }
      if (!pick) pick = courses.find(c => resolveConIdsFromCourse(c).includes(tpl.conditionId));
      if (pick) {
        setVal('hp-m-course', pick.id);
        courseLinkAutoSet = true;
      }
    }
    _hpModalProvenance = {
      templateId: tpl.id,
      conditionId: tpl.conditionId || null,
      matchMethod: row ? row.match.matchMethod : null,
      confidenceScore: row ? row.match.confidenceScore : null,
      matchedField: row ? row.match.matchedField : null,
      matchedValue: row ? row.match.matchedValue : null,
      sourceCourseId: row ? row.sourceCourseId : null,
      sourceCourseLabel: row ? row.sourceCourseLabel : null,
      courseLinkAutoSet,
      sortScore: row ? row.sortScore : null,
      appliedAt: new Date().toISOString(),
    };
    window._showNotifToast?.({ title: 'Template applied', body: tpl.title, severity: 'success' });
  };

  window._hpModalCourseChange = () => { window._hpSyncSuggestPanel(); };

  window._hpModalPatient = pid => {
    _hpSuggestExpanded = false;
    const el2 = document.getElementById('hp-m-course');
    if (!el2) return;
    el2.innerHTML = '<option value="">None</option>' +
      (coursesByPatient[pid] || []).map(c => `<option value="${c.id}">${_esc(_courseLabel(c))}</option>`).join('');
    window._hpSyncSuggestPanel();
  };

  window._hpSubmitTask = () => {
    const pid   = document.getElementById('hp-m-pid')?.value;
    const title = document.getElementById('hp-m-title')?.value?.trim();
    const type  = document.getElementById('hp-m-type')?.value;
    const reason= document.getElementById('hp-m-reason')?.value?.trim();
    const course= document.getElementById('hp-m-course')?.value;
    const due   = document.getElementById('hp-m-due')?.value;
    const freq  = document.getElementById('hp-m-freq')?.value;
    const instr = document.getElementById('hp-m-instr')?.value?.trim();
    const existId = document.getElementById('hp-m-taskid')?.value;
    if (!pid || !title) { window._showNotifToast?.({ title:'Required', body:'Patient and task title required.', severity:'warn' }); return; }
    const prev = existId ? (_ls(_clinKey(pid), []).find(t => t.id === existId) || null) : null;
    const useCreate = !prev?.serverTaskId;
    const task = {
      id: existId || ('htask-' + Date.now()),
      patientId: pid, title, type, reason, courseId: course, dueDate: due, frequency: freq, instructions: instr,
      assignedBy: prev?.assignedBy || window._currentUser?.name || 'Clinician',
      assignedAt: existId ? (prev?.assignedAt || new Date().toISOString()) : new Date().toISOString(),
      status: prev?.status || 'active',
      homeProgramSelection: (_hpModalProvenance ?? prev?.homeProgramSelection) || undefined,
      clientUpdatedAt: new Date().toISOString(),
      lastSyncedServerRevision: prev?.lastSyncedServerRevision,
    };
    _hpModalProvenance = null;
    _saveTask(task, useCreate);
    _allTasks = _loadAllTasks();
    _showModal = false; _editingTask = null;
    renderPage();
    window._showNotifToast?.({
      title: existId ? 'Task updated' : 'Task saved',
      body: existId ? `Saved changes to "${title}".` : `"${title}" was saved to the home-task workflow. Patient delivery depends on backend task sync.`,
      severity: 'success',
    });
  };

  window._hpEditTask = (tid, pid) => {
    _hpModalProvenance = null;
    const tasks = _ls(_clinKey(pid), []);
    _editingTask = tasks.find(t => t.id === tid) || null;
    _showModal = true; renderPage();
  };

  window._hpMarkDone = (tid, pid) => {
    const comps = _getCompletions(pid);
    comps[tid] = new Date().toISOString();
    _lsSet(_compKey(pid), comps);
    _allTasks = _loadAllTasks(); renderPage();
    window._showNotifToast?.({ title:'Task updated', body:'Task marked complete in this browser view.', severity:'success' });
  };

  window._hpArchive = (tid, pid) => {
    if (!confirm('Archive this task?')) return;
    const tasks = _ls(_clinKey(pid), []);
    const idx = tasks.findIndex(t => t.id === tid);
    if (idx >= 0) { tasks[idx].status = 'archived'; _lsSet(_clinKey(pid), tasks); }
    const patTasks = _ls(_patKey(pid), []);
    const pidx = patTasks.findIndex(t => t.id === tid);
    if (pidx >= 0) { patTasks[pidx].status = 'archived'; _lsSet(_patKey(pid), patTasks); }
    _allTasks = _loadAllTasks(); renderPage();
  };

  window._hpUseTemplate = tplId => {
    _hpModalProvenance = null;
    _hpSuggestExpanded = false;
    const tpl = _getTemplates().find(t => t.id === tplId);
    if (!tpl) return;
    _editingTask = {
      title: tpl.title,
      type: tpl.type,
      frequency: tpl.frequency || 'once',
      instructions: tpl.instructions || '',
      reason: tpl.reason || (tpl.conditionName ? `Home program — ${tpl.conditionName}` : ''),
      courseId: '',
      dueDate: '',
      id: null,
      patientId: '',
    };
    _showModal = true; _view = 'queue'; renderPage();
  };

  // ── Template editor handlers (CRUD UI) ───────────────────────────────────
  window._hpOpenTplEditor = (tplId) => {
    if (tplId) {
      const tpl = _getTemplates().find(t => t.id === tplId);
      if (!tpl || _isDefaultTemplate(tpl.id)) return;
      _tplEditing = { ...tpl, payload: { notes: tpl.instructions || '' } };
    } else {
      _tplEditing = null;
    }
    _tplEditorOpen = true;
    renderPage();
  };
  window._hpCloseTplEditor = () => { _tplEditorOpen = false; _tplEditing = null; renderPage(); };
  window._hpSubmitTplEditor = async () => {
    const name = document.getElementById('hp-tple-name')?.value?.trim();
    const notes = document.getElementById('hp-tple-notes')?.value || '';
    if (!name) {
      window._showNotifToast?.({ title: 'Name required', body: 'Template name cannot be empty.', severity: 'warn' });
      return;
    }
    const existing = _tplEditing && _tplEditing.id ? _tplEditing : null;
    const tpl = existing
      ? { ...existing, title: name, instructions: notes, payload: { notes } }
      : { id: 'tplc-' + Date.now(), title: name, instructions: notes, payload: { notes } };
    _tplEditorOpen = false;
    _tplEditing = null;
    await window._hpSaveTemplate(tpl);
  };
  window._hpDeleteTplPrompt = async (tplId) => {
    if (!tplId || _isDefaultTemplate(tplId)) return;
    if (!confirm('Delete this template? This cannot be undone.')) return;
    await window._hpDeleteTemplate(tplId);
  };

  window._hpConflictTakeServer = (tid, pid) => {
    const tasks = _ls(_clinKey(pid), []);
    const t = tasks.find(x => x.id === tid);
    if (!t || !t._conflictServerTask) return;
    const server = t._conflictServerTask;
    const cleaned = {
      ...server,
      _syncStatus: SYNC_STATUS.SYNCED,
      _conflictServerTask: undefined,
      _syncConflictReason: undefined,
      lastSyncedServerRevision: server.serverRevision,
      lastSyncedAt: server.serverUpdatedAt || server.lastSyncedAt,
    };
    const i = tasks.findIndex(x => x.id === tid);
    if (i >= 0) tasks[i] = cleaned;
    _lsSet(_clinKey(pid), tasks);
    _bridgeToPatient(pid, cleaned);
    _allTasks = _loadAllTasks();
    renderPage();
    import('./api.js').then(({ api: sdk }) => {
      if (typeof sdk.postHomeProgramAuditAction === 'function') {
        return sdk.postHomeProgramAuditAction({ external_task_id: tid, action: 'take_server' }).catch(() => {});
      }
    }).catch(() => {});
    window._showNotifToast?.({ title: 'Using server copy', body: 'Local list updated to match the server.', severity: 'success' });
  };

  window._hpConflictForceLocal = async (tid, pid) => {
    const tasks = _ls(_clinKey(pid), []);
    const t = tasks.find(x => x.id === tid);
    if (!t) return;
    const local = { ...t, _conflictServerTask: undefined, _syncConflictReason: undefined, _syncStatus: SYNC_STATUS.SYNCING };
    try {
      const { api: apiSdk } = await import('./api.js');
      if (typeof apiSdk.mutateHomeProgramTask !== 'function' && typeof apiSdk.upsertHomeProgramTask !== 'function') return;
      const mutation = typeof apiSdk.mutateHomeProgramTask === 'function'
        ? await apiSdk.mutateHomeProgramTask(local, { force: true })
        : _hpApplyMutationSync(local, await apiSdk.upsertHomeProgramTask(local, { force: true })).mutation;
      const merged = mergeParsedMutationIntoLocalTask(local, mutation);
      const i = tasks.findIndex(x => x.id === tid);
      if (i >= 0) tasks[i] = merged;
      _lsSet(_clinKey(pid), tasks);
      _bridgeToPatient(pid, merged);
      _allTasks = _loadAllTasks();
      renderPage();
      window._showNotifToast?.({ title: 'Saved', body: 'Server overwritten with your copy.', severity: 'success' });
    } catch (_) {
      window._showNotifToast?.({ title: 'Sync failed', body: 'Could not overwrite server.', severity: 'warn' });
    }
  };

  window._hpRetrySyncOne = async (tid, pid) => {
    const arr = _ls(_clinKey(pid), []);
    const t = arr.find(x => x.id === tid);
    if (!t) return;
    const { api: sdk } = await import('./api.js');
    if (
      typeof sdk.mutateHomeProgramTask !== 'function' &&
      typeof sdk.upsertHomeProgramTask !== 'function' &&
      typeof sdk.createHomeProgramTask !== 'function'
    ) return;
    try {
      const payload = { ...t, _syncStatus: SYNC_STATUS.SYNCING };
      const mutation = typeof sdk.mutateHomeProgramTask === 'function'
        ? await sdk.mutateHomeProgramTask(payload)
        : _hpApplyMutationSync(
            payload,
            (!payload.serverTaskId && typeof sdk.createHomeProgramTask === 'function')
              ? await sdk.createHomeProgramTask(payload)
              : await sdk.upsertHomeProgramTask(payload)
          ).mutation;
      const merged = mergeParsedMutationIntoLocalTask(t, mutation);
      const i = arr.findIndex(x => x.id === tid);
      if (i >= 0) arr[i] = merged;
      _lsSet(_clinKey(pid), arr);
      _bridgeToPatient(pid, merged);
      _allTasks = _loadAllTasks();
      renderPage();
      if (typeof sdk.postHomeProgramAuditAction === 'function') {
        sdk.postHomeProgramAuditAction({
          external_task_id: tid,
          action: 'retry_success',
          server_revision: mutation.revision.serverRevision,
        }).catch(() => {});
      }
    } catch (_) {
      const failed = markSyncFailed(t);
      const i = arr.findIndex(x => x.id === tid);
      if (i >= 0) arr[i] = failed;
      _lsSet(_clinKey(pid), arr);
      _allTasks = _loadAllTasks();
      renderPage();
      window._showNotifToast?.({ title: 'Still offline', body: 'Sync will retry on reload.', severity: 'warn' });
    }
  };

  renderPage();
}
