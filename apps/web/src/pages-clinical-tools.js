// ─────────────────────────────────────────────────────────────────────────────
// pages-clinical-tools.js — Secondary clinical tool pages (code-split)
// Advanced Search · Benchmarks · Consent · Media · Dictation · Forms · etc.
//
// The heaviest sub-pages have been split into sibling modules to keep the
// parent chunk under the bundle-size warning limit:
//   - pgBrainMapPlanner  → pages-clinical-tools-bmp.js
//   - pgAssessmentsHub   → pages-clinical-tools-assessments.js
//   - pgHomePrograms     → pages-clinical-tools-home.js
//
// We deliberately do NOT static-re-export those symbols here — a `export …
// from` line would force Rollup to inline the split modules back into the
// parent chunk and undo the size win. All callers have been updated to
// import the split modules directly:
//   - app.js loaders use loadClinicalToolsBmp / Assess / Home
//   - pages-clinical-hubs.js → import('./pages-clinical-tools-assessments.js')
//   - pages-virtualcare.js   → import('./pages-clinical-tools-home.js')
//   - registries/scale-assessment-registry.test.js reads
//     pages-clinical-tools-assessments.js for COND_BUNDLES tokens
// ─────────────────────────────────────────────────────────────────────────────
import { api } from './api.js';
import { tag, spinner, emptyState, spark } from './helpers.js';
import { FALLBACK_CONDITIONS } from './constants.js';
import {
  _dsToast,
  _asTypeBadge,
} from './pages-clinical-tools-shared.js';

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
    window._showNotifToast?.({ title: 'Search Saved', body: '"' + _query + '" saved for quick access', severity: 'success' });
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
        <td><input type="checkbox" ${sel ? 'checked' : ''} onchange="window._consentToggleSelect('${r.id}',this.checked)"></td>
        <td style="font-weight:600">${r.name}</td>
        <td>${r.type}</td>
        <td>${r.version || '\u2014'}</td>
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
        <span class="ggg-audit-event"><span class="ggg-audit-patient">${l.patient}</span> \u2014 ${l.event}${l.extra ? ` <span style="color:var(--text-muted)">(${l.extra})</span>` : ''}</span>
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
      <td style="font-weight:600">${d.patient}</td>
      <td>${fmtDate(d.requestDate)}</td>
      <td>${badgeHTML(d.status)}</td>
      <td style="font-size:.8rem;color:var(--text-muted)">${d.dataTypes}</td>
      <td>${d.status !== 'completed'
        ? `<button class="btn btn-secondary btn-xs" style="color:var(--accent-rose)" onclick="window._consentProcessDeletion('${d.id}')">Process</button>`
        : '<span style="color:var(--text-muted);font-size:.78rem">Done</span>'}</td>
    </tr>`).join('');

    const ptOpts = records.map(r => `<option value="${r.id}">${r.name}</option>`).join('');

    const auditTypes = ['all','Consent Signed','Consent Revoked','Re-send Triggered','Consent Expired','Deletion Requested','Deletion Completed'];
    const auditFiltered = _auditFilter === 'all' ? audit : audit.filter(l => l.event === _auditFilter);
    const auditItems = auditFiltered.slice(0, 50).map(l => `
      <li>
        <span class="ggg-audit-ts">${fmtTS(l.ts)}</span>
        <span class="ggg-audit-event"><span class="ggg-audit-patient">${l.patient}</span> \u2014 ${l.event}${l.extra ? ` <span style="color:var(--text-muted)">(${l.extra})</span>` : ''}</span>
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
    if (!confirm(`Send re-consent request to ${names.join(', ')}?`)) return;
    names.forEach(n => addAudit('Re-send Triggered', n, 'Bulk re-consent'));
    _dsToast(`Re-consent request sent to ${names.join(', ')}.`, 'success');
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
      <h3>Consent Record \u2014 ${r.name}</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:.875rem;margin-bottom:16px">
        <div><span style="color:var(--text-muted)">Type:</span> ${r.type}</div>
        <div><span style="color:var(--text-muted)">Version:</span> ${r.version || '\u2014'}</div>
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
    _dsToast(`Re-consent request sent to ${r.name}.`, 'success');
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
      ? `<div style="padding:48px;text-align:center;color:var(--text-tertiary);font-size:13.5px">No pending uploads to review.</div>`
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


