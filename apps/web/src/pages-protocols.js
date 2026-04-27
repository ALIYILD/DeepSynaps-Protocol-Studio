// ─────────────────────────────────────────────────────────────────────────────
// pages-protocols.js — Protocol Intelligence Pages
// pgProtocolSearch · pgProtocolDetail · pgProtocolBuilderV2
// ─────────────────────────────────────────────────────────────────────────────
import {
  CONDITIONS, DEVICES, PROTOCOL_TYPES, GOVERNANCE_LABELS, EVIDENCE_GRADES,
  PROTOCOL_LIBRARY, searchProtocols, getProtocolsByCondition, getCondition, getDevice,
} from './protocols-data.js';
import { EVIDENCE_SUMMARY, CONDITION_EVIDENCE, getConditionEvidence } from './evidence-dataset.js';
import { renderLiveEvidencePanel } from './live-evidence.js';
import { renderPersonalizationWizard, bindPersonalizationActions } from './protocol-personalization-wizard.js';
import { api } from './api.js';

// Normalise a /api/v1/registry/protocols row into the shape pgProtocolSearch
// renders (matches PROTOCOL_LIBRARY entries). Keeps the backend as the
// authoritative source for ids the curated library hasn't registered.
function _backendToStudio(row) {
  const grade = String(row.evidence_grade || '').replace(/^EV-/, '') || 'E';
  const sessTotalMatch = String(row.total_course || '').match(/\d+/);
  const sessions_total = sessTotalMatch ? parseInt(sessTotalMatch[0], 10) : null;
  const freqMatch = String(row.frequency_hz || '').match(/[\d.]+/);
  const frequency_hz = freqMatch ? parseFloat(freqMatch[0]) : null;
  const governance = [];
  const ol = String(row.on_label_vs_off_label || '').toLowerCase();
  if (ol.startsWith('on'))  governance.push('on-label');
  if (ol.startsWith('off')) governance.push('off-label');
  if (String(row.review_status || '').toLowerCase().includes('review')) governance.push('reviewed');
  return {
    id: row.id,
    name: row.name || row.id,
    conditionId: row.condition_id || '',
    device: (row.modality_id || '').toLowerCase() || (row.device_id_if_specific || '').toLowerCase() || '',
    subtype: row.coil_or_electrode_placement || '',
    target: row.target_region || '',
    evidenceGrade: grade,
    type: 'classic',
    governance,
    parameters: {
      frequency_hz,
      intensity: row.intensity || undefined,
      session_duration_min: sessions_total ? undefined : undefined,
      sessions_total,
      sessions_per_week: parseInt(String(row.sessions_per_week || '').match(/\d+/)?.[0] || '', 10) || null,
    },
    notes: row.evidence_summary || '',
    contraindications: row.contraindication_check_required
      ? [String(row.contraindication_check_required)] : [],
    references: [row.source_url_primary, row.source_url_secondary].filter(Boolean),
    tags: [],
    _source: 'backend',
  };
}

// Build a merged protocol library by layering backend registry rows on top
// of the curated PROTOCOL_LIBRARY. Dedup by id; curated wins on collision.
async function _loadMergedLibrary() {
  const merged = [...PROTOCOL_LIBRARY];
  try {
    const res = await api.protocols();
    const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
    if (items.length) {
      const have = new Set(merged.map(p => p.id));
      for (const row of items) {
        if (!row?.id || have.has(row.id)) continue;
        merged.push(_backendToStudio(row));
        have.add(row.id);
      }
    }
  } catch { /* backend offline — curated library still renders */ }
  return merged;
}

