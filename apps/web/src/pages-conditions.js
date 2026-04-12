// ─────────────────────────────────────────────────────────────────────────────
// pages-conditions.js — Condition Backlog Tracker
// Clinician-facing view of all 53 condition packages with completion status.
// ─────────────────────────────────────────────────────────────────────────────
import {
  CONDITION_PACKAGES, PRIORITY_TIERS, STATUS_DIMENSIONS,
  calcCompletionPct, calcCompletionScore, getSummaryStats,
  loadStatusOverrides, saveStatusOverride, getMergedStatus,
  getPackagesByTier, getPackagesByCategory,
} from './condition-packages.js';

function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

// ─── State ────────────────────────────────────────────────────────────────────
let _state = {
  filterTier: 'all',
  filterCategory: 'all',
  search: '',
  expandedId: null,
  overrides: {},
  viewMode: 'table',  // 'table' | 'kanban'
};

// ─── Status rendering helpers ─────────────────────────────────────────────────
function _statusCell(val) {
  if (val === true)       return '<span class="cb-badge cb-badge-done">\u2714 Ready</span>';
  if (val === 'partial')  return '<span class="cb-badge cb-badge-partial">\u25D0 Partial</span>';
  return                         '<span class="cb-badge cb-badge-missing">\u2013 Missing</span>';
}

function _statusIcon(val) {
  if (val === true)       return '<span class="cb-sico cb-sico-done" title="Ready">\u2714</span>';
  if (val === 'partial')  return '<span class="cb-sico cb-sico-partial" title="Partial">\u25D0</span>';
  return                         '<span class="cb-sico cb-sico-missing" title="Missing">\u25CB</span>';
}

function _progressBar(pct) {
  const color = pct >= 83 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
  return `
    <div class="cb-prog-wrap" title="${pct}% complete">
      <div class="cb-prog-bar" style="width:${pct}%;background:${color}"></div>
    </div>
    <span class="cb-prog-label">${pct}%</span>`;
}

function _tierBadge(tier) {
  const t = PRIORITY_TIERS[tier];
  return `<span class="cb-tier-badge" style="background:${t.bg};color:${t.color}">${t.label}</span>`;
}

// ─── Category list ─────────────────────────────────────────────────────────────
const ALL_CATEGORIES = [...new Set(CONDITION_PACKAGES.map(p => p.category))];