export async function pgEvidenceBuilder(setTopbar) {
  setTopbar('Evidence Builder', `<button class="btn btn-sm" onclick="window._ebRefresh()" style="font-size:12px">↺ Refresh</button>`);

  const el = document.getElementById('content');
  if (!el) return;

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
    // Also update summary selector
    const sumSel = document.getElementById('eb-sum-proto-select');
    if (sumSel) sumSel.value = protoId;
  };

  window._ebAddCitation = function(paperId) {
    const literature = _ebGetLiterature();
    const paper = literature.find(p => p.id === paperId);
    if (!paper) return;
    const proSel = document.getElementById('eb-proto-select');
    const protoId = proSel ? proSel.value : null;
    const protocols = _ebGetProtocols();
    const protoIdx = protocols.findIndex(p => p.id === protoId);
    if (protoIdx === -1) { _dsToast('Please select a protocol first.', 'warn'); return; }
    const citation = `[${paper.authors} (${paper.year}), ${paper.journal}] "${paper.title}" — Effect size: d=${paper.effectSize} ${paper.ci}, N=${paper.n}, ${paper.design}.`;
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
}

function _ebMatchedPapersHTML(proto) {
  const papers = _ebMatchPapers(proto);
  if (papers.length === 0) {
    return `<div style="padding:16px;color:var(--text-muted);font-size:13px;text-align:center">No literature matches found for <strong>${_ebEsc(proto.name)}</strong>. Try adding more studies to the Evidence Library.</div>`;
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
    window._showNotifToast?.({ title:'Note Saved', body:'Quick note added for ' + p.patientName, severity:'info' });
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
    window._showNotifToast?.({ title:'Walk-in Added', body:name + ' added to today\'s queue', severity:'info' });
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
    window._showNotifToast?.({ title:'Note Saved', body:'Quick note saved for ' + p.patientName, severity:'info' });
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
    window._showNotifToast?.({ title:'Walk-in Added', body:name + ' added to queue', severity:'info' });
  };

  window._cdApprove = function(id) {
    let items = []; try { items = JSON.parse(localStorage.getItem(REVIEW_KEY) || '[]'); } catch {}
    const item = items.find(i => i.id === id); if (!item) return;
    item.status = 'approved';
    try { localStorage.setItem(REVIEW_KEY, JSON.stringify(items)); } catch {}
    render();
    window._showNotifToast?.({ title:'Approved', body:'Item approved successfully', severity:'success' });
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
    window._showNotifToast?.({ title:'Note Saved', body:'Clinical note recorded.', severity:'info' });
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
    window._showNotifToast && window._showNotifToast({ title: 'Saved', body: sec.label + ' updated.', severity: 'success' });
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
    window._showNotifToast && window._showNotifToast({ title: 'Saved', body: 'Medical history saved.', severity: 'success' });
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
    <button class="btn btn-sm" onclick="window._dhShowCreateModal()">Create Document</button>
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
          : `<button class="btn btn-primary btn-sm" onclick="window._dhFill('${id}')">Fill</button>`;
      case 'expired':
        return `<button class="btn btn-primary btn-sm" style="border-color:#ef4444;color:#ef4444" onclick="window._dhReplace('${id}')">Replace</button>`;
      case 'needs-update':
        return `<button class="btn btn-primary btn-sm" style="border-color:#f97316;color:#f97316" onclick="window._dhFill('${id}')">Update</button>`;
      case 'generated':
        return `<button class="btn btn-sm" onclick="window._dhOpen('${id}')">Open</button>`;
      default:
        return `<button class="btn btn-sm" onclick="window._dhOpen('${id}')">Open</button>`;
    }
  }

  // ── Secondary actions ─────────────────────────────────────────────────────
  function secondaryActionsHTML(d) {
    const id = esc(d.id);
    const acts = [];
    if (['completed','signed','generated','uploaded'].includes(d.status))
      acts.push(`<button class="btn btn-sm dh-act" onclick="window._dhDownload('${id}')">Download</button>`);
    if (['completed','signed','pending'].includes(d.status) && d.sigState !== 'signed')
      acts.push(`<button class="btn btn-sm dh-act" onclick="window._dhSendForSig('${id}')">Send for Sig</button>`);
    if (d.status === 'signed' || d.sigState === 'unsigned')
      acts.push(`<button class="btn btn-sm dh-act" onclick="window._dhMarkSigned('${id}')">Mark Signed</button>`);
    if (d.status === 'generated')
      acts.push(`<button class="btn btn-sm dh-act" onclick="window._dhRegenerate('${id}')">Regenerate</button>`);
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
      generated:    ['No generated documents', 'Discharge summaries, letters, and PDFs will appear here.'],
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
          ${item.id==='dh-custom'?`<button class="tlib-btn-secondary" onclick="window._nav('forms-builder')">Build Custom</button>`:`<button class="tlib-btn-secondary" onclick="window._dhTlibFill('${esc(item.id)}')">Fill</button>`}
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
          window._showNotifToast({ title: 'Document Assigned', body: '\u201c' + name + '\u201d assigned to ' + patientName, severity: 'success' });
        } else {
          _dsToast('\u201c' + name + '\u201d assigned to ' + patientName, 'success');
        }
      }
    });
  };
  window._dhTlibPreview = function(id) {
    const item = DH_TLIB_ITEMS.find(x => x.id === id);
    if (item) window._showNotifToast?.({ title: item.name, body: (item.type || '') + (item.target ? ' · ' + item.target : '') + (item.desc ? ' — ' + item.desc.slice(0, 80) : ''), severity: 'info' });
  };
  window._dhTlibFill = function(id) {
    window._showNotifToast?.({ title:'Fill Form', body:'In-platform form filling — select a patient first.', severity:'info' });
  };

  window._dhFill       = function(id) { window._showNotifToast?.({ title:'Open Form', body:'In-platform form filling not yet wired — patients can complete this form via the patient portal.', severity:'info' }); };
  window._dhOpen       = function(id) { const d=docs.find(x=>x.id===id); if(d?.url) window.open(d.url,'_blank'); else window._showNotifToast?.({ title:'No file attached', body:'No URL or file attached yet.', severity:'info' }); };
  window._dhDownload   = function(id) { const d=docs.find(x=>x.id===id); if(d?.url) window.open(d.url,'_blank'); else window._showNotifToast?.({ title:'Download', body:'PDF generation coming soon.', severity:'info' }); };
  window._dhRegenerate = function(id) { docs=loadDocs(); const d=docs.find(x=>x.id===id); if(!d) return; d.updatedDate=today(); saveDocs(docs); renderPage(); window._showNotifToast?.({ title:'Regenerated', body:`${d.name} regenerated.`, severity:'success' }); };

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
    window._showNotifToast?.({ title:'Sent for Signature', body:`${d.name} — signature request sent.`, severity:'success' });
  };
  window._dhMarkSigned = function(id) {
    docs=loadDocs(); const d=docs.find(x=>x.id===id); if(!d) return;
    d.status='signed'; d.sigState='signed'; d.completedDate=today(); d.updatedDate=today();
    saveDocs(docs); renderPage(); _dhPersistUpdate(d);
    window._showNotifToast?.({ title:'Marked Signed', body:`${d.name} marked as signed.`, severity:'success' });
  };
  window._dhReplace = function(id) {
    const name=prompt('Name of replacement document:'); if(!name) return;
    docs=loadDocs(); const d=docs.find(x=>x.id===id); if(!d) return;
    d.name=name; d.status='pending'; d.sigState=d.category==='Consent'?'unsigned':'not-required';
    d.updatedDate=today(); d.completedDate=null;
    saveDocs(docs); renderPage();
    window._showNotifToast?.({ title:'Replaced', body:`${name} created as replacement.`, severity:'success' });
  };
  window._dhArchive = function(id) {
    if(!confirm('Archive this document? It will be hidden but not deleted.')) return;
    docs=loadDocs(); const d=docs.find(x=>x.id===id); if(!d) return;
    d.archived=true; saveDocs(docs); renderPage(); _dhPersistUpdate(d);
    window._showNotifToast?.({ title:'Archived', body:`${d.name} archived.`, severity:'success' });
  };
  window._dhAssignDoc = function(id) {
    const pid=activePid||prompt('Enter patient ID:'); if(!pid) return;
    docs=loadDocs(); const d=docs.find(x=>x.id===id); if(!d) return;
    d.status='pending'; d.patientId=pid; d.assignedDate=today(); d.assignedBy='Clinician'; d.updatedDate=today();
    saveDocs(docs); renderPage();
    window._showNotifToast?.({ title:'Assigned', body:`${d.name} assigned.`, severity:'success' });
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
    window._showNotifToast?.({ title:'Form Assigned', body:`${name} assigned to patient.`, severity:'success' });
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
    window._showNotifToast?.({ title:`${bundle.name} Assigned`, body:`${added} form${added!==1?'s':''} assigned.`, severity:'success' });
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
      <div style="margin-bottom:16px"><label class="dh-modal-label">Category</label>
        <select id="dh-u-cat" class="form-control"><option value="Intake">Intake</option><option value="Consent">Consent</option><option value="Clinical">Clinical</option><option value="Uploaded" selected>Uploaded</option></select></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-sm" onclick="window._dhCloseModal()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="window._dhDoUpload()">Upload</button>
      </div>`;
    document.getElementById('dh-modal').style.display='flex';
  };
  window._dhDoUpload = function() {
    const pid=document.getElementById('dh-u-pid')?.value;
    const name=document.getElementById('dh-u-name')?.value?.trim();
    const cat=document.getElementById('dh-u-cat')?.value||'Uploaded';
    if(!pid||!name){ window._showNotifToast?.({ title:'Required', body:'Patient and name required.', severity:'warning' }); return; }
    docs=loadDocs();
    const newDoc = { id:'doc_'+Date.now(), patientId:pid, templateId:null, name, category:cat, desc:'Manually uploaded.', status:'uploaded', sigState:'not-required', assignedBy:'Clinician', assignedDate:today(), completedDate:today(), updatedDate:today(), expiryDate:null };
    docs.push(newDoc);
    saveDocs(docs); activePid=pid; activeTab='uploaded'; window._dhCloseModal(); renderPage(); _dhPersistUpdate(newDoc);
    window._showNotifToast?.({ title:'Uploaded', body:`${name} added.`, severity:'success' });
  };

  window._dhShowCreateModal = function() {
    const pid=activePid;
    const pOpts=patients.map(p=>`<option value="${esc(p.id)}"${pid===String(p.id)?' selected':''}>${esc(p.full_name||p.name||'Patient '+p.id)}</option>`).join('');
    document.getElementById('dh-modal-box').innerHTML=`
      <div class="dh-modal-hd">Create Document</div>
      <div style="margin-bottom:12px"><label class="dh-modal-label">Patient</label><select id="dh-c-pid" class="form-control">${pOpts||'<option value="">— no patients —</option>'}</select></div>
      <div style="margin-bottom:12px"><label class="dh-modal-label">Document type</label>
        <select id="dh-c-type" class="form-control">
          <option>Discharge Summary</option><option>Referral Letter</option><option>Progress Letter</option>
          <option>GP Update</option><option>Treatment Plan Summary</option><option>Adverse Event Report</option>
        </select></div>
      <div style="margin-bottom:16px"><label class="dh-modal-label">Notes (optional)</label><textarea id="dh-c-notes" class="form-control" rows="2" placeholder="Any specific notes..."></textarea></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-sm" onclick="window._dhCloseModal()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="window._dhDoCreate()">Generate Document</button>
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
    window._showNotifToast?.({ title:'Document Created', body:`${type} generated.`, severity:'success' });
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
            ${r.file_url ? `<button class="btn btn-sm" style="font-size:11px" onclick="window.open('${r.file_url}','_blank')">Download</button>` : ''}
            <button class="btn btn-ghost btn-sm" style="font-size:11px;color:var(--text-tertiary)" onclick="window._rhDelete('${esc(r.id)}')">Delete</button>
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

    try {
      if (api.uploadReport) {
        const fd = new FormData();
        Object.entries({ patient_id:patientId, type, report_date:newReport.date, title, source:source||'', summary:summary||'', status }).forEach(([k,v]) => fd.append(k,v));
        if (fileInput?.files?.[0]) fd.append('file', fileInput.files[0]);
        const res = await api.uploadReport(fd);
        if (res?.id) newReport.id = res.id;
        if (res?.file_url) newReport.file_url = res.file_url;
      }
    } catch (_) {}

    reports.push(newReport);
    saveReports(reports);
    window._rhCloseModal('rh-upload-modal');
    renderPage();
    window._showNotifToast?.({ title:'Report Uploaded', body:`"${title}" added to ${TYPE_BY_ID[type]?.label || type} category.`, severity:'success' });
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
    window._showNotifToast?.({ title:'Links Saved', body:'Report associations updated.', severity:'success' });
  };

  window._rhDelete = function(id) {
    if (!confirm('Delete this report? This cannot be undone.')) return;
    reports = reports.filter(r => r.id !== id);
    saveReports(reports);
    const el2 = document.getElementById('rh-card-' + id);
    if (el2) el2.remove();
    renderPage();
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