// Mirror of protocols-data.js searchProtocols, but scoped to a caller-supplied
// library so we can search the merged (curated + backend) set.
function _searchIn(library, query, filters = {}) {
  const q = String(query || '').toLowerCase().trim();
  return library.filter(p => {
    if (filters.conditionId && p.conditionId !== filters.conditionId) return false;
    if (filters.device && p.device !== filters.device) return false;
    if (filters.type && p.type !== filters.type) return false;
    if (filters.evidenceGrade && p.evidenceGrade !== filters.evidenceGrade) return false;
    if (filters.governance && !(p.governance || []).includes(filters.governance)) return false;
    if (!q) return true;
    const hay = [
      p.name, p.id, p.conditionId, p.device, p.subtype, p.target,
      ...(p.tags || []), ...(p.governance || []),
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
}

// ── Shared helpers ────────────────────────────────────────────────────────────
const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const _govBadges = (govArr) => (govArr || []).map(g => {
  const def = GOVERNANCE_LABELS[g] || { label: g, color: '#475569', bg: '#f1f5f9' };
  return `<span class="prot-gov-badge" style="color:${def.color};background:${def.bg}">${def.label}</span>`;
}).join('');

const _evidenceBadge = grade => {
  const def = EVIDENCE_GRADES[grade] || EVIDENCE_GRADES['E'];
  return `<span class="prot-evidence-badge" style="color:${def.color};background:${def.bg}" title="${_esc(def.description)}">Grade ${grade}</span>`;
};

const _typeBadge = type => {
  const def = PROTOCOL_TYPES.find(t => t.id === type) || { label: type, color: '#475569', icon: '' };
  return `<span class="prot-type-badge" style="color:${def.color};border-color:${def.color}">${def.icon} ${def.label}</span>`;
};

const _deviceIcon = deviceId => DEVICES.find(d => d.id === deviceId)?.icon || '\u25CE';
const _deviceLabel = deviceId => DEVICES.find(d => d.id === deviceId)?.label || deviceId;
const _condLabel = cid => CONDITIONS.find(c => c.id === cid)?.label || cid;
const _typeColor = type => PROTOCOL_TYPES.find(t => t.id === type)?.color || '#64748b';

function _hasReviewedGovernance(proto) {
  const gov = proto?.governance || [];
  return gov.includes('reviewed') || gov.includes('approved');
}

function _canUseProtocol(proto) {
  if (!proto) return false;
  const gov = proto.governance || [];
  if (!gov.includes('off-label')) return true;

  if (!_hasReviewedGovernance(proto)) {
    window._showNotifToast?.({
      title: 'Review Required',
      body: 'This off-label protocol cannot be used until clinician review is recorded in the registry.',
      severity: 'warn',
    });
    return false;
  }

  window._protOffLabelUseAcks = window._protOffLabelUseAcks || {};
  if (window._protOffLabelUseAcks[proto.id]) return true;

  const acknowledged = window.confirm(
    [
      'Off-label protocol acknowledgement',
      '',
      `"${proto.name}" is marked off-label and has clinician review on file.`,
      'Confirm that off-label documentation and informed acknowledgement are complete before opening the course wizard.',
    ].join('\n')
  );
  if (!acknowledged) {
    window._showNotifToast?.({
      title: 'Off-Label Not Acknowledged',
      body: 'Course launch cancelled. Acknowledge off-label use before continuing.',
      severity: 'info',
    });
    return false;
  }

  window._protOffLabelUseAcks[proto.id] = true;
  window._showNotifToast?.({
    title: 'Off-Label Acknowledged',
    body: 'Session acknowledgement recorded. Course wizard unlocked for this protocol.',
    severity: 'info',
  });
  return true;
}

// ── Window state for cross-page navigation ────────────────────────────────────
window._protDetailId = window._protDetailId || null;
window._protFromCondition = window._protFromCondition || null;
window._protOffLabelUseAcks = window._protOffLabelUseAcks || {};

// =============================================================================
// pgProtocolSearch — Browse, filter, and launch all protocols
// =============================================================================
export async function pgProtocolSearch(setTopbar, navigate) {
  setTopbar('Protocol Intelligence', '');

  const el = document.getElementById('content');
  if (!el) return;
  el.innerHTML = '<div class="prot-loading">Loading protocol library\u2026</div>';

  // Merged library — curated PROTOCOL_LIBRARY layered with backend
  // /api/v1/registry/protocols. See _loadMergedLibrary above.
  const LIBRARY = await _loadMergedLibrary();

  // ── State ─────────────────────────────────────────────────────────────────
  let _state = {
    query: '',
    conditionId: '',
    device: '',
    type: '',
    evidenceGrade: '',
    governance: '',
    view: 'grid', // 'grid' | 'list' | 'by-condition'
    category: '',
    classification: 'all', // quick-filter chip: all|on-label|off-label|ai|scan
  };

  // ── Category list ─────────────────────────────────────────────────────────
  const categories = [...new Set(CONDITIONS.map(c => c.category))];

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalProtocols = LIBRARY.length;
  const totalConditions = CONDITIONS.length;
  const onLabelCount  = LIBRARY.filter(p => (p.governance||[]).includes('on-label')).length;
  const offLabelCount = LIBRARY.filter(p => (p.governance||[]).includes('off-label')).length;
  const aiCount       = LIBRARY.filter(p => p.type === 'ai-personalized').length;
  const scanCount     = LIBRARY.filter(p => p.type === 'scan-guided' || p.type === 'brain-scan').length;
  const gradeACount   = LIBRARY.filter(p => p.evidenceGrade === 'A').length;
  const backendCount  = LIBRARY.filter(p => p._source === 'backend').length;

  // ── Render ────────────────────────────────────────────────────────────────
  const renderPage = () => {
    let results = _searchIn(LIBRARY, _state.query, {
      conditionId: _state.conditionId || undefined,
      device: _state.device || undefined,
      type: _state.type || undefined,
      evidenceGrade: _state.evidenceGrade || undefined,
      governance: _state.governance || undefined,
    });
    // Classification quick-filter chip (independent of the governance dropdown)
    if (_state.classification && _state.classification !== 'all') {
      const c = _state.classification;
      results = results.filter(p => {
        if (c === 'on-label')  return (p.governance || []).includes('on-label');
        if (c === 'off-label') return (p.governance || []).includes('off-label');
        if (c === 'ai')        return p.type === 'ai-personalized' || p.type === 'ai';
        if (c === 'scan')      return p.type === 'scan-guided' || p.type === 'brain-scan';
        return true;
      });
    }

    const _evPapers = EVIDENCE_SUMMARY?.totalPapers || 87000;
    const _evTrials = EVIDENCE_SUMMARY?.totalTrials || 0;

    const summaryStrip = `
      <div class="prot-summary-strip">
        <div class="prot-chip"><span class="prot-chip-val">${totalProtocols}</span><span class="prot-chip-lbl">Protocols</span></div>
        <div class="prot-chip"><span class="prot-chip-val">${totalConditions}</span><span class="prot-chip-lbl">Conditions</span></div>
        <div class="prot-chip prot-chip-green"><span class="prot-chip-val">${gradeACount}</span><span class="prot-chip-lbl">Grade A</span></div>
        <div class="prot-chip prot-chip-blue"><span class="prot-chip-val">${onLabelCount}</span><span class="prot-chip-lbl">On-Label</span></div>
        <div class="prot-chip prot-chip-purple"><span class="prot-chip-val">${aiCount}</span><span class="prot-chip-lbl">AI-Personalized</span></div>
        <div class="prot-chip" title="87K curated research papers indexed"><span class="prot-chip-val">${(_evPapers / 1000).toFixed(0)}K</span><span class="prot-chip-lbl">Papers</span></div>
        <div class="prot-chip" title="Clinical trials from evidence dataset"><span class="prot-chip-val">${_evTrials.toLocaleString()}</span><span class="prot-chip-lbl">Trials</span></div>
        ${backendCount ? `<div class="prot-chip" title="Live from /api/v1/registry/protocols"><span class="prot-chip-val">${backendCount}</span><span class="prot-chip-lbl">Registry</span></div>` : ''}
      </div>`;

    // Classification quick-filter chips — complement the governance/type
    // dropdowns in filterBar. Each chip carries a live count.
    const _clsChip = (id, label, count) =>
      `<button class="prot-cls-chip${_state.classification === id ? ' active' : ''}" onclick="window._protSetClassification('${id}')" data-cls="${id}">
        ${_esc(label)}<span class="prot-cls-count">${count}</span>
      </button>`;
    const classificationChips = `
      <div class="prot-cls-row">
        ${_clsChip('all', 'All', totalProtocols)}
        ${_clsChip('on-label', 'On-Label', onLabelCount)}
        ${_clsChip('off-label', 'Off-Label', offLabelCount)}
        ${_clsChip('ai', 'AI-Personalized', aiCount)}
        ${_clsChip('scan', 'Scan-Guided', scanCount)}
      </div>`;

    // Evidence level chips — filter by evidenceGrade state
    const _evChip = (grade, label) => {
      const cnt = grade === '' ? totalProtocols : LIBRARY.filter(p => p.evidenceGrade === grade).length;
      const active = _state.evidenceGrade === grade;
      const def = grade ? (EVIDENCE_GRADES[grade] || {}) : {};
      const style = active && grade
        ? `background:${def.bg || 'var(--teal)'};color:${def.color || 'var(--bg-card)'};border-color:${def.color || 'var(--teal)'}`
        : active ? 'background:var(--teal);color:var(--bg-card);border-color:var(--teal)' : '';
      return `<button class="prot-ev-chip${active ? ' active' : ''}" style="${style}" onclick="window._protFilterGrade('${grade}')">${_esc(label)}<span class="prot-cls-count">${cnt}</span></button>`;
    };
    const evidenceLevelChips = `
      <div class="prot-ev-row" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;align-items:center">
        <span style="font-size:11px;color:var(--text-tertiary);font-family:var(--font-mono);margin-right:4px">Evidence:</span>
        ${_evChip('', 'All')}
        ${_evChip('A', 'A — Strong')}
        ${_evChip('B', 'B — Moderate')}
        ${_evChip('C', 'C — Emerging')}
        ${_evChip('D', 'D — Limited')}
        ${_evChip('E', 'Unrated')}
      </div>`;

    const filterBar = `
      <div class="prot-filter-bar">
        <input class="prot-search" type="text" placeholder="Search protocols, conditions, targets, tags\u2026" value="${_esc(_state.query)}" oninput="window._protSearch(this.value)">
        <select class="prot-filter-sel" onchange="window._protFilterCondition(this.value)">
          <option value="">All Conditions</option>
          ${categories.map(cat => `<optgroup label="${cat}">${CONDITIONS.filter(c=>c.category===cat).map(c=>`<option value="${c.id}"${_state.conditionId===c.id?' selected':''}>${c.label}</option>`).join('')}</optgroup>`).join('')}
        </select>
        <select class="prot-filter-sel" onchange="window._protFilterDevice(this.value)">
          <option value="">All Devices</option>
          ${DEVICES.map(d=>`<option value="${d.id}"${_state.device===d.id?' selected':''}>${d.icon} ${d.label}</option>`).join('')}
        </select>
        <select class="prot-filter-sel" onchange="window._protFilterType(this.value)">
          <option value="">All Types</option>
          ${PROTOCOL_TYPES.map(t=>`<option value="${t.id}"${_state.type===t.id?' selected':''}>${t.icon} ${t.label}</option>`).join('')}
        </select>
        <select class="prot-filter-sel" onchange="window._protFilterGrade(this.value)">
          <option value="">All Evidence</option>
          ${Object.entries(EVIDENCE_GRADES).map(([k,v])=>`<option value="${k}"${_state.evidenceGrade===k?' selected':''}>${v.label}</option>`).join('')}
        </select>
        <select class="prot-filter-sel" onchange="window._protFilterGov(this.value)">
          <option value="">All Governance</option>
          ${Object.entries(GOVERNANCE_LABELS).map(([k,v])=>`<option value="${k}"${_state.governance===k?' selected':''}>${v.label}</option>`).join('')}
        </select>
        <div class="prot-view-toggle">
          <button class="prot-view-btn${_state.view==='grid'?' active':''}" onclick="window._protView('grid')" title="Grid">&#9783;</button>
          <button class="prot-view-btn${_state.view==='list'?' active':''}" onclick="window._protView('list')" title="List">&#9776;</button>
          <button class="prot-view-btn${_state.view==='by-condition'?' active':''}" onclick="window._protView('by-condition')" title="By Condition">&#9783;</button>
        </div>
      </div>`;

    const _protCard = p => {
      const cond = getCondition(p.conditionId);
      const dev = getDevice(p.device);
      return `
        <div class="prot-card" onclick="window._protOpenDetail('${_esc(p.id)}')">
          <div class="prot-card-header">
            <span class="prot-device-icon" title="${_esc(_deviceLabel(p.device))}">${_deviceIcon(p.device)}</span>
            <span class="prot-card-cond">${_esc(cond?.shortLabel || cond?.label || p.conditionId)}</span>
            ${_evidenceBadge(p.evidenceGrade)}
          </div>
          <div class="prot-card-name">${_esc(p.name)}</div>
          <div class="prot-card-target">\uD83C\uDFAF ${_esc(p.target || '\u2014')}</div>
          <div class="prot-card-badges">
            ${_typeBadge(p.type)}
            ${_govBadges(p.governance)}
          </div>
          <div class="prot-card-footer">
            <span class="prot-card-params">${p.parameters?.sessions_total ? p.parameters.sessions_total + ' sessions' : ''} ${p.parameters?.frequency_hz ? '\u00B7 ' + p.parameters.frequency_hz + 'Hz' : ''}</span>
            <button class="prot-use-btn" onclick="event.stopPropagation();window._protUseProtocol('${_esc(p.id)}')">Use</button>
          </div>
        </div>`;
    };

    const _protRow = p => {
      const cond = getCondition(p.conditionId);
      return `
        <div class="prot-row" onclick="window._protOpenDetail('${_esc(p.id)}')">
          <div class="prot-row-icon">${_deviceIcon(p.device)}</div>
          <div class="prot-row-main">
            <div class="prot-row-name">${_esc(p.name)}</div>
            <div class="prot-row-cond">${_esc(cond?.label || p.conditionId)}</div>
          </div>
          <div class="prot-row-type">${_typeBadge(p.type)}</div>
          <div class="prot-row-evidence">${_evidenceBadge(p.evidenceGrade)}</div>
          <div class="prot-row-gov">${_govBadges(p.governance)}</div>
          <div class="prot-row-params">${p.parameters?.sessions_total ? p.parameters.sessions_total + ' sess.' : '\u2014'}</div>
          <div class="prot-row-actions" onclick="event.stopPropagation()">
            <button class="prot-use-btn" onclick="window._protUseProtocol('${_esc(p.id)}')">Use</button>
          </div>
        </div>`;
    };

    let mainContent = '';
    if (_state.view === 'by-condition') {
      const conditionsWithResults = CONDITIONS.filter(c => results.some(p => p.conditionId === c.id));
      mainContent = conditionsWithResults.length
        ? conditionsWithResults.map(cond => {
            const condProtos = results.filter(p => p.conditionId === cond.id);
            const _condEv = getConditionEvidence(cond.id);
            const _paperInfo = _condEv?.paperCount ? ` \u00B7 ${_condEv.paperCount.toLocaleString()} papers` : '';
            return `<div class="prot-cond-group">
              <div class="prot-cond-header">
                <span class="prot-cond-label">${_esc(cond.label)}</span>
                <span class="prot-cond-meta">${_esc(cond.icd10)} \u00B7 ${condProtos.length} protocol${condProtos.length!==1?'s':''}${_paperInfo}</span>
                <div class="prot-cond-devices">${(cond.commonDevices||[]).map(d=>`<span title="${_esc(_deviceLabel(d))}">${_deviceIcon(d)}</span>`).join('')}</div>
              </div>
              <div class="prot-card-grid">${condProtos.map(_protCard).join('')}</div>
            </div>`;
          }).join('')
        : '<div class="prot-empty">No protocols match current filters.</div>';
    } else if (_state.view === 'list') {
      mainContent = results.length
        ? `<div class="prot-list-header"><span></span><span>Protocol</span><span>Type</span><span>Evidence</span><span>Governance</span><span>Sessions</span><span></span></div>
           <div class="prot-list">${results.map(_protRow).join('')}</div>`
        : '<div class="prot-empty">No protocols match current filters.</div>';
    } else {
      mainContent = results.length
        ? `<div class="prot-card-grid prot-card-grid-full">${results.map(_protCard).join('')}</div>`
        : '<div class="prot-empty">No protocols match current filters. <button class="prot-use-btn" onclick="window._protClearFilters()">Clear filters</button></div>';
    }

    // ── Condition sidebar ────────────────────────────────────────────────────
    const sidebar = `
      <div class="prot-sidebar">
        <div class="prot-sidebar-title">Categories</div>
        <div class="prot-cat-item${!_state.category?' prot-cat-active':''}" onclick="window._protFilterCategory('')">All (${CONDITIONS.length})</div>
        ${categories.map(cat => {
          const count = CONDITIONS.filter(c=>c.category===cat).length;
          return `<div class="prot-cat-item${_state.category===cat?' prot-cat-active':''}" onclick="window._protFilterCategory('${cat}')">${cat} <span class="prot-cat-count">${count}</span></div>`;
        }).join('')}
        <div class="prot-sidebar-title" style="margin-top:16px">Quick Actions</div>
        <button class="prot-sidebar-btn" onclick="window._nav('protocol-builder')">+ Build Protocol</button>
        <button class="prot-sidebar-btn" onclick="window._nav('decision-support')">AI Decision Support</button>
      </div>`;

    el.innerHTML = `
      <div class="prot-page">
        ${summaryStrip}
        <div class="prot-body">
          ${sidebar}
          <div class="prot-main">
            <div class="prot-results-header">
              <span class="prot-results-count">${results.length} protocol${results.length!==1?'s':''} found</span>
            </div>
            ${classificationChips}
            ${evidenceLevelChips}
            ${filterBar}
            <div id="prot-live-evidence"></div>
            ${mainContent}
          </div>
        </div>
      </div>`;

    // Live evidence panel — queries services/evidence-pipeline. Scoped to the
    // current search query so doctors see the same keywords surface real
    // PubMed/OpenAlex/trial/FDA hits alongside the curated protocol library.
    const liveHost = document.getElementById('prot-live-evidence');
    if (liveHost) {
      renderLiveEvidencePanel(liveHost, {
        defaultQuery: _state.query || '',
        compact: true,
      });
    }
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  window._protSearch = v => { _state.query = v; renderPage(); };
  window._protFilterCondition = v => { _state.conditionId = v; renderPage(); };
  window._protFilterDevice = v => { _state.device = v; renderPage(); };
  window._protFilterType = v => { _state.type = v; renderPage(); };
  window._protFilterGrade = v => { _state.evidenceGrade = v; renderPage(); };
  window._protFilterGov = v => { _state.governance = v; renderPage(); };
  window._protView = v => { _state.view = v; renderPage(); };
  window._protFilterCategory = cat => { _state.category = cat; _state.conditionId = ''; renderPage(); };
  window._protSetClassification = v => { _state.classification = v || 'all'; renderPage(); };
  window._protClearFilters = () => { _state = { query:'', conditionId:'', device:'', type:'', evidenceGrade:'', governance:'', view:'grid', category:'', classification:'all' }; renderPage(); };

  window._protOpenDetail = id => {
    window._protDetailId = id;
    window._nav('protocol-detail');
  };

  window._protUseProtocol = id => {
    window._protDetailId = id;
    const proto = LIBRARY.find(p => p.id === id);
    if (proto) {
      if (!_canUseProtocol(proto)) return;
      window._wizardProtocolId = id;
      window._nav('courses');
      window._showNotifToast?.({ title: 'Protocol Selected', body: `"${proto.name}" ready to use in course wizard.`, severity: 'success' });
    }
  };

  renderPage();
}

// =============================================================================
// pgProtocolDetail — Rich detail view for a single protocol
// =============================================================================
export async function pgProtocolDetail(setTopbar, navigate) {
  const el = document.getElementById('content');
  if (!el) return;

  const id = window._protDetailId;
  const proto = PROTOCOL_LIBRARY.find(p => p.id === id);

  if (!proto) {
    el.innerHTML = '<div class="prot-empty">Protocol not found. <button class="prot-use-btn" onclick="window._nav(\'protocol-wizard\')">Back to Search</button></div>';
    return;
  }

  const cond = getCondition(proto.conditionId);
  const dev = getDevice(proto.device);
  setTopbar(proto.name, '');

  // ── Related protocols ─────────────────────────────────────────────────────
  const related = PROTOCOL_LIBRARY.filter(p => p.conditionId === proto.conditionId && p.id !== proto.id).slice(0, 4);
  const sameDevice = PROTOCOL_LIBRARY.filter(p => p.device === proto.device && p.id !== proto.id && p.conditionId !== proto.conditionId).slice(0, 3);

  // ── Parameter table ───────────────────────────────────────────────────────
  const _paramRow = (label, val) => val != null
    ? `<tr><td class="prot-param-lbl">${_esc(label)}</td><td class="prot-param-val">${_esc(String(val))}</td></tr>`
    : '';

  const params = proto.parameters || {};
  const paramTable = `
    <table class="prot-param-table">
      <tbody>
        ${_paramRow('Frequency', params.frequency_hz ? params.frequency_hz + ' Hz' : null)}
        ${_paramRow('Intensity', params.intensity_pct_rmt ? params.intensity_pct_rmt + '% RMT' : null)}
        ${_paramRow('Current', params.current_ma ? params.current_ma + ' mA' : params.current_ua ? params.current_ua + ' \u00B5A' : null)}
        ${_paramRow('Pulses / Session', params.pulses_per_session)}
        ${_paramRow('Train Duration', params.train_duration_s ? params.train_duration_s + ' s' : null)}
        ${_paramRow('Intertrain Interval', params.intertrain_interval_s ? params.intertrain_interval_s + ' s' : null)}
        ${_paramRow('Session Duration', params.session_duration_min ? params.session_duration_min + ' min' : null)}
        ${_paramRow('Sessions / Week', params.sessions_per_week)}
        ${_paramRow('Sessions / Day', params.sessions_per_day)}
        ${_paramRow('Total Sessions', params.sessions_total)}
        ${_paramRow('Treatment Days', params.treatment_days)}
        ${_paramRow('Wavelength', params.wavelength_nm ? params.wavelength_nm + ' nm' : null)}
        ${_paramRow('Power Density', params.power_density_mw_cm2 ? params.power_density_mw_cm2 + ' mW/cm\u00B2' : null)}
        ${_paramRow('Electrode Size', params.electrode_size_cm2 ? params.electrode_size_cm2 + ' cm\u00B2' : null)}
        ${_paramRow('Pulse Width', params.pulse_width_us ? params.pulse_width_us + ' \u00B5s' : null)}
        ${_paramRow('Protocol', params.protocol)}
        ${_paramRow('Session Structure', params.session_structure)}
        ${_paramRow('Timing', params.timing)}
      </tbody>
    </table>`;

  // ── AI personalization section ────────────────────────────────────────────
  const aiSection = proto.aiPersonalization ? `
    <div class="prot-detail-card prot-ai-card">
      <div class="prot-detail-card-title">\uD83E\uDD16 AI Personalization</div>
      <div class="prot-ai-row"><strong>Input Features:</strong> ${(proto.aiPersonalization.inputFeatures||[]).join(', ')}</div>
      <div class="prot-ai-row"><strong>Adaptations:</strong><ul>${(proto.aiPersonalization.adaptations||[]).map(a=>`<li>${_esc(a)}</li>`).join('')}</ul></div>
      <div class="prot-ai-row"><strong>Required Assessments:</strong> ${(proto.aiPersonalization.requiredAssessments||[]).join(', ')}</div>
    </div>` : '';

  // ── Scan-guided section ───────────────────────────────────────────────────
  const scanSection = proto.scanGuidedNotes ? `
    <div class="prot-detail-card prot-scan-card">
      <div class="prot-detail-card-title">\uD83D\uDD2C Scan-Guided Protocol</div>
      <div class="prot-ai-row"><strong>Primary Target:</strong> ${_esc(proto.scanGuidedNotes.primaryTarget)}</div>
      <div class="prot-ai-row"><strong>EEG Markers:</strong> ${(proto.scanGuidedNotes.eegMarkers||[]).join(', ')}</div>
      <div class="prot-ai-row"><strong>Adjustment Logic:</strong> ${_esc(proto.scanGuidedNotes.adjustmentLogic)}</div>
      <div class="prot-ai-row"><strong>Required Scans:</strong><ul>${(proto.scanGuidedNotes.requiredScans||[]).map(s=>`<li>${_esc(s)}</li>`).join('')}</ul></div>
    </div>` : '';

  // ── Related protocols ─────────────────────────────────────────────────────
  const relatedSection = related.length ? `
    <div class="prot-detail-card">
      <div class="prot-detail-card-title">Same Condition — Other Protocols</div>
      <div class="prot-related-list">
        ${related.map(r => `
          <div class="prot-related-item" onclick="window._protDetailId='${r.id}';window._nav('protocol-detail')">
            <span class="prot-related-icon">${_deviceIcon(r.device)}</span>
            <div>
              <div class="prot-related-name">${_esc(r.name)}</div>
              <div class="prot-related-meta">${_typeBadge(r.type)} ${_evidenceBadge(r.evidenceGrade)}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>` : '';

  el.innerHTML = `
    <div class="prot-detail-page">
      <div class="prot-detail-back" onclick="window._nav('protocol-wizard')">\u2190 Back to Protocol Search</div>

      <div class="prot-detail-hero">
        <div class="prot-detail-hero-icon">${_deviceIcon(proto.device)}</div>
        <div class="prot-detail-hero-body">
          <h1 class="prot-detail-name">${_esc(proto.name)}</h1>
          <div class="prot-detail-hero-meta">
            <span class="prot-cond-pill">${_esc(cond?.label || proto.conditionId)}</span>
            <span class="prot-device-pill">${_esc(dev?.label || proto.device)} &mdash; ${_esc(proto.subtype || '')}</span>
          </div>
          <div class="prot-detail-badges">
            ${_typeBadge(proto.type)}
            ${_govBadges(proto.governance)}
            ${_evidenceBadge(proto.evidenceGrade)}
          </div>
        </div>
        <div class="prot-detail-hero-actions">
          <button class="prot-detail-use-btn" onclick="window._protUseProtocol('${_esc(proto.id)}')">Use This Protocol</button>
          <button class="prot-detail-edit-btn" onclick="window._protEditProtocol('${_esc(proto.id)}')">Edit / Customize</button>
          <button class="prot-detail-personalize-btn" onclick="window._protPersonalize('${_esc(proto.id)}')">&#9881; Personalize</button>
        </div>
      </div>

      <div class="prot-detail-grid">
        <div class="prot-detail-left">
          <div class="prot-detail-card">
            <div class="prot-detail-card-title">Target</div>
            <div class="prot-detail-target">\uD83C\uDFAF ${_esc(proto.target || '\u2014')}</div>
          </div>

          <div class="prot-detail-card">
            <div class="prot-detail-card-title">Protocol Parameters</div>
            ${paramTable}
          </div>

          ${proto.notes ? `
          <div class="prot-detail-card">
            <div class="prot-detail-card-title">Clinical Notes</div>
            <div class="prot-detail-notes">${_esc(proto.notes)}</div>
          </div>` : ''}

          ${aiSection}
          ${scanSection}
        </div>

        <div class="prot-detail-right">
          ${proto.contraindications?.length ? `
          <div class="prot-detail-card prot-contra-card">
            <div class="prot-detail-card-title">\u26A0 Contraindications</div>
            <ul class="prot-detail-list prot-contra-list">${(proto.contraindications||[]).map(c=>`<li>${_esc(c)}</li>`).join('')}</ul>
          </div>` : ''}

          ${proto.sideEffects?.length ? `
          <div class="prot-detail-card">
            <div class="prot-detail-card-title">Side Effects</div>
            <ul class="prot-detail-list">${(proto.sideEffects||[]).map(s=>`<li>${_esc(s)}</li>`).join('')}</ul>
          </div>` : ''}

          ${proto.references?.length ? `
          <div class="prot-detail-card">
            <div class="prot-detail-card-title">References</div>
            <ul class="prot-detail-list prot-ref-list">${(proto.references||[]).map(r=>`<li>${_esc(r)}</li>`).join('')}</ul>
          </div>` : ''}

          <div class="prot-detail-card" id="prot-recent-lit-card">
            <div class="prot-detail-card-title" style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
              <span>\uD83D\uDCC4 Recent literature (last 30 days)</span>
              <span style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text-tertiary);font-weight:400">
                <span id="prot-lit-last-seen"></span>
                <button class="ch-btn-sm" id="prot-lit-refresh-btn" style="font-size:11px">\u21BB Refresh (PubMed)</button>
              </span>
            </div>
            <div id="prot-recent-lit-body" style="font-size:12px;color:var(--text-secondary);padding:8px 0">Loading\u2026</div>
          </div>

          <!--
            Structured report payload preview - surfaces the new ReportPayload
            schema (observed / interpretation / suggested-actions) so clinicians
            see the same visual contract that backs the HTML/PDF export.
            Server populates via POST /api/v1/reports/preview-payload.
          -->
          <div class="prot-detail-card" id="prot-report-preview-card">
            <div class="prot-detail-card-title" style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
              <span>\ud83d\udccb Structured report preview</span>
              <span style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text-tertiary);font-weight:400">
                <span class="prot-aud-toggle" data-active="clinician" style="display:inline-flex;border:1px solid var(--border);border-radius:14px;overflow:hidden">
                  <button class="prot-aud-btn" data-view="clinician" style="padding:3px 10px;border:none;background:var(--teal);color:#fff;font-size:11px;cursor:pointer">Clinician</button>
                  <button class="prot-aud-btn" data-view="patient" style="padding:3px 10px;border:none;background:transparent;color:var(--text-secondary);font-size:11px;cursor:pointer">Patient</button>
                </span>
                <button class="ch-btn-sm" id="prot-report-load-btn" style="font-size:11px">Load preview</button>
              </span>
            </div>
            <div id="prot-report-preview-body" style="font-size:12px;color:var(--text-secondary);padding:8px 0">Click <b>Load preview</b> to render a structured-report sample for this protocol. Sections separate <b>observed findings</b>, <b>model interpretation</b>, and <b>suggested actions</b>; every claim carries an evidence-strength badge and citations link out to PubMed/DOI.</div>
          </div>

          ${proto.tags?.length ? `
          <div class="prot-detail-card">
            <div class="prot-detail-card-title">Tags</div>
            <div class="prot-tags">${(proto.tags||[]).map(t=>`<span class="prot-tag">${_esc(t)}</span>`).join('')}</div>
          </div>` : ''}

          <div class="prot-detail-card" id="prot-detail-evidence-card">
            <div class="prot-detail-card-title" style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
              <span>Evidence</span>
              <span id="prot-ev-status-footer" style="font-size:10px;color:var(--text-tertiary);font-family:var(--font-mono);font-weight:400"></span>
            </div>
            <div class="prot-ev-tabs" style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:10px">
              <button class="prot-ev-tab prot-ev-tab-active" data-tab="papers" onclick="window._protEvTab('papers')" style="padding:5px 12px;font-size:11px;background:none;border:none;border-bottom:2px solid var(--teal);color:var(--teal);cursor:pointer">Papers</button>
              <button class="prot-ev-tab" data-tab="trials" onclick="window._protEvTab('trials')" style="padding:5px 12px;font-size:11px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text-secondary);cursor:pointer">Trials</button>
              <button class="prot-ev-tab" data-tab="fda" onclick="window._protEvTab('fda')" style="padding:5px 12px;font-size:11px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text-secondary);cursor:pointer">FDA</button>
            </div>
            <div id="prot-detail-ev-body" style="font-size:12px;color:var(--text-secondary)">Loading evidence\u2026</div>
          </div>

          ${relatedSection}
        </div>
      </div>
    </div>`;

  window._protEditProtocol = id => {
    window._protDetailId = id;
    window._nav('protocol-builder');
  };

  // ── Personalization Wizard ─────────────────────────────────────────────────
  bindPersonalizationActions();
  window._protPersonalize = id => {
    const p = PROTOCOL_LIBRARY.find(x => x.id === id);
    if (!p) return;
    // Reset wizard state for a fresh session
    window._pwizState = null;
    const html = renderPersonalizationWizard(p, {});
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host.firstElementChild);
  };

  // ── Recent literature (last 30 days) — populated post-render ─────────────
  const _renderLit = (data) => {
    const body = document.getElementById('prot-recent-lit-body');
    const lastSeenEl = document.getElementById('prot-lit-last-seen');
    if (!body) return;
    const entry = data?.by_protocol?.[proto.id];
    if (!entry || !entry.top_papers?.length) {
      body.innerHTML = '<div style="color:var(--text-tertiary);padding:6px 0">No new literature in the last 30 days. Click <b>\u21BB Refresh</b> to check now.</div>';
      if (lastSeenEl && data?.generated_at) lastSeenEl.textContent = 'Snapshot: ' + new Date(data.generated_at).toLocaleDateString();
      return;
    }
    if (lastSeenEl) lastSeenEl.textContent = (entry.new_count_30d || 0) + ' new \u00B7 last seen ' + (entry.last_seen || '\u2014');
    body.innerHTML = entry.top_papers.map(p => {
      const authors = (p.authors || '').split(/[,;]/).map(s=>s.trim()).filter(Boolean);
      const authorStr = authors.length > 3 ? authors.slice(0,3).join(', ') + ' et al' : authors.join(', ');
      const title = (p.title || '(untitled)').length > 140 ? p.title.slice(0,140) + '\u2026' : (p.title || '(untitled)');
      const pmidLink = p.pmid ? `<a href="https://pubmed.ncbi.nlm.nih.gov/${_esc(p.pmid)}/" target="_blank" rel="noopener" style="color:var(--blue);font-size:11px;text-decoration:none">View on PubMed \u2197</a>` : '';
      return `
        <div style="padding:8px 0;border-bottom:1px solid var(--border)">
          <div style="font-weight:500;color:var(--text-primary);line-height:1.3">${_esc(title)}</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${_esc(authorStr)}${p.year ? ' \u00B7 ' + _esc(String(p.year)) : ''}${p.journal ? ' \u00B7 ' + _esc(p.journal) : ''}</div>
          <div style="margin-top:4px">${pmidLink}</div>
        </div>`;
    }).join('');
  };
  const _loadLit = () => {
    if (window._litWatchData) { _renderLit(window._litWatchData); return; }
    fetch('/literature-watch.json').then(r => r.ok ? r.json() : null).then(d => {
      if (d) window._litWatchData = d;
      _renderLit(d);
    }).catch(() => _renderLit(null));
  };
  setTimeout(_loadLit, 0);

  // ── Refresh button — POST to refresh API + reload snapshot ──────────────
  const _refreshBtn = document.getElementById('prot-lit-refresh-btn');
  if (_refreshBtn) {
    _refreshBtn.onclick = async () => {
      _refreshBtn.disabled = true;
      _refreshBtn.textContent = '\u21BB Refreshing\u2026';
      let _finalStatus = null;
      let _polledOk = false;
      try {
        const res = await fetch(`/api/v1/protocols/${encodeURIComponent(proto.id)}/refresh-literature`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'pubmed', requested_by: 'ui-clinician' }),
        });
        if (res.ok) {
          const job = await res.json();
          // Poll for completion (max 30s)
          for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 2000));
            let jobsRes;
            try {
              jobsRes = await fetch(`/api/v1/protocols/${encodeURIComponent(proto.id)}/refresh-literature/jobs`);
            } catch (_netErr) {
              window._showToast?.('Literature refresh: network lost while polling. Please try again.', 'error');
              _polledOk = false;
              break;
            }
            if (!jobsRes.ok) {
              window._showToast?.(`Literature refresh polling failed (HTTP ${jobsRes.status}).`, 'error');
              _polledOk = false;
              break;
            }
            const jobs = await jobsRes.json().catch(() => []);
            const me = jobs.find?.(j => j.id === job.job_id) || jobs[0];
            if (me && (me.status === 'succeeded' || me.status === 'failed' || me.status === 'rate_limited')) {
              _finalStatus = me.status;
              _polledOk = true;
              window._litWatchData = null; // bust cache
              _loadLit();
              break;
            }
          }
          if (!_polledOk && _finalStatus === null) {
            window._showToast?.('Literature refresh did not complete within 30s. Check back shortly.', 'warning');
          } else if (_finalStatus === 'succeeded') {
            window._showToast?.('Literature refreshed.', 'success');
          } else if (_finalStatus === 'failed') {
            window._showToast?.('Literature refresh failed on the server.', 'error');
          } else if (_finalStatus === 'rate_limited') {
            window._showToast?.('Literature refresh rate-limited. Try again later.', 'warning');
          }
        } else if (res.status === 402) {
          window._showToast?.('Monthly literature budget exceeded. Refresh refused.', 'warning');
        } else {
          window._showToast?.(`Literature refresh failed (HTTP ${res.status}).`, 'error');
        }
      } catch (e) {
        console.warn('refresh failed', e);
        window._showToast?.('Literature refresh failed. Please try again.', 'error');
      }
      _refreshBtn.disabled = false;
      _refreshBtn.textContent = '\u21BB Refresh (PubMed)';
    };
  }

  // ── Evidence tab (for-protocol endpoint) ──────────────────────────────────
  // ── Structured report preview (calls /api/v1/reports/preview-payload) ────
  // Renders observed/interpretation/suggested-actions with evidence-strength
  // badges. Has loading / empty / error / 503 states. Audience toggle flips
  // between clinician + patient views without a re-fetch.
  let _reportPayload = null;
  let _reportAudience = 'clinician';

  const _strengthBadge = (s) => {
    const palette = {
      'Strong':           ['#0a5d2c', '#d1f7df'],
      'Moderate':         ['#9b6a00', '#fff2c8'],
      'Limited':          ['#7a3e00', '#fde2cc'],
      'Conflicting':      ['#7a1f1f', '#fbd5d5'],
      'Evidence pending': ['#475569', '#e2e8f0'],
    };
    const [c, bg] = palette[s] || palette['Evidence pending'];
    return `<span style="color:${c};background:${bg};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.3px">${_esc(s)}</span>`;
  };

  const _confidencePill = (level) => {
    if (!level) return '';
    const labels = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence', insufficient: 'Insufficient evidence' };
    const colors = { high: '#0a5d2c', medium: '#9b6a00', low: '#7a3e00', insufficient: '#475569' };
    const color = colors[level] || '#475569';
    return `<span style="color:${color};border:1px solid ${color};padding:2px 10px;border-radius:12px;font-size:10px;font-weight:600">${_esc(labels[level] || level)}</span>`;
  };

  const _renderSectionPayload = (sec, lookup) => {
    const observed = (sec.observed || []).length
      ? `<ul style="margin:4px 0 0;padding-left:18px">${(sec.observed||[]).map(o=>`<li>${_esc(o)}</li>`).join('')}</ul>`
      : `<div style="color:var(--text-tertiary);font-style:italic">No findings recorded.</div>`;
    const interp = (sec.interpretations || []).length
      ? `<ul style="margin:4px 0 0;padding-left:18px;list-style:none">${(sec.interpretations||[]).map(i=>{
          const cites = (i.evidence_refs||[]).map(r=>{
            const cit = lookup[r];
            const link = cit?.doi ? `https://doi.org/${cit.doi}` : (cit?.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${cit.pmid}/` : (cit?.url || ''));
            return link
              ? `<sup><a href="${_esc(link)}" target="_blank" rel="noopener" style="color:#1f5fb3;text-decoration:none">[${_esc(r)}]</a></sup>`
              : `<sup style="color:#7a1f1f">[${_esc(r)}]</sup>`;
          }).join(' ');
          const counter = (i.counter_evidence_refs||[]).length
            ? ` <span style="color:#7a1f1f;font-size:11px;font-weight:600">Conflicting: ${_esc((i.counter_evidence_refs||[]).join(', '))}</span>`
            : '';
          return `<li style="margin-bottom:6px">${_strengthBadge(i.evidence_strength || 'Evidence pending')} <span>${_esc(i.text)}</span> ${cites}${counter}</li>`;
        }).join('')}</ul>`
      : `<div style="color:var(--text-tertiary);font-style:italic">No model interpretations.</div>`;
    const actions = (sec.suggested_actions || []).length
      ? `<ul style="margin:4px 0 0;padding-left:18px">${(sec.suggested_actions||[]).map(a=>{
          const prefix = a.requires_clinician_review === false ? '' : 'Consider: ';
          const why = a.rationale ? `<div style="color:var(--text-tertiary);font-size:11px;margin-top:2px">Why: ${_esc(a.rationale)}</div>` : '';
          return `<li style="margin-bottom:4px"><span>${_esc(prefix)}${_esc(a.text)}</span>${why}</li>`;
        }).join('')}</ul>`
      : `<div style="color:var(--text-tertiary);font-style:italic">No suggested actions.</div>`;
    const cautions = (sec.cautions||[]).length
      ? `<ul style="margin:2px 0 0;padding-left:18px;color:#7a3e00">${(sec.cautions||[]).map(c=>`<li>${_esc(c)}</li>`).join('')}</ul>`
      : `<div style="color:#7a3e00;font-style:italic;font-size:11px">No cautions identified.</div>`;
    const limits = (sec.limitations||[]).length
      ? `<ul style="margin:2px 0 0;padding-left:18px;color:#7a1f1f">${(sec.limitations||[]).map(l=>`<li>${_esc(l)}</li>`).join('')}</ul>`
      : `<div style="color:#7a1f1f;font-style:italic;font-size:11px">No limitations recorded.</div>`;
    return `
      <section style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:10px;background:#ffffff">
        <header style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;flex-wrap:wrap">
          <h4 style="margin:0;font-size:13px;color:var(--text-primary)">${_esc(sec.title)}</h4>
          ${_confidencePill(sec.confidence)}
        </header>
        <div style="border-left:3px solid #1f5fb3;padding:4px 8px;background:#f4f9ff;border-radius:0 6px 6px 0;margin-bottom:6px">
          <div style="font-size:10px;font-weight:700;color:#1f5fb3;text-transform:uppercase;letter-spacing:0.4px">Observed findings</div>
          ${observed}
        </div>
        <div style="border-left:3px solid #9b6a00;padding:4px 8px;background:#fffaf0;border-radius:0 6px 6px 0;margin-bottom:6px">
          <div style="font-size:10px;font-weight:700;color:#9b6a00;text-transform:uppercase;letter-spacing:0.4px">Model interpretation</div>
          ${interp}
        </div>
        <div style="border-left:3px solid #0a5d2c;padding:4px 8px;background:#f3fbf6;border-radius:0 6px 6px 0;margin-bottom:6px">
          <div style="font-size:10px;font-weight:700;color:#0a5d2c;text-transform:uppercase;letter-spacing:0.4px">Suggested actions (decision support)</div>
          ${actions}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px">
          <div><div style="font-size:10px;font-weight:700;color:#7a3e00;text-transform:uppercase;letter-spacing:0.4px">Cautions</div>${cautions}</div>
          <div><div style="font-size:10px;font-weight:700;color:#7a1f1f;text-transform:uppercase;letter-spacing:0.4px">Limitations</div>${limits}</div>
        </div>
      </section>`;
  };

  const _renderReportPayload = () => {
    const body = document.getElementById('prot-report-preview-body');
    if (!body || !_reportPayload) return;
    const lookup = {};
    (_reportPayload.citations || []).forEach(c => { lookup[c.citation_id] = c; });
    const sections = (_reportPayload.sections || []).map(s => _renderSectionPayload(s, lookup)).join('');
    const citeRows = (_reportPayload.citations || []).map(c => {
      const link = c.doi ? `https://doi.org/${c.doi}` : (c.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${c.pmid}/` : c.url || '');
      const status = c.status === 'verified'
        ? `<span style="color:#0a5d2c;background:#d1f7df;font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;text-transform:uppercase">verified</span>`
        : `<span style="color:#7a3e00;background:#fde2cc;font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;text-transform:uppercase">unverified</span>`;
      const lvl = c.evidence_level ? `<span style="margin-left:6px;color:var(--text-tertiary);font-size:11px">${_esc(c.evidence_level)}</span>` : '';
      const linkHtml = link ? `<a href="${_esc(link)}" target="_blank" rel="noopener" style="color:#1f5fb3;text-decoration:none">${_esc(link)}</a>` : `<span style="color:#7a1f1f;font-style:italic">${_esc(c.raw_text || 'no link')}</span>`;
      return `<li style="margin-bottom:6px;border-bottom:1px solid var(--border);padding-bottom:4px">
        <div><strong>[${_esc(c.citation_id)}]</strong> ${_esc(c.title || '(untitled)')} ${status}${lvl}</div>
        <div style="color:var(--text-tertiary);font-size:11px">retrieved ${_esc(c.retrieved_at || '')}</div>
        <div style="font-size:11px">${linkHtml}</div>
      </li>`;
    }).join('');
    const audienceLabel = _reportAudience === 'patient' ? 'Patient view' : 'Clinician view';
    body.innerHTML = `
      <div style="font-size:10px;color:var(--text-tertiary);font-weight:600;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">${_esc(audienceLabel)}</div>
      <div style="font-size:13px;color:var(--text-primary);line-height:1.4;margin-bottom:10px">${_esc(_reportPayload.summary || '')}</div>
      ${sections}
      <details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:var(--text-secondary);font-weight:600">Citations (${(_reportPayload.citations||[]).length})</summary>
        <ol style="margin:6px 0 0;padding-left:18px;list-style:none">${citeRows || '<li style="color:var(--text-tertiary);font-style:italic">No citations attached.</li>'}</ol>
      </details>
      <div style="font-size:10px;color:var(--text-tertiary);font-family:var(--font-mono);margin-top:8px;border-top:1px solid var(--border);padding-top:6px">
        schema: ${_esc(_reportPayload.schema_id)} · generator: ${_esc(_reportPayload.generator_version)} · generated: ${_esc(_reportPayload.generated_at)}
      </div>`;
  };

  document.querySelectorAll('.prot-aud-btn').forEach(btn => {
    btn.onclick = () => {
      _reportAudience = btn.getAttribute('data-view');
      document.querySelectorAll('.prot-aud-btn').forEach(b => {
        const on = b.getAttribute('data-view') === _reportAudience;
        b.style.background = on ? 'var(--teal)' : 'transparent';
        b.style.color = on ? '#fff' : 'var(--text-secondary)';
      });
      _renderReportPayload();
    };
  });

  const _loadReportBtn = document.getElementById('prot-report-load-btn');
  if (_loadReportBtn) {
    _loadReportBtn.onclick = async () => {
      const body = document.getElementById('prot-report-preview-body');
      if (!body) return;
      _loadReportBtn.disabled = true;
      _loadReportBtn.textContent = 'Loading…';
      body.innerHTML = '<div style="color:var(--text-tertiary);padding:8px 0">Building structured report payload…</div>';
      try {
        const res = await fetch('/api/v1/reports/preview-payload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audience: 'both' }),
        });
        if (res.status === 503) {
          body.innerHTML = '<div style="color:#7a3e00;padding:8px 0">Report renderer unavailable (503). The server is missing the PDF/HTML render dependency. Check the API host.</div>';
          window._showToast?.('Report renderer 503: dependency missing on API host.', 'warning');
        } else if (!res.ok) {
          body.innerHTML = `<div style="color:#7a1f1f;padding:8px 0">Failed to load preview (HTTP ${res.status}).</div>`;
          window._showToast?.(`Report preview failed (HTTP ${res.status}).`, 'error');
        } else {
          _reportPayload = await res.json();
          _renderReportPayload();
        }
      } catch (e) {
        console.warn('report preview failed', e);
        body.innerHTML = '<div style="color:#7a1f1f;padding:8px 0">Network error loading report preview.</div>';
        window._showToast?.('Report preview failed. Please try again.', 'error');
      }
      _loadReportBtn.disabled = false;
      _loadReportBtn.textContent = 'Load preview';
    };
  }

  let _evData = null;
  let _evActiveTab = 'papers';

  const _renderEvTab = () => {
    const body = document.getElementById('prot-detail-ev-body');
    if (!body || !_evData) return;
    const papers = _evData.papers || [];
    const trials = _evData.trials || [];
    const devices = _evData.devices || [];
    // Sync tab button styles
    document.querySelectorAll('.prot-ev-tab').forEach(btn => {
      const active = btn.dataset.tab === _evActiveTab;
      btn.style.borderBottomColor = active ? 'var(--teal)' : 'transparent';
      btn.style.color = active ? 'var(--teal)' : 'var(--text-secondary)';
    });
    if (_evActiveTab === 'papers') {
      if (!papers.length) { body.innerHTML = '<div style="color:var(--text-tertiary);padding:6px 0">No indexed papers for this protocol yet.</div>'; return; }
      body.innerHTML = papers.map(p => {
        const authors = (p.authors || []).slice(0, 3).join(', ');
        const pmid = p.pmid ? `<a href="https://pubmed.ncbi.nlm.nih.gov/${_esc(p.pmid)}" target="_blank" rel="noopener" style="color:var(--teal);text-decoration:none">\u2197</a>` : '';
        return `<div style="padding:6px 0;border-bottom:1px solid var(--border)">
          <div style="font-weight:500;color:var(--text-primary)">${_esc(p.title || '(untitled)')} ${pmid}</div>
          <div style="color:var(--text-tertiary)">${_esc(authors)}${p.year ? ' \u00B7 ' + p.year : ''}${p.journal ? ' \u00B7 ' + _esc(p.journal) : ''}${p.cited_by_count ? ' \u00B7 ' + p.cited_by_count + ' cites' : ''}</div>
        </div>`;
      }).join('');
    } else if (_evActiveTab === 'trials') {
      if (!trials.length) { body.innerHTML = '<div style="color:var(--text-tertiary);padding:6px 0">No indexed clinical trials for this protocol.</div>'; return; }
      body.innerHTML = trials.map(t => `
        <div style="padding:6px 0;border-bottom:1px solid var(--border)">
          <a href="https://clinicaltrials.gov/ct2/show/${_esc(t.nct_id)}" target="_blank" rel="noopener" style="font-family:var(--font-mono);color:var(--teal);text-decoration:none">${_esc(t.nct_id)}</a>
          <span style="color:var(--text-primary);margin-left:8px">${_esc(t.title || '')}</span>
          ${t.phase ? `<span style="color:var(--text-tertiary);margin-left:8px;font-size:11px">${_esc(t.phase)}</span>` : ''}
          ${t.status ? `<span style="color:var(--text-tertiary);margin-left:6px;font-size:11px">\u00B7 ${_esc(t.status)}</span>` : ''}
        </div>`).join('');
    } else if (_evActiveTab === 'fda') {
      if (!devices.length) { body.innerHTML = '<div style="color:var(--text-tertiary);padding:6px 0">No FDA device records linked to this protocol.</div>'; return; }
      body.innerHTML = devices.map(d => `
        <div style="padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="font-family:var(--font-mono);color:var(--teal);font-size:11px">${_esc(d.kind?.toUpperCase())} ${_esc(d.number)}</span>
          <span style="color:var(--text-primary);margin-left:8px">${_esc(d.trade_name || d.applicant || '')}</span>
          ${d.decision_date ? `<span style="color:var(--text-tertiary);margin-left:8px;font-size:11px">${_esc(d.decision_date)}</span>` : ''}
        </div>`).join('');
    }
  };

  window._protEvTab = tab => { _evActiveTab = tab; _renderEvTab(); };

  // Load evidence + status concurrently
  Promise.all([
    api.evidenceForProtocol(proto.id, { limit: 10 }),
    api.evidenceStatus(),
  ]).then(([evData, statusData]) => {
    _evData = evData;
    _renderEvTab();
    const footer = document.getElementById('prot-ev-status-footer');
    if (footer && statusData) {
      const total = (statusData.total_papers || 0) + (statusData.total_trials || 0) + (statusData.total_fda || 0);
      let age = '';
      if (statusData.last_updated) {
        const hrs = Math.round((Date.now() - new Date(statusData.last_updated).getTime()) / 3600000);
        age = hrs < 1 ? ' \u00B7 updated recently' : ` \u00B7 updated ${hrs}h ago`;
      }
      footer.textContent = `Evidence DB: ${total.toLocaleString()} records${age}`;
    }
  }).catch(() => {
    const body = document.getElementById('prot-detail-ev-body');
    if (body) body.innerHTML = '<div style="color:var(--text-tertiary)">Evidence DB offline or not ingested yet.</div>';
  });
}

// =============================================================================
// pgProtocolBuilderV2 — Enhanced protocol builder with 5 types + governance
// =============================================================================
export async function pgProtocolBuilderV2(setTopbar, navigate) {
  setTopbar('Protocol Builder', '');

  const el = document.getElementById('content');
  if (!el) return;

  // Load prefill from detail page if navigated via Edit
  const prefill = window._protDetailId
    ? PROTOCOL_LIBRARY.find(p => p.id === window._protDetailId)
    : null;

  // ── State ─────────────────────────────────────────────────────────────────
  let _b = {
    name: prefill?.name || '',
    conditionId: prefill?.conditionId || '',
    type: prefill?.type || 'classic',
    device: prefill?.device || 'tms',
    subtype: prefill?.subtype || '',
    target: prefill?.target || '',
    evidenceGrade: prefill?.evidenceGrade || 'C',
    governance: prefill?.governance ? [...prefill.governance] : ['draft'],
    notes: prefill?.notes || '',
    contraindications: (prefill?.contraindications || []).join('\n'),
    sideEffects: (prefill?.sideEffects || []).join('\n'),
    references: (prefill?.references || []).join('\n'),
    tags: (prefill?.tags || []).join(', '),
    params: { ...( prefill?.parameters || {}) },
    aiPersonalization: prefill?.aiPersonalization ? JSON.stringify(prefill.aiPersonalization, null, 2) : '',
    scanGuidedNotes: prefill?.scanGuidedNotes ? JSON.stringify(prefill.scanGuidedNotes, null, 2) : '',
    saved: false,
    submitted: false,
  };

  const _govToggle = g => {
    if (_b.governance.includes(g)) _b.governance = _b.governance.filter(x => x !== g);
    else _b.governance.push(g);
    renderBuilder();
  };

  // ── Device param fields ───────────────────────────────────────────────────
  const _deviceParams = device => {
    const field = (id, label, type='number', placeholder='') =>
      `<div class="prot-param-field"><label class="prot-param-lbl-b">${label}</label><input class="prot-b-input" type="${type}" id="bp-${id}" placeholder="${placeholder}" value="${_b.params[id] != null ? _b.params[id] : ''}" oninput="window._protBParam('${id}',this.value)"></div>`;

    const common = `
      ${field('sessions_total','Total Sessions','number','e.g. 36')}
      ${field('sessions_per_week','Sessions / Week','number','e.g. 5')}
      ${field('session_duration_min','Session Duration (min)','number','e.g. 20')}
      ${field('notes_param','Special Instructions','text','timing, adjuncts...')}`;

    switch(device) {
      case 'tms': return `
        ${field('frequency_hz','Frequency (Hz)','number','e.g. 10')}
        ${field('intensity_pct_rmt','Intensity (% RMT)','number','e.g. 120')}
        ${field('pulses_per_session','Pulses / Session','number','e.g. 3000')}
        ${field('train_duration_s','Train Duration (s)','number','e.g. 4')}
        ${field('intertrain_interval_s','Intertrain Interval (s)','number','e.g. 26')}
        ${common}`;
      case 'tdcs': return `
        ${field('current_ma','Current (mA)','number','e.g. 2')}
        ${field('electrode_size_cm2','Electrode Size (cm²)','number','e.g. 35')}
        ${common}`;
      case 'tacs': return `
        ${field('frequency_hz','Frequency (Hz)','number','e.g. 10')}
        ${field('current_ma','Current (mA)','number','e.g. 1')}
        ${common}`;
      case 'ces': return `
        ${field('current_ua','Current (µA)','number','e.g. 100')}
        ${field('frequency_hz','Frequency (Hz)','number','e.g. 0.5')}
        ${common}`;
      case 'tavns': return `
        ${field('current_ma','Current (mA)','number','e.g. 0.5')}
        ${field('pulse_width_us','Pulse Width (µs)','number','e.g. 250')}
        ${field('frequency_hz','Frequency (Hz)','number','e.g. 25')}
        ${field('sessions_per_day','Sessions / Day','number','e.g. 2')}
        ${common}`;
      case 'pbm': return `
        ${field('wavelength_nm','Wavelength (nm)','number','e.g. 810')}
        ${field('power_density_mw_cm2','Power Density (mW/cm²)','number','e.g. 25')}
        ${common}`;
      case 'pemf': return `
        ${field('frequency_hz','Frequency (Hz)','number','e.g. 8')}
        ${field('intensity_gauss','Intensity (Gauss)','number','e.g. 1')}
        ${common}`;
      case 'nf': return `
        ${field('alpha_target_hz','Alpha Target (Hz)','text','e.g. 8-12')}
        ${field('theta_target_hz','Theta Target (Hz)','text','e.g. 4-8')}
        ${common}`;
      default: return common;
    }
  };

  const renderBuilder = () => {
    const subtypeOpts = (DEVICES.find(d=>d.id===_b.device)?.subtypes||[]).map(s=>
      `<option value="${_esc(s)}"${_b.subtype===s?' selected':''}>${_esc(s)}</option>`).join('');

    const govCheckboxes = Object.entries(GOVERNANCE_LABELS).map(([k,v]) => `
      <label class="prot-gov-check">
        <input type="checkbox" ${_b.governance.includes(k)?'checked':''} onchange="window._protGovToggle('${k}')">
        <span class="prot-gov-badge" style="color:${v.color};background:${v.bg}">${v.label}</span>
      </label>`).join('');

    const typeSection = _b.type === 'ai-personalized' ? `
      <div class="prot-b-section">
        <div class="prot-b-section-title">\uD83E\uDD16 AI Personalization Config</div>
        <label class="prot-b-lbl">JSON Config (input features, adaptations, required assessments)</label>
        <textarea class="prot-b-textarea prot-b-code" id="bp-ai" oninput="window._protBAI(this.value)">${_esc(_b.aiPersonalization)}</textarea>
      </div>` : '';

    const scanSection = _b.type === 'scan-guided' ? `
      <div class="prot-b-section">
        <div class="prot-b-section-title">\uD83D\uDD2C Scan-Guided Config</div>
        <label class="prot-b-lbl">JSON Config (primaryTarget, eegMarkers, adjustmentLogic, requiredScans)</label>
        <textarea class="prot-b-textarea prot-b-code" id="bp-scan" oninput="window._protBScan(this.value)">${_esc(_b.scanGuidedNotes)}</textarea>
      </div>` : '';

    el.innerHTML = `
      <div class="prot-builder-page">
        <div class="prot-builder-header">
          <button class="prot-back-btn" onclick="window._nav('protocol-wizard')">\u2190 Protocol Search</button>
          ${prefill ? `<span class="prot-builder-editing">Editing: ${_esc(prefill.name)}</span>` : '<span class="prot-builder-editing">New Protocol</span>'}
        </div>

        <div class="prot-builder-grid">
          <div class="prot-builder-left">

            <div class="prot-b-section">
              <div class="prot-b-section-title">Protocol Identity</div>
              <label class="prot-b-lbl">Protocol Name *</label>
              <input class="prot-b-input prot-b-input-lg" type="text" id="bp-name" placeholder="e.g. Left DLPFC HF-rTMS for MDD" value="${_esc(_b.name)}" oninput="window._protBField('name',this.value)">

              <div class="prot-b-row">
                <div>
                  <label class="prot-b-lbl">Condition *</label>
                  <select class="prot-b-input" id="bp-cond" onchange="window._protBField('conditionId',this.value)">
                    <option value="">Select condition\u2026</option>
                    ${CONDITIONS.map(c=>`<option value="${c.id}"${_b.conditionId===c.id?' selected':''}>${_esc(c.label)}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <label class="prot-b-lbl">Protocol Type *</label>
                  <select class="prot-b-input" id="bp-type" onchange="window._protBField('type',this.value)">
                    ${PROTOCOL_TYPES.map(t=>`<option value="${t.id}"${_b.type===t.id?' selected':''}>${t.icon} ${t.label}</option>`).join('')}
                  </select>
                </div>
              </div>

              <label class="prot-b-lbl">Target Brain Region</label>
              <input class="prot-b-input" type="text" id="bp-target" placeholder="e.g. Left DLPFC (F3)" value="${_esc(_b.target)}" oninput="window._protBField('target',this.value)">
            </div>

            <div class="prot-b-section">
              <div class="prot-b-section-title">Device & Parameters</div>
              <div class="prot-b-row">
                <div>
                  <label class="prot-b-lbl">Device *</label>
                  <select class="prot-b-input" onchange="window._protBField('device',this.value)">
                    ${DEVICES.map(d=>`<option value="${d.id}"${_b.device===d.id?' selected':''}>${d.icon} ${d.label}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <label class="prot-b-lbl">Subtype / Mode</label>
                  <select class="prot-b-input" onchange="window._protBField('subtype',this.value)">
                    <option value="">Select subtype\u2026</option>
                    ${subtypeOpts}
                  </select>
                </div>
              </div>
              <div class="prot-b-params-grid">
                ${_deviceParams(_b.device)}
              </div>
            </div>

            ${typeSection}
            ${scanSection}

            <div class="prot-b-section">
              <div class="prot-b-section-title">Clinical Details</div>
              <label class="prot-b-lbl">Clinical Notes</label>
              <textarea class="prot-b-textarea" id="bp-notes" oninput="window._protBField('notes',this.value)">${_esc(_b.notes)}</textarea>

              <div class="prot-b-row">
                <div>
                  <label class="prot-b-lbl">Contraindications (one per line)</label>
                  <textarea class="prot-b-textarea" id="bp-contra" oninput="window._protBField('contraindications',this.value)">${_esc(_b.contraindications)}</textarea>
                </div>
                <div>
                  <label class="prot-b-lbl">Side Effects (one per line)</label>
                  <textarea class="prot-b-textarea" id="bp-se" oninput="window._protBField('sideEffects',this.value)">${_esc(_b.sideEffects)}</textarea>
                </div>
              </div>

              <label class="prot-b-lbl">References (one per line)</label>
              <textarea class="prot-b-textarea" id="bp-refs" oninput="window._protBField('references',this.value)">${_esc(_b.references)}</textarea>

              <label class="prot-b-lbl">Tags (comma-separated)</label>
              <input class="prot-b-input" type="text" id="bp-tags" placeholder="e.g. first-line, FDA-cleared, depression" value="${_esc(_b.tags)}" oninput="window._protBField('tags',this.value)">
            </div>
          </div>

          <div class="prot-builder-right">
            <div class="prot-b-section">
              <div class="prot-b-section-title">Evidence Grade</div>
              <div class="prot-b-grade-btns">
                ${Object.entries(EVIDENCE_GRADES).map(([k,v])=>`
                  <button class="prot-grade-btn${_b.evidenceGrade===k?' prot-grade-active':''}" style="${_b.evidenceGrade===k?`background:${v.bg};color:${v.color};border-color:${v.color}`:''}" onclick="window._protBField('evidenceGrade','${k}')">${v.label}</button>`).join('')}
              </div>
              <div class="prot-grade-desc">${EVIDENCE_GRADES[_b.evidenceGrade]?.description || ''}</div>
            </div>

            <div class="prot-b-section">
              <div class="prot-b-section-title">Governance Labels</div>
              <div class="prot-gov-checks">${govCheckboxes}</div>
            </div>

            <div class="prot-b-section" id="prot-b-evidence-basis">
              <div class="prot-b-section-title" style="display:flex;align-items:center;justify-content:space-between">
                <span>Evidence Basis</span>
                ${_b.conditionId && _b.device ? '' : '<span style="font-size:10px;color:var(--text-tertiary);font-weight:400">Select condition + device to load</span>'}
              </div>
              <div id="prot-b-evidence-body" style="font-size:11.5px;color:var(--text-secondary)">
                ${_b.conditionId && _b.device ? '<div style="color:var(--text-tertiary)">Loading\u2026</div>' : '<div style="color:var(--text-tertiary)">Select a condition and device above.</div>'}
              </div>
            </div>

            <div class="prot-b-section">
              <div class="prot-b-section-title">Protocol Preview</div>
              <div class="prot-preview-card">
                <div class="prot-preview-name">${_esc(_b.name) || '<em>Enter protocol name\u2026</em>'}</div>
                <div class="prot-preview-cond">${_esc(_condLabel(_b.conditionId)) || 'No condition selected'}</div>
                <div class="prot-preview-badges">
                  ${_typeBadge(_b.type)}
                  ${_govBadges(_b.governance)}
                  ${_evidenceBadge(_b.evidenceGrade)}
                </div>
                <div class="prot-preview-params">
                  ${_b.params.frequency_hz ? `<span>${_b.params.frequency_hz}Hz</span>` : ''}
                  ${_b.params.sessions_total ? `<span>${_b.params.sessions_total} sessions</span>` : ''}
                </div>
              </div>
            </div>

            <div class="prot-b-actions">
              <button class="prot-b-save-btn" onclick="window._protBPersonalize()" style="border-color:var(--teal,#14b8a6);color:var(--teal,#14b8a6)">&#9881; Personalize</button>
              <button class="prot-b-save-btn" onclick="window._protBSave()">Save as Draft</button>
              <button class="prot-b-submit-btn" onclick="window._protBSubmit()">Submit for Review</button>
            </div>

            ${_b.saved ? '<div class="prot-b-success">\u2713 Saved to local library</div>' : ''}
            ${_b.submitted ? '<div class="prot-b-success">\u2713 Submitted for clinical review</div>' : ''}
          </div>
        </div>
      </div>`;

    // ── Evidence basis — async populate after render ──────────────────────
    // Fires only when condition + device are both selected.
    if (_b.conditionId && _b.device) {
      const evBody = document.getElementById('prot-b-evidence-body');
      if (evBody) {
        api.evidenceSuggest({ modality: _b.device, indication: _b.conditionId, limit: 5 })
          .then(data => {
            if (!evBody) return;
            const papers = data?.papers || [];
            const trials = data?.trials || [];
            if (!papers.length && !trials.length) {
              evBody.innerHTML = '<div style="color:var(--text-tertiary)">No indexed evidence for this combination yet.</div>';
              return;
            }
            const gradeLabel = data.evidence_grade ? ` \u00B7 Grade ${data.evidence_grade}` : '';
            const indLabel = data.indication_label ? `<div style="font-size:11px;color:var(--teal);margin-bottom:6px">${_esc(data.indication_label)}${gradeLabel}</div>` : '';
            const paperHtml = papers.map(p => {
              const authors = (p.authors || []).slice(0, 2).join(', ');
              const pmidLink = p.pmid ? ` <a href="https://pubmed.ncbi.nlm.nih.gov/${_esc(p.pmid)}" target="_blank" rel="noopener" style="color:var(--teal);text-decoration:none" title="View on PubMed">\u2197</a>` : '';
              const cites = p.cited_by_count ? `<span style="color:var(--text-tertiary)">${p.cited_by_count} cites</span> ` : '';
              return `<div style="padding:5px 0;border-bottom:1px solid var(--border)">
                <div style="font-weight:500;color:var(--text-primary);line-height:1.3">${_esc(p.title || '(untitled)')}${pmidLink}</div>
                <div style="color:var(--text-tertiary)">${_esc(authors)}${p.year ? ' \u00B7 ' + p.year : ''}${p.journal ? ' \u00B7 ' + _esc(p.journal) : ''}</div>
                <div>${cites}</div>
              </div>`;
            }).join('');
            const trialHtml = trials.length ? `
              <div style="margin-top:8px;font-size:11px;font-weight:600;color:var(--text-secondary)">Clinical Trials (${trials.length})</div>
              ${trials.map(t => `<div style="padding:4px 0;border-bottom:1px solid var(--border)">
                <span style="font-family:var(--font-mono);color:var(--teal);font-size:11px">${_esc(t.nct_id)}</span>
                <span style="color:var(--text-secondary);margin-left:6px">${_esc(t.title || '')}</span>
                ${t.phase ? `<span style="color:var(--text-tertiary);margin-left:6px">${_esc(t.phase)}</span>` : ''}
              </div>`).join('')}` : '';
            evBody.innerHTML = `
              <details open>
                <summary style="cursor:pointer;font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:6px">
                  Evidence basis (${papers.length + trials.length})
                </summary>
                ${indLabel}
                ${paperHtml}
                ${trialHtml}
              </details>`;
          })
          .catch(() => {
            const b = document.getElementById('prot-b-evidence-body');
            if (b) b.innerHTML = '<div style="color:var(--text-tertiary)">Evidence DB offline or not ingested yet.</div>';
          });
      }
    }
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  window._protBField = (k, v) => { _b[k] = v; renderBuilder(); };
  window._protBParam = (k, v) => { _b.params[k] = v === '' ? null : isNaN(v) ? v : parseFloat(v); };
  window._protBAI   = v => { _b.aiPersonalization = v; };
  window._protBScan = v => { _b.scanGuidedNotes = v; };
  window._protGovToggle = g => _govToggle(g);

  // ── Personalize from builder ───────────────────────────────────────────────
  bindPersonalizationActions();
  window._protBPersonalize = () => {
    if (!_b.name || !_b.conditionId || !_b.device) {
      window._showNotifToast?.({ title: 'Required', body: 'Set protocol name, condition and device before personalizing.', severity: 'warn' });
      return;
    }
    // Build a draft object that mirrors PROTOCOL_LIBRARY shape
    const draft = {
      id: 'builder-draft',
      name: _b.name,
      conditionId: _b.conditionId,
      device: _b.device,
      subtype: _b.subtype,
      target: _b.target,
      parameters: { ..._b.params },
      evidenceGrade: _b.evidenceGrade,
      governance: [..._b.governance],
      contraindications: _b.contraindications.split('\n').filter(Boolean),
      type: _b.type,
    };
    window._pwizState = null;
    const html = renderPersonalizationWizard(draft, {});
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host.firstElementChild);
  };

  // Builder drafts persist locally by default. When a patient context has been
  // stashed by pgPatients / rx flow (window._builderPatientId), the draft is
  // also POSTed to /api/v1/protocols/saved so it lands in the backend review
  // queue. Payload matches SavedProtocolCreate in protocols_saved_router.py.
  function _buildCustomRecord(governanceState) {
    return {
      id: 'custom-' + Date.now(), conditionId: _b.conditionId, type: _b.type, device: _b.device,
      subtype: _b.subtype, name: _b.name, target: _b.target, parameters: { ..._b.params },
      evidenceGrade: _b.evidenceGrade, governance: [..._b.governance],
      notes: _b.notes,
      contraindications: _b.contraindications.split('\n').filter(Boolean),
      sideEffects: _b.sideEffects.split('\n').filter(Boolean),
      references: _b.references.split('\n').filter(Boolean),
      tags: _b.tags.split(',').map(s=>s.trim()).filter(Boolean),
      aiPersonalization: _b.aiPersonalization ? (() => { try { return JSON.parse(_b.aiPersonalization); } catch { return null; } })() : null,
      scanGuidedNotes: _b.scanGuidedNotes ? (() => { try { return JSON.parse(_b.scanGuidedNotes); } catch { return null; } })() : null,
      savedAt: new Date().toISOString(),
      governance_state: governanceState,
    };
  }

  async function _pushCustomToBackend(custom, governanceState) {
    const patientId = window._builderPatientId || null;
    if (!patientId) return { pushed: false, reason: 'no-patient-context' };
    try {
      await api.saveProtocol({
        patient_id: patientId,
        name: custom.name,
        condition: custom.conditionId,
        modality: custom.device || 'tms',
        device_slug: custom.device || null,
        parameters_json: {
          subtype: custom.subtype,
          target: custom.target,
          evidenceGrade: custom.evidenceGrade,
          type: custom.type,
          parameters: custom.parameters,
          aiPersonalization: custom.aiPersonalization,
          scanGuidedNotes: custom.scanGuidedNotes,
          contraindications: custom.contraindications,
          sideEffects: custom.sideEffects,
          tags: custom.tags,
        },
        evidence_refs: custom.references || [],
        governance_state: governanceState,
        clinician_notes: custom.notes || null,
      });
      return { pushed: true };
    } catch (e) {
      return { pushed: false, reason: e?.message || 'endpoint-error' };
    }
  }

  window._protBSave = async () => {
    if (!_b.name || !_b.conditionId) {
      window._showNotifToast?.({ title:'Required', body:'Protocol name and condition required.', severity:'warn' }); return;
    }
    const custom = _buildCustomRecord('draft');
    const saved = JSON.parse(localStorage.getItem('ds_custom_protocols') || '[]');
    saved.push(custom);
    localStorage.setItem('ds_custom_protocols', JSON.stringify(saved));
    const backend = await _pushCustomToBackend(custom, 'draft');
    _b.saved = true;
    renderBuilder();
    const suffix = backend.pushed ? ' (synced to backend)' : ' (local-only — attach a patient to sync)';
    window._showNotifToast?.({ title:'Saved', body:`"${_b.name}" saved to protocol library${suffix}.`, severity:'success' });
  };

  window._protBSubmit = async () => {
    if (!_b.name || !_b.conditionId) {
      window._showNotifToast?.({ title:'Required', body:'Complete required fields before submitting.', severity:'warn' }); return;
    }
    const custom = _buildCustomRecord('submitted');
    const saved = JSON.parse(localStorage.getItem('ds_custom_protocols') || '[]');
    saved.push(custom);
    localStorage.setItem('ds_custom_protocols', JSON.stringify(saved));
    const backend = await _pushCustomToBackend(custom, 'submitted');
    _b.submitted = true;
    _b.saved = false;
    renderBuilder();
    const body = backend.pushed
      ? `"${_b.name}" submitted to backend review queue. Review status remains unchanged until a clinician records it.`
      : `"${_b.name}" saved locally. Attach a patient and resubmit to route to review. Review status remains unchanged.`;
    window._showNotifToast?.({ title:'Submitted for Review', body, severity:'success' });
  };

  renderBuilder();
}
