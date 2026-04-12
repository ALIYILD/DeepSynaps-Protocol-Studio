// ─────────────────────────────────────────────────────────────────────────────
// pages-protocols.js — Protocol Intelligence Pages
// pgProtocolSearch · pgProtocolDetail · pgProtocolBuilderV2
// ─────────────────────────────────────────────────────────────────────────────
import {
  CONDITIONS, DEVICES, PROTOCOL_TYPES, GOVERNANCE_LABELS, EVIDENCE_GRADES,
  PROTOCOL_LIBRARY, searchProtocols, getProtocolsByCondition, getCondition, getDevice,
} from './protocols-data.js';

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

// ── Window state for cross-page navigation ────────────────────────────────────
window._protDetailId = window._protDetailId || null;
window._protFromCondition = window._protFromCondition || null;

// =============================================================================
// pgProtocolSearch — Browse, filter, and launch all protocols
// =============================================================================
export async function pgProtocolSearch(setTopbar, navigate) {
  setTopbar({ title: 'Protocol Intelligence', subtitle: 'Browse · search · compare clinical protocols across all conditions and devices' });

  const el = document.getElementById('main-content');
  if (!el) return;
  el.innerHTML = '<div class="prot-loading">Loading protocol library\u2026</div>';

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
  };

  // ── Category list ─────────────────────────────────────────────────────────
  const categories = [...new Set(CONDITIONS.map(c => c.category))];

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalProtocols = PROTOCOL_LIBRARY.length;
  const totalConditions = CONDITIONS.length;
  const onLabelCount = PROTOCOL_LIBRARY.filter(p => (p.governance||[]).includes('on-label')).length;
  const aiCount = PROTOCOL_LIBRARY.filter(p => p.type === 'ai-personalized').length;
  const gradeACount = PROTOCOL_LIBRARY.filter(p => p.evidenceGrade === 'A').length;

  // ── Render ────────────────────────────────────────────────────────────────
  const renderPage = () => {
    const results = searchProtocols(_state.query, {
      conditionId: _state.conditionId || undefined,
      device: _state.device || undefined,
      type: _state.type || undefined,
      evidenceGrade: _state.evidenceGrade || undefined,
      governance: _state.governance || undefined,
    });

    const summaryStrip = `
      <div class="prot-summary-strip">
        <div class="prot-chip"><span class="prot-chip-val">${totalProtocols}</span><span class="prot-chip-lbl">Protocols</span></div>
        <div class="prot-chip"><span class="prot-chip-val">${totalConditions}</span><span class="prot-chip-lbl">Conditions</span></div>
        <div class="prot-chip prot-chip-green"><span class="prot-chip-val">${gradeACount}</span><span class="prot-chip-lbl">Grade A</span></div>
        <div class="prot-chip prot-chip-blue"><span class="prot-chip-val">${onLabelCount}</span><span class="prot-chip-lbl">On-Label</span></div>
        <div class="prot-chip prot-chip-purple"><span class="prot-chip-val">${aiCount}</span><span class="prot-chip-lbl">AI-Personalized</span></div>
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
            return `<div class="prot-cond-group">
              <div class="prot-cond-header">
                <span class="prot-cond-label">${_esc(cond.label)}</span>
                <span class="prot-cond-meta">${_esc(cond.icd10)} \u00B7 ${condProtos.length} protocol${condProtos.length!==1?'s':''}</span>
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
            ${filterBar}
            ${mainContent}
          </div>
        </div>
      </div>`;
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
  window._protClearFilters = () => { _state = { query:'', conditionId:'', device:'', type:'', evidenceGrade:'', governance:'', view:'grid', category:'' }; renderPage(); };

  window._protOpenDetail = id => {
    window._protDetailId = id;
    window._nav('protocol-detail');
  };

  window._protUseProtocol = id => {
    window._protDetailId = id;
    const proto = PROTOCOL_LIBRARY.find(p => p.id === id);
    if (proto) {
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
  const el = document.getElementById('main-content');
  if (!el) return;

  const id = window._protDetailId;
  const proto = PROTOCOL_LIBRARY.find(p => p.id === id);

  if (!proto) {
    el.innerHTML = '<div class="prot-empty">Protocol not found. <button class="prot-use-btn" onclick="window._nav(\'protocol-wizard\')">Back to Search</button></div>';
    return;
  }

  const cond = getCondition(proto.conditionId);
  const dev = getDevice(proto.device);
  setTopbar({ title: proto.name, subtitle: `${cond?.label || proto.conditionId} \u00B7 ${dev?.label || proto.device}` });

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

          ${proto.tags?.length ? `
          <div class="prot-detail-card">
            <div class="prot-detail-card-title">Tags</div>
            <div class="prot-tags">${(proto.tags||[]).map(t=>`<span class="prot-tag">${_esc(t)}</span>`).join('')}</div>
          </div>` : ''}

          ${relatedSection}
        </div>
      </div>
    </div>`;

  window._protEditProtocol = id => {
    window._protDetailId = id;
    window._nav('protocol-builder');
  };
}

// =============================================================================
// pgProtocolBuilderV2 — Enhanced protocol builder with 5 types + governance
// =============================================================================
export async function pgProtocolBuilderV2(setTopbar, navigate) {
  setTopbar({ title: 'Protocol Builder', subtitle: 'Create · configure · submit for governance review' });

  const el = document.getElementById('main-content');
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
              <button class="prot-b-save-btn" onclick="window._protBSave()">Save as Draft</button>
              <button class="prot-b-submit-btn" onclick="window._protBSubmit()">Submit for Review</button>
            </div>

            ${_b.saved ? '<div class="prot-b-success">\u2713 Saved to local library</div>' : ''}
            ${_b.submitted ? '<div class="prot-b-success">\u2713 Submitted for clinical review</div>' : ''}
          </div>
        </div>
      </div>`;
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  window._protBField = (k, v) => { _b[k] = v; renderBuilder(); };
  window._protBParam = (k, v) => { _b.params[k] = v === '' ? null : isNaN(v) ? v : parseFloat(v); };
  window._protBAI   = v => { _b.aiPersonalization = v; };
  window._protBScan = v => { _b.scanGuidedNotes = v; };
  window._protGovToggle = g => _govToggle(g);

  window._protBSave = () => {
    if (!_b.name || !_b.conditionId) {
      window._showNotifToast?.({ title:'Required', body:'Protocol name and condition required.', severity:'warn' }); return;
    }
    const saved = JSON.parse(localStorage.getItem('ds_custom_protocols') || '[]');
    const custom = {
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
    };
    saved.push(custom);
    localStorage.setItem('ds_custom_protocols', JSON.stringify(saved));
    _b.saved = true;
    renderBuilder();
    window._showNotifToast?.({ title:'Saved', body:`"${_b.name}" saved to local protocol library.`, severity:'success' });
  };

  window._protBSubmit = () => {
    if (!_b.name || !_b.conditionId) {
      window._showNotifToast?.({ title:'Required', body:'Complete required fields before submitting.', severity:'warn' }); return;
    }
    const gov = [..._b.governance];
    if (!gov.includes('reviewed')) gov.push('reviewed');
    _b.governance = gov;
    _b.submitted = true;
    _b.saved = false;
    window._protBSave();
    window._showNotifToast?.({ title:'Submitted for Review', body:`"${_b.name}" queued for clinical governance review.`, severity:'success' });
  };

  renderBuilder();
}