// ─── Filter conditions ─────────────────────────────────────────────────────────
function _filtered() {
  const overrides = _state.overrides;
  return CONDITION_PACKAGES.filter(p => {
    if (_state.filterTier !== 'all' && p.tier !== Number(_state.filterTier)) return false;
    if (_state.filterCategory !== 'all' && p.category !== _state.filterCategory) return false;
    if (_state.search) {
      const q = _state.search.toLowerCase();
      if (!p.label.toLowerCase().includes(q) &&
          !p.shortLabel.toLowerCase().includes(q) &&
          !p.icd10.toLowerCase().includes(q) &&
          !p.category.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

// ─── Summary header ─────────────────────────────────────────────────────────────
function _renderHeader(stats) {
  return `
<div class="cb-header">
  <div class="cb-header-top">
    <div>
      <h1 class="cb-title">Condition Package Backlog</h1>
      <p class="cb-subtitle">Phase 14 \u2014 Scale to ${stats.total} conditions \u00B7 Track schema \u00B7 protocols \u00B7 assessments \u00B7 handbook \u00B7 patient view \u00B7 QA</p>
    </div>
    <div class="cb-header-actions">
      <button class="cb-btn cb-btn-sm cb-btn-secondary" onclick="window._cbExportCSV()">
        \uD83D\uDCE5 Export CSV
      </button>
      <button class="cb-btn cb-btn-sm cb-btn-secondary" onclick="window._cbToggleView()">
        \uD83D\uDDC2 ${_state.viewMode === 'table' ? 'Kanban View' : 'Table View'}
      </button>
    </div>
  </div>

  <div class="cb-stats-row">
    <div class="cb-stat-card">
      <span class="cb-stat-val">${stats.total}</span>
      <span class="cb-stat-lbl">Total Conditions</span>
    </div>
    <div class="cb-stat-card cb-stat-green">
      <span class="cb-stat-val">${stats.qaComplete}</span>
      <span class="cb-stat-lbl">QA Complete</span>
    </div>
    <div class="cb-stat-card cb-stat-teal">
      <span class="cb-stat-val">${stats.schemaReady}</span>
      <span class="cb-stat-lbl">Schema Ready</span>
    </div>
    <div class="cb-stat-card cb-stat-blue">
      <span class="cb-stat-val">${stats.protocolsReady}</span>
      <span class="cb-stat-lbl">Protocols Ready</span>
    </div>
    <div class="cb-stat-card cb-stat-amber">
      <span class="cb-stat-val">${stats.handbookReady}</span>
      <span class="cb-stat-lbl">Handbooks Ready</span>
    </div>
    <div class="cb-stat-card cb-stat-purple">
      <span class="cb-stat-val">${stats.patientViewReady}</span>
      <span class="cb-stat-lbl">Patient View Ready</span>
    </div>
  </div>

  <div class="cb-progress-overview">
    <div class="cb-overview-label">Overall completion</div>
    <div class="cb-overview-bar-wrap">
      <div class="cb-overview-bar" style="width:${Math.round((stats.qaComplete/stats.total)*100)}%"></div>
    </div>
    <span class="cb-overview-pct">${Math.round((stats.qaComplete/stats.total)*100)}% QA complete</span>
  </div>
</div>`;
}

// ─── Filter bar ─────────────────────────────────────────────────────────────────
function _renderFilters() {
  const tierOpts = [['all','All Tiers'], ['1','Tier 1 \u2014 Core'], ['2','Tier 2 \u2014 High'], ['3','Tier 3 \u2014 Medium'], ['4','Tier 4 \u2014 Research']]
    .map(([v,l]) => `<button class="cb-filter-btn ${_state.filterTier === v ? 'active' : ''}" onclick="window._cbFilterTier('${v}')">${l}</button>`).join('');

  const catOpts = [['all','All Categories'], ...ALL_CATEGORIES.map(c => [c, c])]
    .map(([v,l]) => `<option value="${esc(v)}" ${_state.filterCategory === v ? 'selected' : ''}>${esc(l)}</option>`).join('');

  return `
<div class="cb-filter-bar">
  <div class="cb-tier-tabs">${tierOpts}</div>
  <div class="cb-filter-right">
    <select class="cb-select" onchange="window._cbFilterCat(this.value)">${catOpts}</select>
    <input type="text" class="cb-search" placeholder="Search conditions, ICD-10\u2026" value="${esc(_state.search)}"
           oninput="window._cbSearch(this.value)">
  </div>
</div>`;
}

// ─── Table row ───────────────────────────────────────────────────────────────────
function _renderRow(pkg) {
  const merged = getMergedStatus(pkg, _state.overrides);
  const pct = calcCompletionPct({ ...pkg, status: merged });
  const dims = ['schema','protocols','assessments','handbook','patientView','qaComplete'];
  const expanded = _state.expandedId === pkg.id;

  const dimCells = dims.map(d => `<td class="cb-td-status">${_statusIcon(merged[d])}</td>`).join('');

  const expandedRow = expanded ? `
<tr class="cb-expand-row" id="cb-expand-${esc(pkg.id)}">
  <td colspan="11" class="cb-expand-td">
    <div class="cb-expand-panel">
      <div class="cb-expand-grid">
        <div class="cb-expand-col">
          <h4 class="cb-expand-h4">Status Details</h4>
          ${dims.map(d => `
            <div class="cb-status-detail-row">
              <span class="cb-status-detail-label">${STATUS_DIMENSIONS.find(x=>x.id===d)?.label}</span>
              <span class="cb-status-detail-val">${_statusCell(merged[d])}</span>
              <button class="cb-toggle-btn" onclick="window._cbToggleStatus('${esc(pkg.id)}','${d}')">
                ${merged[d] === true ? 'Mark Partial' : merged[d] === 'partial' ? 'Mark Missing' : 'Mark Ready'}
              </button>
            </div>`).join('')}
        </div>
        <div class="cb-expand-col">
          <h4 class="cb-expand-h4">Protocols (${pkg.protocols.length})</h4>
          ${pkg.protocols.length ? pkg.protocols.map(id => `<span class="cb-tag">${esc(id)}</span>`).join('') : '<span class="cb-empty-tag">None mapped</span>'}

          <h4 class="cb-expand-h4" style="margin-top:12px">Assessments (${pkg.assessments.length})</h4>
          ${pkg.assessments.length ? pkg.assessments.map(a => `<span class="cb-tag cb-tag-blue">${esc(a)}</span>`).join('') : '<span class="cb-empty-tag">None mapped</span>'}

          <h4 class="cb-expand-h4" style="margin-top:12px">Handbooks (${pkg.handbooks.length})</h4>
          ${pkg.handbooks.length ? pkg.handbooks.map(id => `<span class="cb-tag cb-tag-amber">${esc(id)}</span>`).join('') : '<span class="cb-empty-tag">None</span>'}

          <h4 class="cb-expand-h4" style="margin-top:12px">Home Programs (${pkg.homePrograms.length})</h4>
          ${pkg.homePrograms.length ? pkg.homePrograms.map(id => `<span class="cb-tag cb-tag-green">${esc(id)}</span>`).join('') : '<span class="cb-empty-tag">None</span>'}
        </div>
        <div class="cb-expand-col">
          <h4 class="cb-expand-h4">Notes</h4>
          <p class="cb-expand-notes">${esc(pkg.notes)}</p>
          ${pkg.qaNotes ? `<h4 class="cb-expand-h4" style="margin-top:12px">QA Notes</h4><p class="cb-expand-notes cb-qa-notes">${esc(pkg.qaNotes)}</p>` : ''}
          <div style="margin-top:12px">
            <textarea class="cb-qa-textarea" placeholder="Add QA notes\u2026" id="qa-note-${esc(pkg.id)}">${esc(pkg.qaNotes)}</textarea>
            <button class="cb-btn cb-btn-sm cb-btn-primary" style="margin-top:8px"
                    onclick="window._cbSaveQANote('${esc(pkg.id)}')">Save QA Note</button>
          </div>
        </div>
      </div>
    </div>
  </td>
</tr>` : '';

  return `
<tr class="cb-tr ${expanded ? 'expanded' : ''}" onclick="window._cbExpandRow('${esc(pkg.id)}')">
  <td class="cb-td-num">${_tierBadge(pkg.tier)}</td>
  <td class="cb-td-condition">
    <span class="cb-cond-name">${esc(pkg.label)}</span>
    <span class="cb-cond-short">${esc(pkg.shortLabel)}</span>
  </td>
  <td class="cb-td-icd"><code class="cb-icd">${esc(pkg.icd10)}</code></td>
  <td class="cb-td-cat"><span class="cb-cat">${esc(pkg.category)}</span></td>
  ${dimCells}
  <td class="cb-td-prog">${_progressBar(pct)}</td>
</tr>
${expandedRow}`;
}

// ─── Table view ───────────────────────────────────────────────────────────────────
function _renderTable(conditions) {
  const dimHeaders = STATUS_DIMENSIONS.map(d =>
    `<th class="cb-th-status" title="${esc(d.description)}">${esc(d.icon)} ${esc(d.label)}</th>`
  ).join('');

  const rows = conditions.map(p => _renderRow(p)).join('');

  return `
<div class="cb-table-wrap">
  <table class="cb-table">
    <thead>
      <tr class="cb-thead-row">
        <th class="cb-th">Tier</th>
        <th class="cb-th">Condition</th>
        <th class="cb-th">ICD-10</th>
        <th class="cb-th">Category</th>
        ${dimHeaders}
        <th class="cb-th">Progress</th>
      </tr>
    </thead>
    <tbody id="cb-tbody">
      ${rows || '<tr><td colspan="11" class="cb-empty-row">No conditions match filter</td></tr>'}
    </tbody>
  </table>
</div>`;
}

// ─── Kanban view ─────────────────────────────────────────────────────────────────
function _renderKanban(conditions) {
  const byTier = { 1: [], 2: [], 3: [], 4: [] };
  for (const p of conditions) byTier[p.tier].push(p);

  const cols = [1,2,3,4].map(tier => {
    const t = PRIORITY_TIERS[tier];
    const cards = byTier[tier].map(p => {
      const merged = getMergedStatus(p, _state.overrides);
      const pct = calcCompletionPct({ ...p, status: merged });
      const dims = ['schema','protocols','assessments','handbook','patientView','qaComplete'];
      return `
<div class="cb-kanban-card" onclick="window._cbExpandRow('${esc(p.id)}')">
  <div class="cb-kanban-card-header">
    <span class="cb-kanban-name">${esc(p.label)}</span>
    <span class="cb-kanban-short">${esc(p.shortLabel)}</span>
  </div>
  <div class="cb-kanban-icons">${dims.map(d => _statusIcon(merged[d])).join('')}</div>
  <div class="cb-kanban-prog">
    <div class="cb-prog-wrap">
      <div class="cb-prog-bar" style="width:${pct}%;background:${pct>=83?'#10b981':pct>=50?'#f59e0b':'#ef4444'}"></div>
    </div>
    <span class="cb-prog-label">${pct}%</span>
  </div>
</div>`;
    }).join('');

    return `
<div class="cb-kanban-col">
  <div class="cb-kanban-col-header" style="border-top:3px solid ${t.color}">
    <span class="cb-kanban-col-title" style="color:${t.color}">${t.label}</span>
    <span class="cb-kanban-col-count">${byTier[tier].length} conditions</span>
  </div>
  <div class="cb-kanban-cards">${cards || '<div class="cb-kanban-empty">No conditions</div>'}</div>
</div>`;
  }).join('');

  return `<div class="cb-kanban-grid">${cols}</div>`;
}

// ─── Detail modal (when expanded + kanban clicked) ──────────────────────────────
function _renderDetailModal(pkg) {
  if (!pkg) return '';
  const merged = getMergedStatus(pkg, _state.overrides);
  const pct = calcCompletionPct({ ...pkg, status: merged });
  const dims = ['schema','protocols','assessments','handbook','patientView','qaComplete'];

  return `
<div class="cb-modal-overlay" onclick="if(event.target===this)window._cbCloseModal()">
  <div class="cb-modal">
    <div class="cb-modal-header">
      <div>
        <h2 class="cb-modal-title">${esc(pkg.label)}</h2>
        <div class="cb-modal-meta">
          ${_tierBadge(pkg.tier)}
          <code class="cb-icd">${esc(pkg.icd10)}</code>
          <span class="cb-cat">${esc(pkg.category)}</span>
        </div>
      </div>
      <button class="cb-modal-close" onclick="window._cbCloseModal()">\u2715</button>
    </div>
    <div class="cb-modal-body">
      <div class="cb-modal-progress">
        <div class="cb-prog-wrap" style="height:10px">
          <div class="cb-prog-bar" style="width:${pct}%;background:${pct>=83?'#10b981':pct>=50?'#f59e0b':'#ef4444'}"></div>
        </div>
        <span class="cb-prog-label" style="font-size:14px;font-weight:700">${pct}% complete</span>
      </div>

      <div class="cb-modal-grid">
        <div>
          <h4 class="cb-expand-h4">Status</h4>
          ${dims.map(d => {
            const dim = STATUS_DIMENSIONS.find(x => x.id === d);
            return `
<div class="cb-status-detail-row">
  <span class="cb-status-detail-label">${dim.icon} ${dim.label}</span>
  <span class="cb-status-detail-val">${_statusCell(merged[d])}</span>
  <button class="cb-toggle-btn" onclick="window._cbToggleStatus('${esc(pkg.id)}','${d}')">
    ${merged[d] === true ? 'Mark Partial' : merged[d] === 'partial' ? 'Mark Missing' : 'Mark Ready'}
  </button>
</div>`;
          }).join('')}
        </div>
        <div>
          <h4 class="cb-expand-h4">Protocols (${pkg.protocols.length})</h4>
          ${pkg.protocols.length ? pkg.protocols.map(id => `<span class="cb-tag">${esc(id)}</span>`).join('') : '<span class="cb-empty-tag">None mapped</span>'}

          <h4 class="cb-expand-h4" style="margin-top:14px">Assessments (${pkg.assessments.length})</h4>
          ${pkg.assessments.length ? pkg.assessments.map(a => `<span class="cb-tag cb-tag-blue">${esc(a)}</span>`).join('') : '<span class="cb-empty-tag">None</span>'}

          <h4 class="cb-expand-h4" style="margin-top:14px">Handbooks (${pkg.handbooks.length})</h4>
          ${pkg.handbooks.length ? pkg.handbooks.map(id => `<span class="cb-tag cb-tag-amber">${esc(id)}</span>`).join('') : '<span class="cb-empty-tag">None</span>'}

          <h4 class="cb-expand-h4" style="margin-top:14px">Home Programs (${pkg.homePrograms.length})</h4>
          ${pkg.homePrograms.length ? pkg.homePrograms.map(id => `<span class="cb-tag cb-tag-green">${esc(id)}</span>`).join('') : '<span class="cb-empty-tag">None</span>'}
        </div>
      </div>

      <div style="margin-top:16px">
        <h4 class="cb-expand-h4">Clinical Notes</h4>
        <p class="cb-expand-notes">${esc(pkg.notes)}</p>
      </div>
      ${pkg.qaNotes ? `<div style="margin-top:12px"><h4 class="cb-expand-h4">QA Notes</h4><p class="cb-expand-notes cb-qa-notes">${esc(pkg.qaNotes)}</p></div>` : ''}
      <div style="margin-top:14px">
        <textarea class="cb-qa-textarea" placeholder="Add QA notes\u2026" id="qa-modal-${esc(pkg.id)}">${esc(pkg.qaNotes)}</textarea>
        <button class="cb-btn cb-btn-sm cb-btn-primary" style="margin-top:8px"
                onclick="window._cbSaveQANote('${esc(pkg.id)}',true)">Save QA Note</button>
      </div>
    </div>
  </div>
</div>`;
}

// ─── Main render ──────────────────────────────────────────────────────────────────
function _render(el) {
  const stats = getSummaryStats();
  const conditions = _filtered();
  const modalPkg = _state.viewMode === 'kanban' && _state.expandedId
    ? CONDITION_PACKAGES.find(p => p.id === _state.expandedId)
    : null;

  el.innerHTML = `
<div class="cb-wrap">
  ${_renderHeader(stats)}
  ${_renderFilters()}
  <div class="cb-count-bar">
    Showing <strong>${conditions.length}</strong> of <strong>${CONDITION_PACKAGES.length}</strong> conditions
  </div>
  ${_state.viewMode === 'table' ? _renderTable(conditions) : _renderKanban(conditions)}
  ${modalPkg ? _renderDetailModal(modalPkg) : ''}
</div>`;
}

// ─── Event handlers ───────────────────────────────────────────────────────────────
function _setupHandlers(el) {
  window._cbFilterTier = (v) => { _state.filterTier = v; _state.expandedId = null; _render(el); };
  window._cbFilterCat  = (v) => { _state.filterCategory = v; _state.expandedId = null; _render(el); };
  window._cbSearch     = (v) => { _state.search = v; _state.expandedId = null; _render(el); };

  window._cbExpandRow = (id) => {
    if (_state.viewMode === 'kanban') {
      _state.expandedId = _state.expandedId === id ? null : id;
    } else {
      _state.expandedId = _state.expandedId === id ? null : id;
    }
    _render(el);
  };

  window._cbCloseModal = () => { _state.expandedId = null; _render(el); };

  window._cbToggleView = () => {
    _state.viewMode = _state.viewMode === 'table' ? 'kanban' : 'table';
    _state.expandedId = null;
    _render(el);
  };

  window._cbToggleStatus = (conditionId, dimension) => {
    const pkg = CONDITION_PACKAGES.find(p => p.id === conditionId);
    if (!pkg) return;
    const merged = getMergedStatus(pkg, _state.overrides);
    const cur = merged[dimension];
    const next = cur === true ? 'partial' : cur === 'partial' ? false : true;
    saveStatusOverride(conditionId, dimension, next);
    _state.overrides = loadStatusOverrides();
    _render(el);
  };

  window._cbSaveQANote = (conditionId, isModal = false) => {
    const inputId = isModal ? `qa-modal-${conditionId}` : `qa-note-${conditionId}`;
    const textarea = document.getElementById(inputId);
    if (!textarea) return;
    const val = textarea.value.trim();
    // Persist to overrides map as qaNotes field
    if (!_state.overrides[conditionId]) _state.overrides[conditionId] = {};
    _state.overrides[conditionId]['_qaNotes'] = val;
    const ls = loadStatusOverrides();
    if (!ls[conditionId]) ls[conditionId] = {};
    ls[conditionId]['_qaNotes'] = val;
    try { localStorage.setItem('ds_condition_pkg_status', JSON.stringify(ls)); } catch {}
    // Flash saved indicator
    textarea.style.borderColor = '#10b981';
    setTimeout(() => { textarea.style.borderColor = ''; }, 1500);
  };

  window._cbExportCSV = () => {
    const dims = ['schema','protocols','assessments','handbook','patientView','qaComplete'];
    const header = ['ID','Label','ICD-10','Category','Tier','Schema','Protocols','Assessments','Handbook','Patient View','QA Complete','Completion %'].join(',');
    const rows = CONDITION_PACKAGES.map(p => {
      const merged = getMergedStatus(p, _state.overrides);
      const pct = calcCompletionPct({ ...p, status: merged });
      const vals = [
        p.id, `"${p.label}"`, p.icd10, `"${p.category}"`, p.tier,
        ...dims.map(d => merged[d] === true ? 'Ready' : merged[d] === 'partial' ? 'Partial' : 'Missing'),
        `${pct}%`,
      ];
      return vals.join(',');
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'condition-backlog.csv'; a.click();
    URL.revokeObjectURL(url);
  };
}

// ─── Page entry ───────────────────────────────────────────────────────────────────
export async function pgConditionBacklog(setTopbar, navigate) {
  setTopbar({
    title: 'Condition Package Backlog',
    subtitle: 'Phase 14 \u2014 53 conditions \u00B7 6 readiness dimensions \u00B7 priority-ordered',
  });

  const el = document.getElementById('main-content') || document.getElementById('content');
  if (!el) return;

  // Load persisted overrides
  _state.overrides = loadStatusOverrides();

  _setupHandlers(el);
  _render(el);
}
