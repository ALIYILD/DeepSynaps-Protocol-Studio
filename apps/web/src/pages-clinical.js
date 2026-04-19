import { api, downloadBlob } from './api.js';
import { cardWrap, fr, evBar, pillSt, initials, tag, spinner, emptyState, spark, brainMapSVG, evidenceBadge, labelBadge, approvalBadge, safetyBadge, govFlag } from './helpers.js';
import { currentUser } from './auth.js';
import { FALLBACK_CONDITIONS, FALLBACK_MODALITIES, FALLBACK_ASSESSMENT_TEMPLATES, COURSE_STATUS_COLORS } from './constants.js';
import { renderHomeTherapyTab, bindHomeTherapyActions } from './pages-home-therapy.js';
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
  resolveScaleCanonical,
  getScaleMeta,
  enumerateBundleScales,
} from './registries/scale-assessment-registry.js';
import {
  getAssessmentImplementationStatus,
  findAssessInstrumentRow,
  formatScaleWithImplementationBadgeHtml,
  partitionScalesByImplementationTruth,
  checklistImplementationReport,
  getLegacyRunScoreEntryNoticeHtml,
  getLegacyRunAssessmentMode,
  formatLegacyRunImplementationBadgeHtml,
  routeLegacyRunAssessment,
} from './registries/assessment-implementation-status.js';
import { ASSESS_REGISTRY, ASSESS_TEMPLATES } from './registries/assess-instruments-registry.js';
import { validateScaleRegistryAgainstAssess } from './registries/scale-registry-alignment.js';
import {
  toPersistedPersonalizationExplainability,
  computeWizardDraftFingerprint,
  shouldAttachPersonalizationExplainability,
} from './personalization-explainability.js';

if (import.meta.env?.DEV) {
  const { errors } = validateScaleRegistryAgainstAssess(ASSESS_REGISTRY);
  errors.forEach(e => console.warn('[assess alignment]', e));
  const rep = checklistImplementationReport(ASSESS_REGISTRY);
  if (rep.missingForm.length) {
    console.warn('[assess implementation] SCALE_REGISTRY in-app checklists missing ASSESS inline form:', rep.missingForm.join(', '));
  }
  if (rep.inlineButNotDeclared.length) {
    console.warn('[assess implementation] ASSESS inline UI without item_checklist + supported_in_app:', rep.inlineButNotDeclared.join(', '));
  }
}

// ── Shared state for patient profile ────────────────────────────────────────
export let ptab = 'courses';
export let eegBand = 'alpha';
export let proStep = 0;
export let selMods = ['tDCS'];
export let proType = 'evidence';
export let selPatIdx = null;
export let aiResult = null;
export let aiLoading = false;
export let savedProto = null;
export let selectedPatient = null;

export function setPtab(v) { ptab = v; }
export function setEegBand(v) { eegBand = v; }
export function setProStep(v) { proStep = v; }
export function setSelMods(v) { selMods = v; }
export function setProType(v) { proType = v; }
export function setSelPatIdx(v) { selPatIdx = v; }
export function setAiResult(v) { aiResult = v; }
export function setAiLoading(v) { aiLoading = v; }
export function setSavedProto(v) { savedProto = v; }
export function setSelectedPatient(v) { selectedPatient = v; }

// ── Protocol version history store ──────────────────────────────────────────
const _protoVersions = {}; // key: "patientId:condition", value: array of version objects

function _saveProtoVersion(patientId, condition, draft, params) {
  const key = `${patientId}:${condition}`;
  if (!_protoVersions[key]) _protoVersions[key] = [];
  _protoVersions[key].unshift({
    version: _protoVersions[key].length + 1,
    timestamp: new Date().toISOString(),
    draft,
    params: JSON.parse(JSON.stringify(params || {})),
    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2),
  });
  if (_protoVersions[key].length > 10) _protoVersions[key].pop();
}

function _getProtoVersions(patientId, condition) {
  return _protoVersions[`${patientId}:${condition}`] || [];
}

function _relativeTime(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(isoStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function _findVersionById(id) {
  for (const key of Object.keys(_protoVersions)) {
    const found = _protoVersions[key].find(v => v.id === id);
    if (found) return { version: found, key };
  }
  return null;
}

// ── Shared assign-modal helpers ──────────────────────────────────────────────

function _dsToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `ds-toast ds-toast--${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

window._dsShowAssignModal = function(config) {
  const { templateName = '', templateId = '', onAssign } = config || {};

  // Build overlay
  const overlay = document.createElement('div');
  overlay.className = 'ds-assign-modal-overlay';

  overlay.innerHTML = `
    <div class="ds-assign-modal" role="dialog" aria-modal="true" aria-label="Assign to patient">
      <div class="ds-assign-modal-header">
        <span class="ds-assign-modal-title">Assign &ldquo;${templateName}&rdquo; to Patient</span>
        <button class="ds-assign-modal-close" aria-label="Close">&times;</button>
      </div>
      <input class="ds-assign-search" type="text" placeholder="Search patients\u2026" autocomplete="off" />
      <div class="ds-assign-list"><div class="ds-assign-spinner">Loading patients\u2026</div></div>
      <div class="ds-assign-footer">
        <button class="ds-assign-btn-cancel">Cancel</button>
        <button class="ds-assign-btn-primary" disabled>Assign to Selected &rarr;</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const panel    = overlay.querySelector('.ds-assign-modal');
  const closeBtn = overlay.querySelector('.ds-assign-modal-close');
  const search   = overlay.querySelector('.ds-assign-search');
  const list     = overlay.querySelector('.ds-assign-list');
  const cancelBtn= overlay.querySelector('.ds-assign-btn-cancel');
  const assignBtn= overlay.querySelector('.ds-assign-btn-primary');

  let allPatients = [];
  let selectedId  = null;
  let selectedName= null;

  function close() { overlay.remove(); }

  // Close on overlay background click (not panel click)
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);

  // Render patient rows
  function renderList(patients) {
    if (!patients.length) {
      list.innerHTML = '<div class="ds-assign-empty">No patients found.</div>';
      return;
    }
    list.innerHTML = patients.map(p => {
      const parts = (p.name || 'Patient').split(' ');
      const av = (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
      const isSel = p.id === selectedId;
      return `<div class="ds-assign-pat-row${isSel ? ' selected' : ''}" data-id="${p.id}" data-name="${(p.name||'').replace(/"/g,'&quot;')}">
        <div class="ds-assign-avatar">${av.toUpperCase()}</div>
        <div class="ds-assign-pat-info">
          <div class="ds-assign-pat-name">${p.name || 'Patient'}</div>
          ${p.condition ? `<div class="ds-assign-pat-cond">${p.condition}</div>` : ''}
        </div>
      </div>`;
    }).join('');

    list.querySelectorAll('.ds-assign-pat-row').forEach(row => {
      row.addEventListener('click', () => {
        selectedId   = row.dataset.id;
        selectedName = row.dataset.name;
        assignBtn.disabled = false;
        list.querySelectorAll('.ds-assign-pat-row').forEach(r => r.classList.toggle('selected', r === row));
      });
    });
  }

  function filterAndRender() {
    const q = search.value.trim().toLowerCase();
    const filtered = q
      ? allPatients.filter(p => (p.name||'').toLowerCase().includes(q) || (p.condition||'').toLowerCase().includes(q))
      : allPatients;
    renderList(filtered);
  }

  search.addEventListener('input', filterAndRender);

  // Load patients from cache or API
  async function loadPatients() {
    if (Array.isArray(window._patientRoster) && window._patientRoster.length) {
      allPatients = window._patientRoster;
      renderList(allPatients);
      return;
    }
    try {
      const res = await api.listPatients({ limit: 100 });
      const items = res?.items || res || [];
      allPatients = items.map(p => ({
        id: p.id,
        name: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.display_name || 'Patient',
        condition: p.primary_condition || p.condition || '',
      }));
    } catch {
      allPatients = [];
    }
    renderList(allPatients);
  }

  loadPatients();

  // Assign button
  assignBtn.addEventListener('click', async () => {
    if (!selectedId) return;
    assignBtn.disabled = true;
    assignBtn.textContent = 'Assigning\u2026';
    try {
      if (typeof onAssign === 'function') await onAssign(selectedId, selectedName);
    } catch (err) {
      _dsToast('Assignment failed. Please try again.', 'error');
    } finally {
      close();
    }
  });

  // Focus search
  setTimeout(() => search.focus(), 50);
};

// Active diff state
let _diffState = { versionId: null, diffMode: false };

function _wordDiff(oldText, newText) {
  const oldTokens = (oldText || '').split(/\s+/).filter(Boolean);
  const newTokens = (newText || '').split(/\s+/).filter(Boolean);
  const oldMatched = new Set();
  const newMatched = new Set();
  for (let i = 0; i < newTokens.length; i++) {
    const start = Math.max(0, i - 5);
    const end = Math.min(oldTokens.length, i + 6);
    for (let j = start; j < end; j++) {
      if (!oldMatched.has(j) && oldTokens[j] === newTokens[i]) {
        newMatched.add(i);
        oldMatched.add(j);
        break;
      }
    }
  }
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let leftHtml = '';
  let rightHtml = '';
  oldTokens.forEach((w, i) => {
    leftHtml += oldMatched.has(i) ? esc(w) + ' ' : `<span class="diff-remove">${esc(w)}</span> `;
  });
  newTokens.forEach((w, i) => {
    rightHtml += newMatched.has(i) ? esc(w) + ' ' : `<span class="diff-add">${esc(w)}</span> `;
  });
  return { leftHtml, rightHtml };
}

function _injectVersionStyles() {
  if (document.getElementById('proto-version-styles')) return;
  const style = document.createElement('style');
  style.id = 'proto-version-styles';
  style.textContent = `
    .side-panel{position:fixed;top:0;right:0;width:420px;height:100vh;background:var(--surface-2);border-left:1px solid var(--border);z-index:300;display:flex;flex-direction:column;box-shadow:-8px 0 32px rgba(0,0,0,.4);animation:slideInRight .2s ease;overflow:hidden}
    .side-panel-header{padding:20px 24px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center}
    .side-panel-body{flex:1;overflow-y:auto;padding:16px}
    @keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}
    .version-item{padding:14px;border:1px solid var(--border);border-radius:10px;margin-bottom:10px;background:var(--surface-1)}
    .version-item:hover{border-color:var(--teal-400)}
    .overlay-fullscreen{position:fixed;inset:0;background:var(--navy-900);z-index:400;display:flex;flex-direction:column}
    .overlay-header{padding:16px 24px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
    .diff-container{flex:1;overflow:auto;padding:24px}
    .diff-side-by-side{display:grid;grid-template-columns:1fr 1fr;gap:16px;min-height:100%}
    .diff-panel{background:var(--surface-1);border:1px solid var(--border);border-radius:10px;padding:16px;overflow:auto;font-family:'DM Mono',monospace;font-size:.8rem;line-height:1.7;white-space:pre-wrap}
    .diff-add{background:rgba(0,212,188,.2);border-radius:2px}
    .diff-remove{background:rgba(255,107,107,.2);text-decoration:line-through;opacity:.7;border-radius:2px}
    .diff-panel-label{font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--text-tertiary);margin-bottom:8px}
    @keyframes fadeInUp{from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
  `;
  document.head.appendChild(style);
}

window._showProtoVersions = function() {
  _injectVersionStyles();
  const ws = wizState();
  const versions = _getProtoVersions(ws.patientId || '', ws.conditionSlug || '');
  const existing = document.getElementById('proto-version-panel');
  if (existing) existing.remove();
  const panel = document.createElement('div');
  panel.id = 'proto-version-panel';
  panel.className = 'side-panel';
  const esc = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  panel.innerHTML = `
    <div class="side-panel-header">
      <h3 style="margin:0;font-size:15px">Version History</h3>
      <button class="btn btn-ghost btn-sm" onclick="document.getElementById('proto-version-panel').remove()">&#x2715;</button>
    </div>
    <div class="side-panel-body">
      ${versions.length === 0
        ? '<div style="color:var(--text-tertiary);font-size:13px;padding:12px 0">No previous versions.</div>'
        : versions.map(v => `
          <div class="version-item">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span style="font-size:12.5px;font-weight:700;color:var(--teal-400)">v${v.version}</span>
              <span style="font-size:11px;color:var(--text-tertiary)">${_relativeTime(v.timestamp)}</span>
            </div>
            <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5;margin-bottom:10px;font-family:'DM Mono',monospace;word-break:break-word">${esc((v.draft || '').slice(0,120))}${v.draft && v.draft.length > 120 ? '&hellip;' : ''}</div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-sm" onclick="window._viewProtoVersion('${v.id}')">&#x1F441; View</button>
              <button class="btn btn-sm" style="border-color:var(--teal-400);color:var(--teal-400)" onclick="window._restoreProtoVersion('${v.id}')">&#x21A9; Restore</button>
            </div>
          </div>`).join('')}
      <div style="font-size:10.5px;color:var(--text-tertiary);margin-top:8px;text-align:center">Version history is session-only &mdash; persistence planned.</div>
    </div>
  `;
  (document.getElementById('proto-version-panel-mount') || document.getElementById('content') || document.body).appendChild(panel);
};

window._viewProtoVersion = function(id) {
  _injectVersionStyles();
  const found = _findVersionById(id);
  if (!found) return;
  const v = found.version;
  _diffState.versionId = id;
  _diffState.diffMode = false;
  const existing = document.getElementById('proto-diff-overlay');
  if (existing) existing.remove();
  const esc = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const overlay = document.createElement('div');
  overlay.id = 'proto-diff-overlay';
  overlay.className = 'overlay-fullscreen';
  overlay.innerHTML = `
    <div class="overlay-header">
      <h3 style="margin:0;font-size:15px">Protocol v${v.version} <span style="font-size:11px;font-weight:400;color:var(--text-tertiary);margin-left:8px">${_relativeTime(v.timestamp)}</span></h3>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-sm" id="diff-toggle-btn" onclick="window._toggleDiffMode()">&#x21C4; Toggle Diff</button>
        <button class="btn btn-primary btn-sm" onclick="window._restoreProtoVersion('${v.id}')">&#x21A9; Restore This Version</button>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('proto-diff-overlay').remove()">&#x2715;</button>
      </div>
    </div>
    <div id="diff-content" class="diff-container">
      <pre style="background:var(--surface-1);border:1px solid var(--border);border-radius:10px;padding:20px;font-family:'DM Mono',monospace;font-size:.8rem;line-height:1.7;white-space:pre-wrap;margin:0">${esc(v.draft) || '(no draft text)'}</pre>
    </div>
  `;
  (document.getElementById('content') || document.body).appendChild(overlay);
};

window._toggleDiffMode = function() {
  const id = _diffState.versionId;
  if (!id) return;
  const found = _findVersionById(id);
  if (!found) return;
  const v = found.version;
  _diffState.diffMode = !_diffState.diffMode;
  const btn = document.getElementById('diff-toggle-btn');
  if (btn) btn.textContent = _diffState.diffMode ? '\u21C4 Single View' : '\u21C4 Toggle Diff';
  const ws = wizState();
  const currentDraft = ws.generatedProtocol
    ? (ws.generatedProtocol.protocol || ws.generatedProtocol.draft || JSON.stringify(ws.generatedProtocol))
    : '';
  const oldDraft = v.draft || '';
  const container = document.getElementById('diff-content');
  if (!container) return;
  const esc = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  if (!_diffState.diffMode) {
    container.innerHTML = `<pre style="background:var(--surface-1);border:1px solid var(--border);border-radius:10px;padding:20px;font-family:'DM Mono',monospace;font-size:.8rem;line-height:1.7;white-space:pre-wrap;margin:0">${esc(oldDraft) || '(no draft text)'}</pre>`;
  } else {
    const { leftHtml, rightHtml } = _wordDiff(oldDraft, currentDraft);
    container.innerHTML = `
      <div class="diff-side-by-side">
        <div>
          <div class="diff-panel-label">v${v.version} &mdash; this version</div>
          <div class="diff-panel">${leftHtml || esc(oldDraft)}</div>
        </div>
        <div>
          <div class="diff-panel-label">Current / Latest</div>
          <div class="diff-panel">${rightHtml || '<span style="color:var(--text-tertiary)">(no current draft)</span>'}</div>
        </div>
      </div>`;
  }
};

window._restoreProtoVersion = function(id) {
  const found = _findVersionById(id);
  if (!found) return;
  const v = found.version;
  if (!confirm(`Restore version v${v.version} (${_relativeTime(v.timestamp)})?\nThe current draft will be replaced. You can save it as a new version.`)) return;
  const overlay = document.getElementById('proto-diff-overlay');
  if (overlay) overlay.remove();
  const panel = document.getElementById('proto-version-panel');
  if (panel) panel.remove();
  const ws = wizState();
  if (!ws.generatedProtocol) ws.generatedProtocol = {};
  ws.generatedProtocol.protocol = v.draft;
  ws.generatedProtocol.draft = v.draft;
  ws.step = 3;
  ws._step4Html = null;
  renderWizPage();
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--teal-500,#0ad4bc);color:#000;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:600;z-index:500;box-shadow:0 4px 16px rgba(0,0,0,.4);animation:fadeInUp .25s ease';
  toast.textContent = 'Version restored \u2014 review and save as new version';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
  document.getElementById('wiz-body')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ── Dashboard local helpers ──────────────────────────────────────────────────

function _emptyState(icon, headline, subtext, actionLabel, actionFn) {
  return `<div class="ds-empty-state">
    <div class="ds-empty-state-icon">${icon}</div>
    <div class="ds-empty-state-headline">${headline}</div>
    <div class="ds-empty-state-subtext">${subtext}</div>
    ${actionLabel ? `<button class="btn btn-ghost btn-sm" onclick="${actionFn}">${actionLabel}</button>` : ''}
  </div>`;
}

function _dStatCard(label, value, sub, color, navId, alert = false) {
  const leftBorder = alert ? `border-left:3px solid ${color};padding-left:13px;` : '';
  return `<div class="metric-card" style="cursor:pointer;min-height:88px;${leftBorder}"
      onclick="window._nav('${navId}')"
      onmouseover="this.style.borderColor='${alert ? color : 'var(--border-teal)'}'"
      onmouseout="this.style.borderColor='${alert ? color : 'var(--border)'}'">
    <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.9px;margin-bottom:8px">${label}</div>
    <div style="font-size:30px;font-weight:700;color:${color};font-family:var(--font-mono);line-height:1;margin-bottom:6px">${value}</div>
    <div style="font-size:11px;color:var(--text-secondary)">${sub}</div>
  </div>`;
}

function _dQueueSection(title, rows) {
  if (!rows.length) return '';
  return `<div>
    <div style="padding:7px 16px 3px;background:rgba(255,255,255,0.02);border-top:1px solid var(--border);border-bottom:1px solid var(--border)">
      <span style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;font-weight:600;color:var(--text-tertiary)">${title}</span>
    </div>
    ${rows.join('')}
  </div>`;
}

function _dCourseRow(c, statusKey) {
  const dotColor = { active:'var(--teal)', pending_approval:'var(--amber)', paused:'var(--amber)', approved:'var(--blue)' }[statusKey] || 'var(--text-tertiary)';
  const pct = c.planned_sessions_total > 0 ? Math.min(100, Math.round((c.sessions_delivered||0) / c.planned_sessions_total * 100)) : 0;
  const btn = statusKey === 'active'
    ? `<button class="btn btn-sm" style="font-size:10.5px;padding:3px 8px;flex-shrink:0" onclick="event.stopPropagation();window._nav('session-execution')">Execute →</button>`
    : statusKey === 'pending_approval'
    ? `<button class="btn btn-sm" style="font-size:10.5px;padding:3px 8px;flex-shrink:0;color:var(--amber)" onclick="event.stopPropagation();window._nav('review-queue')">Review →</button>`
    : statusKey === 'paused'
    ? `<span style="font-size:10px;color:var(--amber);flex-shrink:0">Paused</span>`
    : '';
  return `<div style="display:flex;align-items:center;gap:10px;padding:9px 16px;border-bottom:1px solid var(--border);cursor:pointer"
      onclick="window._openCourse('${c.id}')"
      onmouseover="this.style.background='var(--bg-card-hover)'"
      onmouseout="this.style.background=''">
    <div style="width:6px;height:6px;border-radius:50%;background:${dotColor};flex-shrink:0;margin-top:1px"></div>
    <div style="flex:1;min-width:0">
      <div style="font-size:12.5px;font-weight:500;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
        ${c.condition_slug?.replace(/-/g,' ') || '—'} · <span style="color:var(--teal)">${c.modality_slug || '—'}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:3px">
        <div style="width:56px;height:3px;border-radius:2px;background:var(--border);flex-shrink:0">
          <div style="height:3px;border-radius:2px;background:${dotColor};width:${pct}%"></div>
        </div>
        <span style="font-size:10.5px;color:var(--text-tertiary)">${c.sessions_delivered||0}/${c.planned_sessions_total||'?'} sessions</span>
        ${(c.governance_warnings||[]).length ? '<span style="font-size:10px;color:var(--red)">⚠ flagged</span>' : ''}
        ${c.on_label === false ? '<span style="font-size:10px;color:var(--amber)">off-label</span>' : ''}
      </div>
    </div>
    ${btn}
  </div>`;
}

function _dGovSection(title, count, body, accentColor) {
  const badge = count > 0
    ? `<span style="font-size:11px;font-weight:700;color:${accentColor};font-family:var(--font-mono);padding:1px 7px;border-radius:4px;background:${accentColor}18">${count}</span>`
    : `<span style="font-size:10.5px;color:var(--green)">✓</span>`;
  return `<div style="border-top:1px solid var(--border)">
    <div style="padding:8px 16px 4px;display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.015)">
      <span style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;font-weight:600;color:var(--text-tertiary);flex:1">${title}</span>
      ${badge}
    </div>
    ${body}
  </div>`;
}

function _dGovRow(primary, secondary, typeKey, onclickExpr) {
  const tc = {
    pending:   { c:'var(--amber)', bg:'rgba(255,181,71,0.06)',   label:'Pending' },
    'off-label':{ c:'var(--amber)', bg:'rgba(255,181,71,0.06)',  label:'Off-label' },
    moderate:  { c:'var(--amber)', bg:'rgba(255,181,71,0.06)',   label:'Moderate' },
    serious:   { c:'var(--red)',   bg:'rgba(255,107,107,0.06)',  label:'Serious' },
    severe:    { c:'var(--red)',   bg:'rgba(255,107,107,0.06)',  label:'Severe' },
    mild:      { c:'var(--blue)',  bg:'rgba(74,158,255,0.06)',   label:'Mild' },
    open:      { c:'var(--amber)', bg:'rgba(255,181,71,0.06)',   label:'Open' },
  }[typeKey] || { c:'var(--text-tertiary)', bg:'', label: typeKey };
  return `<div style="display:flex;align-items:center;gap:8px;padding:7px 16px;border-bottom:1px solid var(--border);cursor:pointer"
      onclick="${onclickExpr}"
      onmouseover="this.style.background='${tc.bg}'"
      onmouseout="this.style.background=''">
    <div style="flex:1;min-width:0;overflow:hidden">
      <span style="font-size:12px;font-weight:500;color:var(--text-primary)">${primary}</span>
      <span style="font-size:11px;color:var(--text-secondary);margin-left:7px">${secondary}</span>
    </div>
    <span style="font-size:9.5px;font-weight:600;padding:2px 6px;border-radius:3px;background:${tc.bg};color:${tc.c};flex-shrink:0;white-space:nowrap">${tc.label}</span>
  </div>`;
}

function _dNoItems(msg) {
  return `<div style="padding:8px 16px 10px;font-size:11.5px;color:var(--text-tertiary);font-style:italic">${msg}</div>`;
}

function _dOutcomeCell(label, value, color, sub, nav) {
  const clickable = nav ? `cursor:pointer` : '';
  const onclick   = nav ? `onclick="window._nav('${nav}')"
      onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''"` : '';
  return `<div style="padding:12px 14px;border-bottom:1px solid var(--border);border-right:1px solid var(--border);${clickable}" ${onclick}>
    <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;color:var(--text-tertiary);font-weight:600;margin-bottom:5px">${label}${nav ? ' <span style="font-size:9px;opacity:.5">→</span>' : ''}</div>
    <div style="font-size:22px;font-weight:700;color:${color};font-family:var(--font-mono);line-height:1;margin-bottom:4px">${value}</div>
    <div style="font-size:10.5px;color:var(--text-secondary)">${sub}</div>
  </div>`;
}

function _dMiniBar(label, value, total, color) {
  const pct = total > 0 ? Math.round(value / total * 100) : 0;
  return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">
    <span style="font-size:11px;color:var(--text-secondary);width:64px;flex-shrink:0">${label}</span>
    <div style="flex:1;height:4px;border-radius:2px;background:var(--border)">
      <div style="height:4px;border-radius:2px;background:${color};width:${pct}%;transition:width .3s"></div>
    </div>
    <span style="font-size:11px;color:${color};font-weight:600;width:24px;text-align:right;font-family:var(--font-mono)">${value}</span>
  </div>`;
}

// ── Dashboard widget registry & layout persistence ───────────────────────────
const DASHBOARD_WIDGETS = [
  { id: 'stats',         label: 'Key Statistics',          icon: '📊', defaultVisible: true },
  { id: 'governance',    label: 'Governance Flags',         icon: '🛡️', defaultVisible: true },
  { id: 'patients',      label: 'Recent Patients',          icon: '👥', defaultVisible: true },
  { id: 'courses',       label: 'Active Courses',           icon: '📋', defaultVisible: true },
  { id: 'alerts',        label: 'Clinical Alerts',          icon: '⚠️', defaultVisible: true },
  { id: 'protocols',     label: 'Protocol Recommendations', icon: '🧠', defaultVisible: true },
  { id: 'population',    label: 'Population Summary',       icon: '🌍', defaultVisible: false },
  { id: 'quick-actions', label: 'Quick Actions',            icon: '⚡', defaultVisible: true },
];

const DASH_LAYOUT_KEY = 'ds_dashboard_layout';

function getDashLayout() {
  try {
    const stored = JSON.parse(localStorage.getItem(DASH_LAYOUT_KEY) || 'null');
    if (stored && Array.isArray(stored.order)) return stored;
  } catch {}
  return {
    order: DASHBOARD_WIDGETS.map(w => w.id),
    collapsed: [],
    hidden: DASHBOARD_WIDGETS.filter(w => !w.defaultVisible).map(w => w.id),
  };
}

function saveDashLayout(layout) {
  localStorage.setItem(DASH_LAYOUT_KEY, JSON.stringify(layout));
}

function initDashDrag() {
  let dragSrc = null;
  document.querySelectorAll('.dash-widget').forEach(widget => {
    widget.addEventListener('dragstart', (e) => {
      dragSrc = widget;
      widget.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
    });
    widget.addEventListener('dragend', () => {
      widget.style.opacity = '1';
      document.querySelectorAll('.dash-widget').forEach(w => w.classList.remove('drag-over'));
    });
    widget.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (widget !== dragSrc) widget.classList.add('drag-over');
    });
    widget.addEventListener('dragleave', () => widget.classList.remove('drag-over'));
    widget.addEventListener('drop', (e) => {
      e.preventDefault();
      widget.classList.remove('drag-over');
      if (dragSrc && dragSrc !== widget) {
        const grid = document.getElementById('dash-widget-grid');
        const allWidgets = [...grid.querySelectorAll('.dash-widget')];
        const srcIdx = allWidgets.indexOf(dragSrc);
        const tgtIdx = allWidgets.indexOf(widget);
        if (srcIdx < tgtIdx) widget.after(dragSrc); else widget.before(dragSrc);
        const newOrder = [...grid.querySelectorAll('.dash-widget')].map(w => w.dataset.widgetId);
        const layout = getDashLayout();
        layout.order = newOrder;
        saveDashLayout(layout);
      }
    });
  });
}

function renderUpcomingSessionsWidget(sessions) {
  const now = new Date();
  const upcoming = (sessions || [])
    .filter(s => s.scheduled_at && new Date(s.scheduled_at) > now)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
    .slice(0, 5);
  if (upcoming.length === 0) {
    return `<div style="text-align:center;padding:20px;color:var(--text-secondary);font-size:0.85rem">No upcoming sessions scheduled</div>`;
  }
  return upcoming.map(s => {
    const d = new Date(s.scheduled_at);
    const dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="min-width:48px;text-align:center;background:rgba(0,212,188,0.1);border-radius:8px;padding:6px">
        <div style="font-size:0.65rem;text-transform:uppercase;color:var(--teal)">${dateStr.split(' ')[0]}</div>
        <div style="font-weight:700;font-size:1rem">${d.getDate()}</div>
      </div>
      <div>
        <div style="font-size:0.85rem;font-weight:500">${s.patient_name || `Session #${(s.id||'').slice(0,6)}`}</div>
        <div style="font-size:0.75rem;color:var(--text-secondary)">${timeStr} · ${s.modality || 'Session'}</div>
      </div>
    </div>`;
  }).join('');
}

// ── Dashboard ────────────────────────────────────────────────────────────────
export async function pgDash(setTopbar, navigate) {
  const role = currentUser?.role || 'clinician';
  const _isFullAccess = role === 'clinician' || role === 'admin';
  const _isReadonly   = role === 'viewer' || role === 'readonly';

  if (!window.openPatient) {
    window.openPatient = function(id) {
      window._selectedPatientId = id;
      window._profilePatientId  = id;
      navigate('patient-profile');
    };
  }
  // Always wire up course session launcher so Execute buttons work from dashboard
  window._startCourseSession = function(courseId) {
    if (courseId) window._selectedCourseId = courseId;
    window._nav('session-execution');
  };

  const _todayDateStr = new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'short', year:'numeric' });
  setTopbar('Dashboard \u2014 ' + _todayDateStr,
    `<button class="btn btn-sm btn-ghost" onclick="window._cdAddWalkin?.() || window._nav('clinic-day')" style="white-space:nowrap">+ Walk-in</button>` +
    `<button class="btn btn-primary btn-sm" onclick="window._nav('session-execution')" style="white-space:nowrap;margin-left:6px">&#9654; Start Session</button>` +
    `<button class="btn btn-sm" aria-label="Report adverse event during active session" onclick="window._nav('adverse-events')" style="white-space:nowrap;margin-left:6px;border-color:var(--red);color:var(--red)">&#9888; Report Adverse Event</button>`
  );

  const el = document.getElementById('content');
  el.innerHTML = spinner();

  // ── Abort guard: cancel stale writes if user navigates away ───────────────
  const _abortCtrl = new AbortController();
  const _onLeave = () => _abortCtrl.abort();
  window.addEventListener('hashchange', _onLeave, { once: true });

  // ── Load all data in parallel ──────────────────────────────────────────────
  let allPatients = [], allCourses = [], pendingQueue = [], aes = [], outcomeSummary = null, allProtocols = [], allConsents = [];
  let allMediaItems = [];
  let wearableAlertSummary = null;
  const _withTimeout = (promise, ms = 8000) =>
    Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(null), ms))]);
  let _apiFailCount = 0;
  try {
    const [ptsRes, coursesRes, queueRes, aeRes, outRes, consentsRes, mediaQueueRes, wearableAlertsRes] = await Promise.all([
      _withTimeout(api.listPatients().catch(() => null)),
      _withTimeout(api.listCourses().catch(() => null)),
      _withTimeout(api.listReviewQueue({ status: 'pending' }).catch(() => null)),
      _withTimeout(api.listAdverseEvents().catch(() => null)),
      _withTimeout(api.aggregateOutcomes().catch(() => null)),
      _withTimeout(api.listConsents().catch(() => null)),
      _withTimeout(api.listMediaQueue().catch(() => null)),
      _withTimeout(api.getClinicAlertSummary().catch(() => null)),
    ]);
    if (ptsRes)       allPatients    = ptsRes.items || []; else _apiFailCount++;
    if (coursesRes)   allCourses     = coursesRes.items || []; else _apiFailCount++;
    if (queueRes)     pendingQueue   = queueRes.items || []; else _apiFailCount++;
    if (aeRes)        aes            = aeRes.items || []; else _apiFailCount++;
    if (outRes)       outcomeSummary = outRes; else _apiFailCount++;
    if (consentsRes)  allConsents    = consentsRes.items || []; else _apiFailCount++;
    if (mediaQueueRes) allMediaItems = Array.isArray(mediaQueueRes) ? mediaQueueRes : (mediaQueueRes.items || []); else _apiFailCount++;
    if (wearableAlertsRes) wearableAlertSummary = wearableAlertsRes; else _apiFailCount++;
  } catch (e) { console.error('[Dashboard] Data load failed:', e); _apiFailCount = 8; }

  // ── Demo-mode fallback ────────────────────────────────────────────────────
  // When clinic has no data (fresh install or API down), seed demo content so
  // the dashboard always shows something. _isDemo drives the DEMO badge.
  let _isDemo = false;
  if (allPatients.length === 0 && allCourses.length === 0) {
    _isDemo = true;
    allPatients = [
      { id: 'P-DEMO-1', first_name: 'Samantha', last_name: 'Li',       dob: '1985-03-12' },
      { id: 'P-DEMO-2', first_name: 'Marcus',   last_name: 'Reilly',   dob: '1978-07-22' },
      { id: 'P-DEMO-3', first_name: 'Priya',    last_name: 'Nambiar',  dob: '1990-11-04' },
      { id: 'P-DEMO-4', first_name: 'Jamal',    last_name: 'Thompson', dob: '2011-05-30' },
      { id: 'P-DEMO-5', first_name: 'Elena',    last_name: 'Okafor',   dob: '1992-08-19' },
      { id: 'P-DEMO-6', first_name: 'Terence',  last_name: 'Wu',       dob: '1980-02-14' },
    ];
    const _nowIso = new Date().toISOString();
    allCourses = [
      { id: 'C-DEMO-1', patient_id: 'P-DEMO-1', condition_slug: 'mdd',                 modality_slug: 'tDCS',          status: 'active',           sessions_delivered: 12, planned_sessions_total: 20, planned_sessions_per_week: 3, on_label: true,  evidence_grade: 'A', updated_at: _nowIso },
      { id: 'C-DEMO-2', patient_id: 'P-DEMO-2', condition_slug: 'anxious-depression',  modality_slug: 'rTMS-iTBS',     status: 'active',           sessions_delivered: 6,  planned_sessions_total: 20, planned_sessions_per_week: 5, on_label: true,  evidence_grade: 'A', updated_at: _nowIso },
      { id: 'C-DEMO-3', patient_id: 'P-DEMO-3', condition_slug: 'gad',                 modality_slug: 'tACS',          status: 'active',           sessions_delivered: 18, planned_sessions_total: 30, planned_sessions_per_week: 3, on_label: true,  evidence_grade: 'B', updated_at: _nowIso },
      { id: 'C-DEMO-4', patient_id: 'P-DEMO-4', condition_slug: 'adhd-pediatric',      modality_slug: 'Neurofeedback', status: 'active',           sessions_delivered: 8,  planned_sessions_total: 20, planned_sessions_per_week: 2, on_label: false, evidence_grade: 'C', governance_warnings: ['Off-label pediatric use · guardian consent required'], updated_at: _nowIso },
      { id: 'C-DEMO-5', patient_id: 'P-DEMO-6', condition_slug: 'ptsd',                modality_slug: 'tDCS',          status: 'active',           sessions_delivered: 19, planned_sessions_total: 20, planned_sessions_per_week: 3, on_label: true,  evidence_grade: 'B', updated_at: _nowIso },
      { id: 'C-DEMO-6', patient_id: 'P-DEMO-5', condition_slug: 'adhd-adult',          modality_slug: 'Intake',        status: 'pending_approval', sessions_delivered: 0,  planned_sessions_total: 0,  planned_sessions_per_week: 0, on_label: true,  evidence_grade: 'B', updated_at: _nowIso },
    ];
    if (!outcomeSummary) outcomeSummary = { responder_rate_pct: 64, assessment_completion_pct: 87, mean_phq9_delta: -6.2 };
    _apiFailCount = 0; // suppress fail banner — demo is intentional
  } else if (_apiFailCount >= 8) {
    if (_abortCtrl.signal.aborted) { window.removeEventListener('hashchange', _onLeave); return; }
    el.innerHTML = `<div style="padding:48px 24px;text-align:center">
      <div style="font-size:24px;margin-bottom:12px;opacity:0.4">&#9888;</div>
      <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:8px">Unable to load dashboard data</div>
      <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:16px">Check your connection and try again.</div>
      <button class="btn btn-primary" onclick="location.reload()">Retry</button>
    </div>`;
    window.removeEventListener('hashchange', _onLeave);
    return;
  }

  const patCount = allPatients.length;

  // ── Patient lookup map + enrich courses with patient name ─────────────────
  const patientMap = {};
  allPatients.forEach(p => { patientMap[p.id] = p; });
  allCourses.forEach(c => {
    const pt = patientMap[c.patient_id];
    if (pt) c._patientName = (`${pt.first_name || ''} ${pt.last_name || ''}`).trim();
  });

  // ── Derived metrics ────────────────────────────────────────────────────────
  const activeCourses    = allCourses.filter(c => c.status === 'active');
  const pendingCourses   = allCourses.filter(c => c.status === 'pending_approval');
  const approvedCourses  = allCourses.filter(c => c.status === 'approved');
  const pausedCourses    = allCourses.filter(c => c.status === 'paused');
  const completedCourses = allCourses.filter(c => c.status === 'completed');
  const flaggedCourses   = allCourses.filter(c => (c.governance_warnings || []).length > 0);
  const offLabelPending  = allCourses.filter(c => c.on_label === false && (c.status === 'pending_approval' || c.status === 'approved'));

  const _riskScore = c => (c.on_label === false ? 30 : 0) + (c.governance_warnings || []).length * 15 + ({ A: 0, B: 10, C: 25, D: 40 }[c.evidence_grade] ?? 20);
  const atRiskCourses   = allCourses.filter(c => _riskScore(c) >= 50);
  const blindTreatments = activeCourses.filter(c => (c.sessions_delivered || 0) >= 10);

  const openAEs    = aes.filter(a => !a.resolved_at);
  const seriousAEs = aes.filter(a => (a.severity === 'serious' || a.severity === 'severe') && !a.resolved_at);

  const wearableAlertCount  = wearableAlertSummary?.total_active || 0;
  const wearableUrgentCount = wearableAlertSummary?.urgent_count || 0;
  const alertFlags      = Math.max(flaggedCourses.length + seriousAEs.length, atRiskCourses.length);
  const sessionsPerWeek = activeCourses.reduce((s, c) => s + (c.planned_sessions_per_week || 0), 0);
  const totalDelivered  = allCourses.reduce((s, c) => s + (c.sessions_delivered || 0), 0);

  const _dashConsentToday = new Date(); _dashConsentToday.setHours(0, 0, 0, 0);
  const consentAlertCount = allConsents.filter(c => {
    if (c.status === 'withdrawn') return false;
    const exp = c.expires_at ? new Date(c.expires_at) : null;
    if (!exp) return false;
    return exp < _dashConsentToday || (exp - _dashConsentToday) < 30 * 86400000;
  }).length;

  const responderRate = (() => {
    if (!outcomeSummary) return '—';
    const r = outcomeSummary.responder_rate_pct ?? outcomeSummary.responder_rate;
    return r != null ? Math.round(r) + '%' : '—';
  })();
  const assessCompletionPct = outcomeSummary?.assessment_completion_pct != null
    ? Math.round(outcomeSummary.assessment_completion_pct) + '%' : '—';

  const activePatientIds = [...new Set(activeCourses.map(c => c.patient_id).filter(Boolean))];

  // ── Assessments due (active patients without an assessment in 7+ days) ──────
  // Prefer backend-computed count; fall back to localStorage if unavailable.
  const _localStorageAssessmentsDue = () => {
    try {
      const _assessRuns = JSON.parse(localStorage.getItem('ds_assessment_runs') || '[]');
      const _now = Date.now();
      const _weekMs = 7 * 24 * 3600 * 1000;
      const _lastAssessMap = {};
      _assessRuns.forEach(r => {
        const key = r.patient_id || 'unknown';
        const t = r.completed_at ? new Date(r.completed_at).getTime() : 0;
        if (!_lastAssessMap[key] || t > _lastAssessMap[key]) _lastAssessMap[key] = t;
      });
      return activePatientIds.filter(id => {
        const last = _lastAssessMap[id] || 0;
        return (_now - last) > _weekMs;
      }).length;
    } catch { return 0; }
  };
  const assessmentsDueCount = outcomeSummary?.assessments_overdue_count ?? _localStorageAssessmentsDue();

  const modalityCount = {};
  activeCourses.forEach(c => { const m = c.modality_slug || 'Unknown'; modalityCount[m] = (modalityCount[m] || 0) + 1; });
  const topModalities = Object.entries(modalityCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const recentCourses = [...allCourses]
    .sort((a, b) => ((b.updated_at || b.created_at || '') > (a.updated_at || a.created_at || '') ? 1 : -1))
    .slice(0, 10);

  // ── Media queue metrics ────────────────────────────────────────────────────
  const mediaUrgent     = allMediaItems.filter(i => i.flagged_urgent).length;
  const mediaNeedsAttention = allMediaItems.filter(i => i.flagged_urgent || i.status === 'pending_review' || i.status === 'reupload_requested');

  // ── Patients Needing Attention (ranked by clinical urgency) ───────────────
  const _attentionScore = patId => {
    let score = 0;
    const ptAEs = openAEs.filter(a => a.patient_id === patId);
    const ptCourses = allCourses.filter(c => c.patient_id === patId);
    if (ptAEs.some(a => a.severity === 'serious' || a.severity === 'severe')) score += 100;
    if (ptAEs.length) score += 40;
    if (ptCourses.some(c => c.status === 'paused')) score += 60;
    if (ptCourses.some(c => (c.governance_warnings || []).length > 0)) score += 50;
    if (ptCourses.some(c => c.on_label === false && c.status === 'pending_approval')) score += 30;
    return score;
  };
  const _attentionReason = patId => {
    const ptAEs = openAEs.filter(a => a.patient_id === patId);
    const ptCourses = allCourses.filter(c => c.patient_id === patId);
    if (ptAEs.some(a => a.severity === 'serious' || a.severity === 'severe')) return { label: 'Serious adverse event', color: 'var(--red)' };
    if (ptAEs.length) return { label: 'Open adverse event', color: 'var(--amber)' };
    if (ptCourses.some(c => c.status === 'paused')) return { label: 'Course paused', color: 'var(--amber)' };
    if (ptCourses.some(c => (c.governance_warnings || []).length > 0)) return { label: 'Safety flag', color: 'var(--red)' };
    if (ptCourses.some(c => c.on_label === false && c.status === 'pending_approval')) return { label: 'Off-label pending', color: 'var(--amber)' };
    return { label: 'Needs review', color: 'var(--text-secondary)' };
  };
  const patientsNeedingAttention = [...new Set([
    ...seriousAEs.map(a => a.patient_id),
    ...openAEs.map(a => a.patient_id),
    ...pausedCourses.map(c => c.patient_id),
    ...flaggedCourses.map(c => c.patient_id),
    ...offLabelPending.map(c => c.patient_id),
  ].filter(Boolean))]
    .map(id => ({ id, pt: patientMap[id], score: _attentionScore(id) }))
    .filter(x => x.pt)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  // ── Clinic Queue (ranked: urgent first, then active, paused, pending) ─────
  const _courseUrgency = c => {
    let s = 0;
    if (seriousAEs.some(a => a.patient_id === c.patient_id)) s += 100;
    if ((c.governance_warnings || []).length) s += 80;
    if (c.status === 'paused') s += 60;
    if (c.on_label === false) s += 40;
    return s;
  };
  const clinicQueue = [
    ...activeCourses.map(c => ({ ...c, _qStatus: 'active' })),
    ...pausedCourses.map(c => ({ ...c, _qStatus: 'paused' })),
    ...pendingCourses.map(c => ({ ...c, _qStatus: 'pending' })),
    ...approvedCourses.map(c => ({ ...c, _qStatus: 'approved' })),
  ].sort((a, b) => _courseUrgency(b) - _courseUrgency(a)).slice(0, 12);

  // ── Fresh install card (suppressed in demo mode) ──────────────────────
  const _isFirstRun = false;
  const getStartedCard = _isFirstRun ? `
<div data-setup-card style="background:linear-gradient(135deg,rgba(0,212,188,0.07),rgba(59,130,246,0.07));border:1px solid rgba(0,212,188,0.18);border-radius:12px;padding:20px 24px;margin-bottom:16px">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px">
    <div>
      <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:3px">Get started with DeepSynaps Studio</div>
      <div style="font-size:12px;color:var(--text-secondary)">Complete these steps to set up your clinic workflow</div>
    </div>
    <button onclick="localStorage.setItem('ds_setup_dismissed','1');document.querySelector('[data-setup-card]')?.remove()"
            style="background:none;border:none;cursor:pointer;color:var(--text-tertiary);font-size:18px;padding:0;line-height:1;margin-left:16px" aria-label="Dismiss">&#x2715;</button>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
    ${[
      { icon: '&#9673;', title: 'Add First Patient', sub: 'Register a patient to get started', nav: 'patients', color: 'var(--blue)' },
      { icon: '&#9678;', title: 'Create Treatment Course', sub: 'Set up an evidence-based treatment plan', nav: 'protocol-wizard', color: 'var(--teal)' },
      { icon: '&#9671;', title: 'Browse Protocols', sub: 'Explore the evidence registry', nav: 'protocols-registry', color: 'var(--violet)' },
      { icon: '&#9881;', title: 'Configure Clinic', sub: 'Settings, branding, team members', nav: 'settings', color: 'var(--text-secondary)' },
    ].map(s => `<div onclick="window._nav('${s.nav}')" style="padding:14px;border:1px solid var(--border);border-radius:8px;background:var(--bg-card);cursor:pointer;transition:border-color 0.15s" onmouseover="this.style.borderColor='var(--teal)'" onmouseout="this.style.borderColor='var(--border)'">
      <div style="font-size:20px;color:${s.color};margin-bottom:8px">${s.icon}</div>
      <div style="font-size:12.5px;font-weight:600;color:var(--text-primary);margin-bottom:3px">${s.title}</div>
      <div style="font-size:11px;color:var(--text-tertiary)">${s.sub}</div>
    </div>`).join('')}
  </div>
</div>` : '';

  window._dashAgentCtx = [
    '[Clinic dashboard snapshot — use for operational context; not a substitute for chart review.]',
    `Patients in system: ${patCount}`,
    `Active courses: ${activeCourses.length}; pending approval: ${pendingCourses.length}; paused: ${pausedCourses.length}; completed: ${completedCourses.length}`,
    `Pending review queue items: ${pendingQueue.length}`,
    `Open adverse events: ${openAEs.length}; serious unresolved: ${seriousAEs.length}`,
    `Responder rate (aggregate): ${responderRate}; assessment completion: ${assessCompletionPct}`,
    `Sessions per week (planned sum): ${sessionsPerWeek}`,
    `Wearable alerts: ${wearableAlertCount} (${wearableUrgentCount} urgent); media items needing attention: ${mediaNeedsAttention.length}`,
    `Patients flagged for attention: ${patientsNeedingAttention.length}`,
    `Today's clinic queue (courses): ${clinicQueue.length}`,
  ].join('\n');

  const _dashPrompts = [
    { icon: '📋', q: 'What should I prioritize in the review queue today?' },
    { icon: '&#9888;', q: 'Summarize open safety items I should know about' },
    { icon: '📅', q: 'How should I plan sessions this week given the active caseload?' },
    { icon: '📈', q: 'Explain responder rate and outcomes snapshot in plain language' },
  ];
  const dashAgentStrip = `<div class="dash-agent-strip card" style="margin-bottom:12px">
  <div class="dash-agent-strip__inner">
    <div class="dash-agent-strip__copy">
      <div class="dash-agent-strip__title">Clinic specialist agents</div>
      <div class="dash-agent-strip__sub">Ask about queue, protocols, and workflow. A snapshot of this dashboard is sent with each question — not a substitute for clinical judgment.</div>
    </div>
    <button type="button" class="btn btn-primary btn-sm" onclick="window._dashAgentOpen()">Open agents</button>
  </div>
</div>
<div id="dash-agent-modal" class="dash-agent-modal" style="display:none" role="dialog" aria-label="Clinic specialist agents">
  <div class="dash-agent-modal__backdrop" onclick="window._dashAgentClose()"></div>
  <div class="dash-agent-modal__panel card">
    <div class="dash-agent-modal__head">
      <span class="dash-agent-modal__title">Clinic specialist agents</span>
      <button type="button" class="dash-agent-modal__close" onclick="window._dashAgentClose()" aria-label="Close">&#x2715;</button>
    </div>
    <div class="dash-agent-modal__body">
      <div class="dash-agent-modal__intro">Operational Q&amp;A for your practice. Answers use the dashboard snapshot below. For patient-specific decisions, use the chart.</div>
      <div class="ptd-asst-prompts">
        ${_dashPrompts.map(p => `<button type="button" class="ptd-asst-prompt" onclick="window._dashAgentAsk(${JSON.stringify(p.q)})">${p.icon} ${p.q}</button>`).join('')}
      </div>
      <div class="ptd-asst-input-row">
        <input id="dash-agent-inp" class="ptd-asst-inp" type="text" placeholder="Type your question…" onkeydown="if(event.key==='Enter')window._dashAgentSend()">
        <button type="button" class="ptd-asst-send" onclick="window._dashAgentSend()">&#x2192;</button>
      </div>
      <div id="dash-agent-resp" class="ptd-asst-resp" style="display:none"></div>
    </div>
  </div>
</div>`;

  // ── Inject home CSS (once) ────────────────────────────────────────────────────
  if (!document.getElementById('dh-styles')) {
    const _s = document.createElement('style'); _s.id = 'dh-styles';
    _s.textContent = `
.dh-wrap { padding: 20px 24px; max-width: 1400px; }
.dh-stats-bar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:18px; }
.dh-stat { background:var(--bg-card); border:1px solid var(--border); border-radius:8px; padding:10px 18px; display:flex; align-items:center; gap:10px; cursor:pointer; transition:border-color 0.12s; min-width:110px; }
.dh-stat:hover { border-color:var(--teal); }
.dh-stat--warn  { border-color:#f59e0b40; }
.dh-stat--danger{ border-color:#f8717160; }
.dh-stat-val { font-size:22px; font-weight:800; color:var(--text-primary); line-height:1; }
.dh-stat--warn  .dh-stat-val { color:#f59e0b; }
.dh-stat--danger .dh-stat-val { color:#f87171; }
.dh-stat-info { display:flex; flex-direction:column; }
.dh-stat-lbl { font-size:10.5px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.4px; }
.dh-stat-sub { font-size:10px; color:var(--text-secondary); margin-top:1px; }
.dh-main-grid { display:grid; grid-template-columns:1fr 340px; gap:16px; align-items:start; }
@media(max-width:1024px){ .dh-main-grid { grid-template-columns:1fr; } }
@media(max-width:768px){
  .dh-btn { min-height:44px; padding:10px 14px; font-size:13px; }
  .dh-btn--start { min-height:44px; padding:10px 16px; }
  .dh-urgent-row { min-height:44px; }
  .dh-qa-item { min-height:44px; }
  .dh-qa-grid { grid-template-columns:1fr; }
  .dh-wrap { padding:12px 14px; }
}
.dh-appt-card { background:var(--bg-card); border:1px solid var(--border); border-radius:10px; overflow:hidden; }
.dh-appt-hd { padding:14px 18px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; }
.dh-appt-hd-left { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.dh-appt-title { font-size:14px; font-weight:700; color:var(--text-primary); }
.dh-appt-meta { font-size:11.5px; color:var(--text-secondary); }
.dh-appt-badge { font-size:11px; font-weight:700; padding:2px 8px; border-radius:10px; white-space:nowrap; }
.dh-appt-badge--active { background:rgba(96,165,250,0.15); color:#60a5fa; }
.dh-appt-badge--wait   { background:rgba(245,158,11,0.15);  color:#f59e0b; }
.dh-appt-badge--done   { background:rgba(34,197,94,0.12);   color:#22c55e; }
.dh-appt-table { width:100%; border-collapse:collapse; }
.dh-appt-table th { padding:9px 14px; font-size:10.5px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.4px; text-align:left; background:var(--bg-sidebar); border-bottom:1px solid var(--border); white-space:nowrap; }
.dh-appt-table td { padding:12px 14px; border-bottom:1px solid var(--border); vertical-align:middle; }
.dh-appt-row { transition:background 0.1s; }
.dh-appt-row:last-child td { border-bottom:none; }
.dh-appt-row:hover td { background:var(--bg-card-hover, rgba(255,255,255,0.025)); }
.dh-appt-row--active td { background:rgba(96,165,250,0.04); }
.dh-appt-row--done   td { opacity:0.72; }
.dh-appt-row--noshow td { opacity:0.55; }
.dh-appt-time   { font-size:12px; color:var(--text-tertiary); font-weight:600; white-space:nowrap; }
.dh-appt-name   { font-size:13px; font-weight:700; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px; }
.dh-appt-cond   { font-size:11.5px; background:rgba(255,255,255,0.07); border-radius:4px; padding:2px 8px; color:var(--text-secondary); white-space:nowrap; display:inline-block; }
.dh-appt-ses    { font-size:12px; color:var(--text-secondary); white-space:nowrap; }
.dh-appt-proto  { font-size:11.5px; color:var(--text-tertiary); max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dh-appt-status { white-space:nowrap; }
.dh-appt-status-badge { font-size:11px; font-weight:700; padding:3px 9px; border-radius:12px; white-space:nowrap; display:inline-flex; align-items:center; gap:4px; }
.dh-st-wait   { background:rgba(245,158,11,0.15);  color:#f59e0b; }
.dh-st-active { background:rgba(96,165,250,0.15);  color:#60a5fa; }
.dh-st-done   { background:rgba(34,197,94,0.12);   color:#22c55e; }
.dh-st-noshow { background:rgba(248,113,113,0.12); color:#f87171; }
.dh-pulse { width:6px; height:6px; border-radius:50%; background:#60a5fa; animation:dh-pulse 1.4s infinite; }
@keyframes dh-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.8)} }
.dh-appt-actions { display:flex; gap:4px; align-items:center; }
.dh-btn { padding:4px 12px; border-radius:5px; font-size:11.5px; font-weight:600; cursor:pointer; border:1px solid var(--border); background:var(--bg-input, #1e2235); color:var(--text-secondary); font-family:inherit; transition:all 0.12s; white-space:nowrap; }
.dh-btn:hover { color:var(--text-primary); border-color:var(--teal); }
.dh-btn--start { background:linear-gradient(135deg,var(--teal),var(--blue)); color:#000; border:none; font-weight:700; font-size:12px; padding:5px 14px; }
.dh-btn--start:hover { opacity:0.88; color:#000; }
.dh-appt-empty { padding:40px 20px; text-align:center; }
.dh-appt-empty-ico { font-size:32px; margin-bottom:12px; opacity:0.4; }
.dh-appt-empty-txt { font-size:13px; color:var(--text-tertiary); margin-bottom:12px; }
.dh-right-panel { display:flex; flex-direction:column; gap:12px; }
.dh-panel-card { background:var(--bg-card); border:1px solid var(--border); border-radius:10px; overflow:hidden; }
.dh-panel-hd { padding:12px 15px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:8px; }
.dh-panel-title { font-size:12.5px; font-weight:700; color:var(--text-primary); }
.dh-urgent-badge { font-size:10px; font-weight:700; color:#fff; background:#f87171; border-radius:10px; padding:1px 7px; }
.dh-urgent-row { display:flex; align-items:center; gap:10px; padding:9px 15px; border-bottom:1px solid var(--border); cursor:pointer; transition:background 0.1s; }
.dh-urgent-row:last-child { border-bottom:none; }
.dh-urgent-row:hover { background:rgba(255,255,255,0.02); }
.dh-urgent-ico { font-size:14px; flex-shrink:0; width:18px; text-align:center; }
.dh-urgent-lbl { flex:1; font-size:12px; font-weight:500; color:var(--text-primary); }
.dh-urgent-cnt { font-size:13px; font-weight:800; font-family:var(--font-mono,monospace); }
.dh-urgent-arr { color:var(--text-tertiary); font-size:11px; }
.dh-all-clear { padding:16px 15px; font-size:12px; color:var(--text-tertiary); text-align:center; }
.dh-qa-grid { display:grid; grid-template-columns:1fr 1fr; gap:1px; background:var(--border); }
.dh-qa-item { background:var(--bg-card); padding:12px 14px; cursor:pointer; display:flex; align-items:center; gap:9px; transition:background 0.1s; }
.dh-qa-item:hover { background:var(--bg-card-hover, rgba(255,255,255,0.03)); }
.dh-qa-ico { font-size:16px; flex-shrink:0; }
.dh-qa-lbl { font-size:12px; font-weight:500; color:var(--text-primary); }
.dh-attn-list { display:flex; flex-direction:column; }
.dh-attn-row { display:flex; align-items:center; gap:10px; padding:9px 15px; border-bottom:1px solid var(--border); cursor:pointer; transition:background 0.1s; }
.dh-attn-row:last-child { border-bottom:none; }
.dh-attn-row:hover { background:rgba(255,255,255,0.02); }
.dh-attn-avatar { width:26px; height:26px; border-radius:50%; background:linear-gradient(135deg,var(--teal),var(--blue)); display:flex; align-items:center; justify-content:center; font-size:9.5px; font-weight:700; color:#000; flex-shrink:0; text-transform:uppercase; }
.dh-attn-name { font-size:12px; font-weight:600; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dh-attn-reason { font-size:10.5px; font-weight:600; }
.dh-gov-strip { background:var(--bg-card); border:1px solid #f8717140; border-radius:10px; overflow:hidden; margin-top:16px; }
.dh-gov-hd { padding:11px 16px; background:rgba(248,113,113,0.06); border-bottom:1px solid #f8717130; display:flex; align-items:center; gap:8px; }
.dh-gov-title { font-size:12px; font-weight:700; color:#f87171; }
.dh-gov-items { display:flex; flex-wrap:wrap; gap:8px; padding:12px 16px; }
.dh-gov-item { background:rgba(248,113,113,0.08); border:1px solid rgba(248,113,113,0.2); border-radius:6px; padding:6px 12px; cursor:pointer; transition:background 0.1s; }
.dh-gov-item:hover { background:rgba(248,113,113,0.14); }
.dh-gov-item-lbl { font-size:11.5px; font-weight:600; color:var(--text-primary); }
.dh-gov-item-sub { font-size:10px; color:#fca5a5; margin-top:1px; }
.dh-hero-card { background:linear-gradient(135deg,rgba(0,212,188,0.08),rgba(59,130,246,0.06)); border:2px solid rgba(0,212,188,0.25); border-radius:14px; overflow:hidden; margin-bottom:20px; }
.dh-hero-hd { padding:20px 24px; border-bottom:1px solid rgba(0,212,188,0.15); display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
.dh-hero-title { font-size:18px; font-weight:800; color:var(--text-primary); margin-bottom:4px; }
.dh-hero-sub { font-size:13px; color:var(--text-secondary); }
.dh-hero-body { max-height:360px; overflow-y:auto; }
.light-theme .dh-stat { background:#fff; }
.light-theme .dh-appt-card, .light-theme .dh-panel-card { background:#fff; }
.light-theme .dh-appt-cond { background:#f0f4f8; }
.light-theme .dh-btn { background:#f0f4f8; color:#374151; border-color:#d1d5db; }
.light-theme .dh-appt-table th { background:#f8fafc; }
    `;
    document.head.appendChild(_s);
  }

  // ── ROW 1 data (kept for backward compat internal calcs) ──────────────────────
  const _todayStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  const _totalUrgent = seriousAEs.length + (wearableUrgentCount || 0) + mediaNeedsAttention.filter(i => i.flagged_urgent).length;
  const _totalActions = pendingQueue.length + openAEs.length + consentAlertCount + mediaNeedsAttention.length + patientsNeedingAttention.length;

  // ── glanceCard removed (replaced by compact stats bar) ───────────────────────

  const _urgentItems = [
    // Tier 1: CRITICAL (Red) — Stop-work items
    { show: seriousAEs.length > 0,              icon: '&#x26A1;', label: 'Serious Adverse Events',  count: seriousAEs.length,              color: 'var(--red)',   nav: 'adverse-events', tier: 1 },
    { show: wearableUrgentCount > 0,             icon: '&#9676;',  label: 'Urgent Wearable Alerts', count: wearableUrgentCount,            color: 'var(--red)',   nav: 'wearables', tier: 1 },
    { show: mediaUrgent > 0,                     icon: '&#9873;',  label: 'Urgent Media',           count: mediaUrgent,                    color: 'var(--red)',   nav: 'media-queue', tier: 1 },
    // Tier 2: HIGH (Amber) — Require attention today
    { show: pendingQueue.length > 0,             icon: '&#9649;',  label: 'Pending Approvals',      count: pendingQueue.length,            color: 'var(--amber)', nav: 'review-queue', tier: 2 },
    { show: flaggedCourses.length > 0,           icon: '&#9888;',  label: 'Safety Flags',           count: flaggedCourses.length,          color: 'var(--amber)', nav: 'review-queue', tier: 2 },
    // Tier 3: MEDIUM (Blue) — Monitoring
    { show: openAEs.length > 0,                  icon: '&#9888;',  label: 'Open Adverse Events',    count: openAEs.length,                 color: 'var(--blue)',  nav: 'adverse-events', tier: 3 },
    { show: consentAlertCount > 0,               icon: '&#9678;',  label: 'Consent Expiring',       count: consentAlertCount,              color: 'var(--blue)',  nav: 'patients', tier: 3 },
    { show: patientsNeedingAttention.length > 0, icon: '&#9888;',  label: 'Patients Flagged',       count: patientsNeedingAttention.length, color: 'var(--blue)',  nav: 'patients', tier: 3 },
  ].filter(i => i.show)
   .filter(i => _isFullAccess || i.tier === 1)   // technician/viewer: critical safety only
   .sort((a, b) => a.tier - b.tier);

  // ── V2 DASHBOARD LAYOUT ───────────────────────────────────────────────────────
  const _kb = 'tabindex="0" role="button" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();this.click()}"';
  const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  // ── V2 CSS (once) ─────────────────────────────────────────────────────────────
  if (!document.getElementById('dh2-styles')) {
    const _s2 = document.createElement('style'); _s2.id = 'dh2-styles';
    _s2.textContent = `
.dh2-wrap { padding: 24px 28px; max-width: 1480px; margin: 0 auto; }
.dh2-demo-banner { display:flex; align-items:center; gap:10px; padding:8px 14px; margin-bottom:16px;
  background:linear-gradient(90deg,rgba(155,127,255,0.12),rgba(74,158,255,0.08));
  border:1px solid rgba(155,127,255,0.28); border-radius:10px;
  font-size:12px; color:var(--text-secondary); }
.dh2-demo-pill { font-size:10px; font-weight:800; letter-spacing:0.8px; text-transform:uppercase;
  background:rgba(155,127,255,0.22); color:var(--violet); padding:2px 8px; border-radius:4px; }
.dh2-fail-banner { padding:8px 14px; margin-bottom:12px; background:rgba(245,158,11,0.08);
  border:1px solid rgba(245,158,11,0.2); border-radius:8px; font-size:12px; color:#f59e0b;
  display:flex; align-items:center; gap:8px; }

.dh2-page-head { display:flex; align-items:flex-end; justify-content:space-between; gap:16px;
  margin-bottom:20px; flex-wrap:wrap; }
.dh2-greet { font-family:var(--font-display,'Outfit',system-ui,sans-serif); font-size:26px;
  font-weight:600; letter-spacing:-0.6px; color:var(--text-primary); margin-bottom:4px; }
.dh2-greet-sub { font-size:13px; color:var(--text-secondary); }
.dh2-greet-sub strong { color:var(--text-primary); font-weight:600; }
.dh2-head-actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.dh2-tabrow { display:flex; gap:4px; background:var(--bg-surface); padding:3px;
  border-radius:8px; border:1px solid var(--border); }
.dh2-tabrow button { padding:6px 12px; font-size:11.5px; font-weight:600; color:var(--text-secondary);
  background:transparent; border:0; border-radius:5px; cursor:pointer; font-family:inherit; }
.dh2-tabrow button.dh2-active { background:rgba(255,255,255,0.08); color:var(--text-primary); }

.dh2-alert-strip { padding:12px 16px; margin-bottom:16px; border-radius:12px;
  background:linear-gradient(90deg,rgba(255,181,71,0.10),rgba(255,107,107,0.05));
  border:1px solid rgba(255,181,71,0.24);
  display:flex; align-items:center; gap:14px; }
.dh2-alert-ico { width:32px; height:32px; border-radius:9px; background:rgba(255,181,71,0.18);
  color:var(--amber); display:flex; align-items:center; justify-content:center; flex-shrink:0;
  font-size:16px; }
.dh2-alert-body { flex:1; min-width:0; }
.dh2-alert-title { font-size:13px; font-weight:600; color:var(--text-primary); }
.dh2-alert-sub { font-size:11.5px; color:var(--text-secondary); margin-top:2px; }

.dh2-kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:18px; }
@media(max-width:980px){ .dh2-kpi-grid { grid-template-columns:repeat(2,1fr); } }
@media(max-width:520px){ .dh2-kpi-grid { grid-template-columns:1fr; } }
.dh2-kpi { padding:18px 18px 16px; border-radius:16px; background:var(--bg-card);
  border:1px solid var(--border); position:relative; overflow:hidden; cursor:pointer;
  transition:border-color 0.12s, transform 0.12s; }
.dh2-kpi:hover { border-color:var(--border-hover,rgba(255,255,255,0.14)); transform:translateY(-1px); }
.dh2-kpi-lbl { font-size:11px; color:var(--text-tertiary); letter-spacing:0.5px;
  text-transform:uppercase; font-weight:600; margin-bottom:14px; display:flex; align-items:center; gap:7px; }
.dh2-kpi-dot { width:6px; height:6px; border-radius:50%; }
.dh2-kpi-dot.teal   { background:var(--teal);   box-shadow:0 0 6px var(--teal);   }
.dh2-kpi-dot.blue   { background:var(--blue);   box-shadow:0 0 6px var(--blue);   }
.dh2-kpi-dot.violet { background:var(--violet); box-shadow:0 0 6px var(--violet); }
.dh2-kpi-dot.amber  { background:var(--amber);  box-shadow:0 0 6px var(--amber);  }
.dh2-kpi-num { font-family:var(--font-display,'Outfit',system-ui,sans-serif);
  font-size:30px; font-weight:600; letter-spacing:-0.9px; line-height:1; color:var(--text-primary); }
.dh2-kpi-num .unit { font-size:14px; color:var(--text-tertiary); font-weight:500; margin-left:4px; }
.dh2-kpi-delta { display:inline-flex; align-items:center; gap:5px; margin-top:10px;
  font-family:var(--font-mono,'JetBrains Mono',monospace); font-size:11px; padding:2px 7px; border-radius:4px; }
.dh2-kpi-delta.up   { color:var(--green); background:rgba(74,222,128,0.10); }
.dh2-kpi-delta.down { color:var(--red);   background:rgba(255,107,107,0.10); }
.dh2-kpi-delta.flat { color:var(--text-tertiary); background:rgba(255,255,255,0.04); }
.dh2-kpi-spark { position:absolute; right:0; bottom:0; width:100px; height:40px; opacity:0.75; }

.dh2-row-2-1 { display:grid; grid-template-columns:2fr 1fr; gap:16px; margin-bottom:16px; }
.dh2-row-3-2 { display:grid; grid-template-columns:3fr 2fr; gap:16px; margin-bottom:16px; }
@media(max-width:1100px){ .dh2-row-2-1, .dh2-row-3-2 { grid-template-columns:1fr; } }

.dh2-card { background:var(--bg-card); border:1px solid var(--border); border-radius:16px;
  padding:20px; position:relative; }
.dh2-card-hd { display:flex; align-items:center; justify-content:space-between; margin-bottom:18px; gap:12px; flex-wrap:wrap; }
.dh2-card-title { font-family:var(--font-display,'Outfit',system-ui,sans-serif);
  font-size:14.5px; font-weight:600; letter-spacing:-0.2px; color:var(--text-primary); }
.dh2-card-sub { font-size:11.5px; color:var(--text-tertiary); margin-top:2px; }
.dh2-card-actions { display:flex; gap:6px; align-items:center; }

.dh2-chip { padding:4px 9px; border-radius:5px; font-size:11px; font-weight:600;
  background:var(--bg-surface); color:var(--text-secondary); display:inline-block; }
.dh2-chip.teal   { background:rgba(0,212,188,0.12); color:var(--teal);   }
.dh2-chip.blue   { background:rgba(74,158,255,0.12); color:var(--blue);  }
.dh2-chip.amber  { background:rgba(255,181,71,0.12); color:var(--amber); }
.dh2-chip.rose   { background:rgba(255,107,157,0.12); color:var(--rose); }
.dh2-chip.green  { background:rgba(74,222,128,0.12); color:var(--green); }
.dh2-chip.violet { background:rgba(155,127,255,0.12); color:var(--violet); }
.dh2-chip.red    { background:rgba(255,107,107,0.14); color:var(--red);   }

.dh2-sched { display:grid; grid-template-columns:60px 1fr; gap:8px; }
.dh2-sched-time { font-family:var(--font-mono,'JetBrains Mono',monospace); font-size:11px;
  color:var(--text-tertiary); padding-top:14px; text-align:right; padding-right:4px; }
.dh2-sched-slot { background:rgba(255,255,255,0.025); border:1px solid var(--border);
  border-left:3px solid var(--teal); padding:10px 12px; border-radius:10px;
  display:grid; grid-template-columns:1fr auto; gap:10px; align-items:center;
  cursor:pointer; transition:background 0.12s; }
.dh2-sched-slot:hover { background:rgba(255,255,255,0.045); }
.dh2-sched-slot.blue   { border-left-color:var(--blue);   }
.dh2-sched-slot.violet { border-left-color:var(--violet); }
.dh2-sched-slot.amber  { border-left-color:var(--amber);  }
.dh2-sched-slot.rose   { border-left-color:var(--rose);   }
.dh2-sched-slot.empty  { border-style:dashed; border-left-style:dashed;
  border-left-color:rgba(255,255,255,0.1); color:var(--text-tertiary); text-align:center;
  padding:14px; cursor:pointer; }
.dh2-sched-pt { display:flex; align-items:center; gap:10px; min-width:0; }
.dh2-pt-av { width:28px; height:28px; border-radius:50%; flex-shrink:0;
  display:flex; align-items:center; justify-content:center; font-size:10.5px; font-weight:600; color:#04121c; }
.dh2-pt-av.a { background:linear-gradient(135deg,#00d4bc,#00a896); }
.dh2-pt-av.b { background:linear-gradient(135deg,#4a9eff,#2d7fe0); color:#fff; }
.dh2-pt-av.c { background:linear-gradient(135deg,#9b7fff,#7c5fe0); color:#fff; }
.dh2-pt-av.d { background:linear-gradient(135deg,#ff6b9d,#e04880); color:#fff; }
.dh2-pt-av.e { background:linear-gradient(135deg,#ffb547,#e69524); }
.dh2-sched-pt-name { font-size:12.5px; font-weight:600; color:var(--text-primary);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dh2-sched-pt-proto { font-size:10.5px; color:var(--text-tertiary); margin-top:2px;
  display:flex; gap:6px; flex-wrap:wrap; }
.dh2-launch-btn { padding:5px 10px; font-size:11px; font-weight:600; border-radius:6px;
  background:transparent; color:var(--text-secondary); border:1px solid var(--border);
  cursor:pointer; font-family:inherit; transition:all 0.12s; white-space:nowrap; }
.dh2-launch-btn:hover { color:var(--teal); border-color:var(--teal); }
.dh2-launch-btn.primary { background:linear-gradient(135deg,var(--teal),var(--blue));
  color:#04121c; border-color:transparent; }
.dh2-launch-btn.primary:hover { opacity:0.9; color:#04121c; }

.dh2-queue-row { display:grid; grid-template-columns:1.6fr 1fr 1fr 1fr 80px; gap:12px;
  align-items:center; padding:12px 4px; border-bottom:1px solid var(--border); font-size:12.5px;
  cursor:pointer; transition:background 0.12s; }
.dh2-queue-row:last-child { border-bottom:none; }
.dh2-queue-row:hover { background:rgba(255,255,255,0.02); }
.dh2-queue-row.head { color:var(--text-tertiary); font-size:10.5px; letter-spacing:1px;
  text-transform:uppercase; font-weight:600; padding:4px 4px 10px; cursor:default; }
.dh2-queue-row.head:hover { background:transparent; }
.dh2-queue-pt { display:flex; align-items:center; gap:10px; min-width:0; }
.dh2-queue-pt-name { font-weight:600; color:var(--text-primary); white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; }
.dh2-queue-pt-cond { font-size:10.5px; color:var(--text-tertiary); margin-top:1px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dh2-queue-prog { display:flex; align-items:center; gap:8px; }
.dh2-queue-prog-bar { flex:1; height:5px; border-radius:3px;
  background:rgba(255,255,255,0.06); overflow:hidden; min-width:40px; }
.dh2-queue-prog-bar > div { height:100%; background:linear-gradient(90deg,var(--teal),var(--blue)); border-radius:3px; }
.dh2-queue-prog-num { font-family:var(--font-mono,'JetBrains Mono',monospace);
  font-size:10.5px; color:var(--text-tertiary); min-width:36px; text-align:right; }
.dh2-iconbtn { width:26px; height:26px; border-radius:7px; border:1px solid var(--border);
  background:transparent; color:var(--text-secondary); cursor:pointer; display:inline-flex;
  align-items:center; justify-content:center; font-size:13px; }
.dh2-iconbtn:hover { color:var(--teal); border-color:var(--teal); }
@media(max-width:780px){ .dh2-queue-row { grid-template-columns:1fr; gap:6px; } }

.dh2-evidence-list { display:flex; flex-direction:column; gap:8px; }
.dh2-evidence-item { display:grid; grid-template-columns:auto 1fr auto; gap:12px; align-items:center;
  padding:10px 12px; border-radius:10px; background:rgba(255,255,255,0.02);
  border:1px solid var(--border); cursor:pointer; transition:background 0.12s; }
.dh2-evidence-item:hover { background:rgba(255,255,255,0.04); }
.dh2-evidence-grade { font-family:var(--font-display,'Outfit',system-ui,sans-serif); font-size:13px;
  font-weight:700; width:32px; height:32px; border-radius:9px;
  display:flex; align-items:center; justify-content:center; }
.dh2-evidence-grade.a { background:rgba(0,212,188,0.14); color:var(--teal); }
.dh2-evidence-grade.b { background:rgba(74,158,255,0.14); color:var(--blue); }
.dh2-evidence-grade.c { background:rgba(255,181,71,0.14); color:var(--amber); }
.dh2-evidence-grade.d { background:rgba(255,107,107,0.14); color:var(--red); }
.dh2-evidence-name { font-size:12.5px; font-weight:600; color:var(--text-primary); }
.dh2-evidence-meta { font-size:10.5px; color:var(--text-tertiary); margin-top:2px; }

.dh2-qa-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.dh2-qa-item { background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:10px;
  padding:12px 14px; cursor:pointer; display:flex; align-items:center; gap:10px;
  transition:all 0.12s; font-family:inherit; text-align:left; color:inherit; }
.dh2-qa-item:hover { background:rgba(255,255,255,0.04); border-color:var(--teal); }
.dh2-qa-ico { font-size:16px; }
.dh2-qa-lbl { font-size:12.5px; font-weight:600; color:var(--text-primary); }

.dh2-bm-wrap { position:relative; aspect-ratio:1/1; max-width:100%;
  background:radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0,212,188,0.08), transparent 65%);
  border-radius:16px; margin:6px 0; display:flex; align-items:center; justify-content:center; }
.dh2-bm-wrap svg { width:100%; height:100%; max-width:280px; }
.dh2-bm-legend { display:flex; flex-wrap:wrap; gap:14px; margin-top:14px; padding-top:14px;
  border-top:1px solid var(--border); font-size:11.5px; color:var(--text-secondary); }
.dh2-bm-legend-item { display:flex; align-items:center; gap:7px; }
.dh2-bm-leg-dot { width:10px; height:10px; border-radius:50%; border:1.5px solid rgba(255,255,255,0.3); }
.dh2-bm-leg-dot.anode   { background:var(--teal);  border-color:rgba(255,255,255,0.6); }
.dh2-bm-leg-dot.cathode { background:var(--rose);  border-color:rgba(255,255,255,0.6); }
.dh2-bm-leg-dot.target  { background:rgba(74,158,255,0.3); border-color:var(--blue); border-style:dashed; }

.dh2-attn-row { display:flex; align-items:center; gap:10px; padding:10px 0;
  border-bottom:1px solid var(--border); cursor:pointer; transition:background 0.12s; }
.dh2-attn-row:last-child { border-bottom:none; }
.dh2-attn-row:hover { background:rgba(255,255,255,0.02); }
.dh2-attn-name { font-size:12.5px; font-weight:600; color:var(--text-primary); }
.dh2-attn-reason { font-size:10.5px; font-weight:600; margin-top:2px; }
    `;
    document.head.appendChild(_s2);
  }

  // ── Greeting ──────────────────────────────────────────────────────────────────
  const _hr = new Date().getHours();
  const _greetWord = _hr < 12 ? 'Good morning' : _hr < 18 ? 'Good afternoon' : 'Good evening';
  const _userName = (currentUser?.display_name || currentUser?.email || 'Clinician').split(/[\s@]/)[0];
  const _todaySessions = activeCourses.length;
  const _greetSub = `<strong style="color:var(--teal)">${_todaySessions} session${_todaySessions!==1?'s':''}</strong> in your active caseload · `
    + (pendingQueue.length > 0
        ? `<strong style="color:var(--amber)">${pendingQueue.length} item${pendingQueue.length!==1?'s':''}</strong> pending review`
        : `queue is clear`);

  // ── Demo banner ───────────────────────────────────────────────────────────────
  const _demoBanner = _isDemo ? `<div class="dh2-demo-banner">
    <span class="dh2-demo-pill">DEMO</span>
    <span>Showing sample data so you can explore the dashboard. Add a patient or course to see your own data here.</span>
    <button class="dh2-launch-btn" style="margin-left:auto" onclick="window._nav('patients')">Add Patient →</button>
  </div>` : '';
  const _failBanner = _apiFailCount > 0 ? `<div class="dh2-fail-banner">&#9888; Some live data could not be loaded. Showing what we have.</div>` : '';

  // ── Page head: greeting + week tab + export ───────────────────────────────────
  const _pageHead = `<div class="dh2-page-head">
    <div>
      <div class="dh2-greet">${_greetWord}, ${_esc(_userName)}.</div>
      <div class="dh2-greet-sub">${_greetSub}</div>
    </div>
    <div class="dh2-head-actions">
      <div class="dh2-tabrow" role="tablist" aria-label="Time range">
        <button role="tab" onclick="window._nav('clinic-day')">Day</button>
        <button role="tab" class="dh2-active" aria-selected="true">Week</button>
        <button role="tab" onclick="window._nav('reports-hub')">Month</button>
        <button role="tab" onclick="window._nav('reports-hub')">Quarter</button>
      </div>
      <button class="dh2-launch-btn" onclick="window._nav('reports-hub')">Export</button>
    </div>
  </div>`;

  // ── Alert strip (highest-tier urgent item if any) ─────────────────────────────
  const _topAlert = _urgentItems[0];
  const _alertStrip = !_topAlert ? '' : `<div class="dh2-alert-strip">
    <div class="dh2-alert-ico">&#9888;</div>
    <div class="dh2-alert-body">
      <div class="dh2-alert-title">${_esc(_topAlert.label)} · ${_topAlert.count} active</div>
      <div class="dh2-alert-sub">${_topAlert.tier === 1 ? 'Critical — stop-work item, action required now.' : _topAlert.tier === 2 ? 'High priority — review before next session.' : 'Monitoring — flagged for attention.'}</div>
    </div>
    <button class="dh2-launch-btn primary" onclick="window._nav('${_topAlert.nav}')">Review now</button>
  </div>`;

  // ── KPI grid ──────────────────────────────────────────────────────────────────
  const _phqDelta = outcomeSummary?.mean_phq9_delta != null ? outcomeSummary.mean_phq9_delta : null;
  const _phqDeltaStr = _phqDelta != null ? (_phqDelta > 0 ? '+' : '') + _phqDelta.toFixed(1) : '—';
  const _utilPct = sessionsPerWeek > 0 && activeCourses.length > 0
    ? Math.min(100, Math.round((totalDelivered / Math.max(1, activeCourses.reduce((s,c)=>s+(c.planned_sessions_total||0),0))) * 100))
    : 0;
  const _kpiGrid = `<div class="dh2-kpi-grid">
    <div class="dh2-kpi" ${_kb} onclick="window._nav('patients')">
      <div class="dh2-kpi-lbl"><span class="dh2-kpi-dot teal"></span>Active caseload</div>
      <div class="dh2-kpi-num">${activePatientIds.length || patCount}</div>
      <div class="dh2-kpi-delta ${activeCourses.length > 0 ? 'up' : 'flat'}">${activeCourses.length} active course${activeCourses.length!==1?'s':''}</div>
      <svg class="dh2-kpi-spark" viewBox="0 0 100 40" fill="none"><path d="M0 30 L14 24 L28 28 L42 18 L56 22 L70 12 L84 15 L100 6" stroke="#00d4bc" stroke-width="1.5"/></svg>
    </div>
    <div class="dh2-kpi" ${_kb} onclick="window._nav('courses')">
      <div class="dh2-kpi-lbl blue"><span class="dh2-kpi-dot blue"></span>Sessions delivered</div>
      <div class="dh2-kpi-num">${totalDelivered}<span class="unit">/ wk ${sessionsPerWeek}</span></div>
      <div class="dh2-kpi-delta ${_utilPct >= 70 ? 'up' : 'flat'}">${_utilPct}% utilization</div>
      <svg class="dh2-kpi-spark" viewBox="0 0 100 40" fill="none"><path d="M0 18 L14 20 L28 14 L42 22 L56 12 L70 16 L84 10 L100 14" stroke="#4a9eff" stroke-width="1.5"/></svg>
    </div>
    <div class="dh2-kpi" ${_kb} onclick="window._nav('outcomes')">
      <div class="dh2-kpi-lbl violet"><span class="dh2-kpi-dot violet"></span>Responder rate</div>
      <div class="dh2-kpi-num">${responderRate}</div>
      <div class="dh2-kpi-delta ${_phqDelta != null && _phqDelta < 0 ? 'up' : 'flat'}">PHQ-9 Δ ${_phqDeltaStr}</div>
      <svg class="dh2-kpi-spark" viewBox="0 0 100 40" fill="none"><path d="M0 10 L14 14 L28 18 L42 22 L56 20 L70 26 L84 30 L100 34" stroke="#9b7fff" stroke-width="1.5"/></svg>
    </div>
    <div class="dh2-kpi" ${_kb} onclick="window._nav('${pendingQueue.length > 0 ? 'review-queue' : 'outcomes'}')">
      <div class="dh2-kpi-lbl amber"><span class="dh2-kpi-dot amber"></span>Pending review</div>
      <div class="dh2-kpi-num">${pendingQueue.length}</div>
      <div class="dh2-kpi-delta ${flaggedCourses.length > 0 ? 'down' : 'flat'}">${flaggedCourses.length > 0 ? flaggedCourses.length + ' need re-render' : 'all current'}</div>
      <svg class="dh2-kpi-spark" viewBox="0 0 100 40" fill="none"><path d="M0 28 L14 24 L28 26 L42 18 L56 22 L70 16 L84 12 L100 14" stroke="#ffb547" stroke-width="1.5"/></svg>
    </div>
  </div>`;

  // ── Today's schedule (derived from courses if no localStorage queue) ─────────
  const _avClass = i => ['a','b','c','d','e'][i % 5];
  const _slotColor = i => ['','blue','violet','amber','rose'][i % 5];
  const _initialsOf = pt => ((pt?.first_name||'?')[0] + (pt?.last_name||'?')[0]).toUpperCase();
  const _dhApptQueue = (() => { try { return JSON.parse(localStorage.getItem('ds_today_queue') || '[]'); } catch { return []; } })();
  const _baseHour = 9;
  const _scheduleSlots = (_dhApptQueue.length > 0 ? _dhApptQueue.map((p, i) => ({
    time: p.time || `${String(_baseHour + i).padStart(2,'0')}:00`,
    name: p.patientName || 'Patient',
    initials: (p.patientName || 'PT').split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase(),
    chips: [
      { cls: ['teal','blue','violet','amber'][i % 4], txt: p.protocol || 'Session' },
      { cls: '', txt: p.condition || '' },
    ].filter(c => c.txt),
    patientId: p.patientId,
    courseId: '',
    slotClass: _slotColor(i),
    avClass: _avClass(i),
  })) : activeCourses.slice(0, 6).map((c, i) => {
    const pt = patientMap[c.patient_id];
    const pName = pt ? `${pt.first_name||''} ${pt.last_name||''}`.trim() : (c._patientName || 'Patient');
    return {
      time: `${String(_baseHour + i).padStart(2,'0')}:${i % 2 === 0 ? '00' : '30'}`,
      name: pName,
      initials: _initialsOf(pt),
      chips: [
        { cls: ['teal','blue','violet','amber','rose'][i % 5], txt: `${c.modality_slug || 'Session'} · ${c.sessions_delivered||0}/${c.planned_sessions_total||'?'}` },
        { cls: '', txt: (c.condition_slug || '').replace(/-/g,' ') },
      ].filter(c => c.txt),
      patientId: c.patient_id,
      courseId: c.id,
      slotClass: _slotColor(i),
      avClass: _avClass(i),
    };
  }));

  const _scheduleCard = `<div class="dh2-card">
    <div class="dh2-card-hd">
      <div>
        <div class="dh2-card-title">Today's schedule</div>
        <div class="dh2-card-sub">${_scheduleSlots.length} session${_scheduleSlots.length!==1?'s':''} · ${new Date().toLocaleDateString('en-GB',{weekday:'long', day:'numeric', month:'short'})}</div>
      </div>
      <div class="dh2-card-actions">
        <button class="dh2-launch-btn" onclick="window._nav('scheduling-hub')">Open schedule →</button>
      </div>
    </div>
    <div class="dh2-sched">
      ${_scheduleSlots.map(s => `
        <div class="dh2-sched-time">${_esc(s.time)}</div>
        <div class="dh2-sched-slot ${s.slotClass}" onclick="${s.patientId ? `window._selectedPatientId='${_esc(s.patientId)}';window._nav('patient-profile')` : `window._nav('scheduling-hub')`}">
          <div class="dh2-sched-pt">
            <div class="dh2-pt-av ${s.avClass}">${_esc(s.initials)}</div>
            <div style="min-width:0">
              <div class="dh2-sched-pt-name">${_esc(s.name)}</div>
              <div class="dh2-sched-pt-proto">${s.chips.map(c => `<span class="dh2-chip ${c.cls}">${_esc(c.txt)}</span>`).join('')}</div>
            </div>
          </div>
          <button class="dh2-launch-btn primary" onclick="event.stopPropagation();${s.patientId ? `window._selectedPatientId='${_esc(s.patientId)}';` : ''}${s.courseId ? `window._startCourseSession('${_esc(s.courseId)}')` : `window._nav('session-execution')`}">Launch →</button>
        </div>`).join('')}
      ${_scheduleSlots.length === 0 ? `
        <div class="dh2-sched-time">—</div>
        <div class="dh2-sched-slot empty" onclick="window._cdAddWalkin?.() || window._nav('clinic-day')">Open schedule · add session</div>
      ` : ''}
    </div>
  </div>`;

  // ── Brain map card ───────────────────────────────────────────────────────────
  let _brainSvg = '';
  try { _brainSvg = brainMapSVG('alpha'); } catch { _brainSvg = ''; }
  const _brainCard = `<div class="dh2-card">
    <div class="dh2-card-hd">
      <div>
        <div class="dh2-card-title">Active targets · today</div>
        <div class="dh2-card-sub">10-20 overlay · ${activeCourses.length} course${activeCourses.length!==1?'s':''}</div>
      </div>
      <button class="dh2-launch-btn" onclick="window._nav('brain-map-planner')">Open planner →</button>
    </div>
    <div class="dh2-bm-wrap">${_brainSvg || '<div style="color:var(--text-tertiary);font-size:12px">No targets</div>'}</div>
    <div class="dh2-bm-legend">
      <div class="dh2-bm-legend-item"><span class="dh2-bm-leg-dot anode"></span>Anode</div>
      <div class="dh2-bm-legend-item"><span class="dh2-bm-leg-dot cathode"></span>Cathode</div>
      <div class="dh2-bm-legend-item"><span class="dh2-bm-leg-dot target"></span>Target</div>
    </div>
  </div>`;

  // ── Caseload table ───────────────────────────────────────────────────────────
  const _caseRows = clinicQueue.length === 0
    ? `<div class="dh2-queue-row" style="cursor:default"><div style="color:var(--text-tertiary);font-size:12px">No active caseload yet.</div></div>`
    : clinicQueue.slice(0, 8).map((c, i) => {
        const pt = patientMap[c.patient_id];
        const pName = pt ? `${pt.first_name||''} ${pt.last_name||''}`.trim() : (c._patientName || 'Patient');
        const pct = c.planned_sessions_total > 0 ? Math.min(100, Math.round((c.sessions_delivered || 0) / c.planned_sessions_total * 100)) : 0;
        const hasFlag = (c.governance_warnings || []).length > 0;
        const stage = c._qStatus === 'paused' ? { cls: 'amber', txt: 'Paused' }
                    : c._qStatus === 'pending' ? { cls: 'blue', txt: 'Pending review' }
                    : c._qStatus === 'approved' ? { cls: 'violet', txt: 'Approved · ready' }
                    : hasFlag ? { cls: 'amber', txt: 'Safety flag' }
                    : pct >= 90 ? { cls: 'green', txt: 'Discharge plan ready' }
                    : { cls: 'green', txt: 'On track' };
        const cid = (c.id || '').replace(/['"]/g,'');
        return `<div class="dh2-queue-row" onclick="window._openCourse('${_esc(cid)}')">
          <div class="dh2-queue-pt">
            <div class="dh2-pt-av ${_avClass(i)}">${_esc(_initialsOf(pt) || pName.slice(0,2).toUpperCase())}</div>
            <div style="min-width:0">
              <div class="dh2-queue-pt-name">${_esc(pName)}</div>
              <div class="dh2-queue-pt-cond">${_esc((c.condition_slug || '').replace(/-/g,' ') || '—')}</div>
            </div>
          </div>
          <div><span class="dh2-chip ${['teal','blue','violet','amber','rose'][i % 5]}">${_esc(c.modality_slug || '—')}</span></div>
          <div class="dh2-queue-prog">
            <div class="dh2-queue-prog-bar"><div style="width:${pct}%"></div></div>
            <span class="dh2-queue-prog-num">${c.sessions_delivered || 0}/${c.planned_sessions_total || '—'}</span>
          </div>
          <div><span class="dh2-chip ${stage.cls}">${_esc(stage.txt)}</span></div>
          <div style="text-align:right"><button class="dh2-iconbtn" onclick="event.stopPropagation();window._openCourse('${_esc(cid)}')">→</button></div>
        </div>`;
      }).join('');

  const _caseCard = `<div class="dh2-card">
    <div class="dh2-card-hd">
      <div>
        <div class="dh2-card-title">Active patient caseload</div>
        <div class="dh2-card-sub">Sorted by clinical urgency</div>
      </div>
      <div class="dh2-card-actions">
        <button class="dh2-launch-btn" onclick="window._nav('patients')">All patients →</button>
      </div>
    </div>
    <div class="dh2-queue-row head">
      <div>Patient · Condition</div>
      <div>Protocol</div>
      <div>Progress</div>
      <div>Next step</div>
      <div></div>
    </div>
    ${_caseRows}
  </div>`;

  // ── Evidence governance card ─────────────────────────────────────────────────
  const _modalitiesShown = topModalities.length > 0
    ? topModalities.slice(0, 4)
    : (allCourses.length > 0 ? [['mixed', allCourses.length]] : []);
  const _evGrade = m => allCourses.find(c => c.modality_slug === m)?.evidence_grade || 'B';
  const _evidenceCard = `<div class="dh2-card">
    <div class="dh2-card-hd">
      <div>
        <div class="dh2-card-title">Evidence governance</div>
        <div class="dh2-card-sub">Active modalities · grade snapshot</div>
      </div>
      <span class="dh2-chip ${flaggedCourses.length === 0 ? 'teal' : 'amber'}">${flaggedCourses.length === 0 ? 'All current' : flaggedCourses.length + ' flagged'}</span>
    </div>
    <div class="dh2-evidence-list">
      ${_modalitiesShown.length === 0
        ? `<div style="color:var(--text-tertiary);font-size:12px;padding:8px 0">No active modalities yet.</div>`
        : _modalitiesShown.map(([mod, n]) => {
            const grade = _evGrade(mod);
            return `<div class="dh2-evidence-item" onclick="window._nav('protocol-hub')">
              <div class="dh2-evidence-grade ${grade.toLowerCase()}">${_esc(grade)}</div>
              <div>
                <div class="dh2-evidence-name">${_esc(mod)}</div>
                <div class="dh2-evidence-meta">${n} active course${n!==1?'s':''} · registry pinned</div>
              </div>
              <button class="dh2-iconbtn" onclick="event.stopPropagation();window._nav('protocol-hub')">→</button>
            </div>`;
          }).join('')}
    </div>
  </div>`;

  // ── Quick actions card ───────────────────────────────────────────────────────
  const _qaItems = [
    { ico: '＋', lbl: 'Add Patient',     nav: 'patients',        show: !_isReadonly },
    { ico: '✎',  lbl: 'New Course',      nav: 'protocol-wizard', show: _isFullAccess },
    { ico: '◉',  lbl: 'Assessments',     nav: 'assessments-hub', show: !_isReadonly },
    { ico: '🧠', lbl: 'Brain Map',       nav: 'brain-map-planner', show: !_isReadonly },
    { ico: '◎',  lbl: 'Review Queue',    nav: 'review-queue',    show: _isFullAccess },
    { ico: '📊', lbl: 'Reports',         nav: 'reports-hub',     show: true },
  ].filter(a => a.show);
  const _qaCard = _isReadonly ? '' : `<div class="dh2-card">
    <div class="dh2-card-hd"><div><div class="dh2-card-title">Quick actions</div></div></div>
    <div class="dh2-qa-grid">
      ${_qaItems.map(a => `<button class="dh2-qa-item" onclick="window._nav('${a.nav}')">
        <span class="dh2-qa-ico">${a.ico}</span>
        <span class="dh2-qa-lbl">${a.lbl}</span>
      </button>`).join('')}
    </div>
  </div>`;

  // ── Needs attention card ─────────────────────────────────────────────────────
  const _attnCard = (!_isFullAccess || patientsNeedingAttention.length === 0) ? '' : `<div class="dh2-card">
    <div class="dh2-card-hd">
      <div><div class="dh2-card-title">Needs attention</div><div class="dh2-card-sub">${patientsNeedingAttention.length} flagged</div></div>
      <button class="dh2-launch-btn" onclick="window._nav('patients')">All →</button>
    </div>
    <div>
      ${patientsNeedingAttention.slice(0, 5).map(({id, pt}) => {
        const r = _attentionReason(id);
        return `<div class="dh2-attn-row" onclick="window.openPatient('${_esc(id)}')">
          <div class="dh2-pt-av a">${_esc(_initialsOf(pt))}</div>
          <div style="flex:1;min-width:0">
            <div class="dh2-attn-name">${_esc((pt.first_name||'') + ' ' + (pt.last_name||''))}</div>
            <div class="dh2-attn-reason" style="color:${r.color}">${_esc(r.label)}</div>
          </div>
          <span style="color:var(--text-tertiary);font-size:13px">→</span>
        </div>`;
      }).join('')}
    </div>
  </div>`;

  // ── Final V2 layout ──────────────────────────────────────────────────────────
  if (_abortCtrl.signal.aborted) { window.removeEventListener('hashchange', _onLeave); return; }
  el.innerHTML = `<div class="dh2-wrap">`
    + _demoBanner
    + _failBanner
    + _pageHead
    + _alertStrip
    + _kpiGrid
    + `<div class="dh2-row-2-1">` + _scheduleCard + _brainCard + `</div>`
    + `<div class="dh2-row-3-2">`
      + _caseCard
      + `<div style="display:flex;flex-direction:column;gap:16px">` + _evidenceCard + _qaCard + _attnCard + `</div>`
    + `</div>`
    + (_isFullAccess ? dashAgentStrip : '')
  + `</div>`;
  window.removeEventListener('hashchange', _onLeave);

  window._dashAgentOpen = function() {
    const m = document.getElementById('dash-agent-modal');
    if (m) {
      m.style.display = 'flex';
      requestAnimationFrame(() => m.classList.add('dash-agent-modal--open'));
    }
  };
  window._dashAgentClose = function() {
    const m = document.getElementById('dash-agent-modal');
    if (m) {
      m.classList.remove('dash-agent-modal--open');
      setTimeout(() => { if (m) m.style.display = 'none'; }, 220);
    }
  };
  window._dashAgentAsk = function(q) {
    const inp = document.getElementById('dash-agent-inp');
    if (inp) inp.value = typeof q === 'string' ? q : '';
    window._dashAgentSend();
  };
  window._dashAgentSend = async function() {
    const inp = document.getElementById('dash-agent-inp');
    const q = (inp && inp.value ? inp.value : '').trim();
    if (!q) return;
    if (inp) inp.value = '';
    const resp = document.getElementById('dash-agent-resp');
    if (!resp) return;
    resp.style.display = 'block';
    resp.innerHTML = '<div class="ptd-asst-thinking">Thinking…</div>';
    try {
      const result = await api.chatAgent(
        [{ role: 'user', content: q }],
        'anthropic',
        null,
        window._dashAgentCtx || '',
      );
      const answer = result?.reply || 'No response.';
      const safe = String(answer).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      resp.innerHTML = '<div class="ptd-asst-answer">' + safe + '</div>';
    } catch (_e) {
      resp.innerHTML = '<div class="ptd-asst-answer">Assistant unavailable. Try again later.</div>';
    }
  };
}


// ── Enriched course row (dashboard clinic queue, includes patient name) ────
function _dCourseRowRich(c, statusKey) {
  const dotColor = { active: 'var(--teal)', pending_approval: 'var(--amber)', paused: 'var(--amber)', approved: 'var(--blue)' }[statusKey] || 'var(--text-tertiary)';
  const pct = c.planned_sessions_total > 0 ? Math.min(100, Math.round((c.sessions_delivered || 0) / c.planned_sessions_total * 100)) : 0;
  const btn = statusKey === 'active'
    ? `<button class="btn btn-sm" style="font-size:10.5px;padding:3px 8px;flex-shrink:0" onclick="event.stopPropagation();window._nav('session-execution')">Execute →</button>`
    : statusKey === 'pending_approval'
    ? `<button class="btn btn-sm" style="font-size:10.5px;padding:3px 8px;flex-shrink:0;color:var(--amber)" onclick="event.stopPropagation();window._nav('review-queue')">Review →</button>`
    : statusKey === 'paused'
    ? `<span style="font-size:10px;color:var(--amber);flex-shrink:0">Paused</span>`
    : `<span style="font-size:10px;color:var(--blue);flex-shrink:0">${statusKey}</span>`;
  return `<div style="display:flex;align-items:center;gap:10px;padding:9px 16px;border-bottom:1px solid var(--border);cursor:pointer"
      onclick="window._openCourse('${c.id}')"
      onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background=''">
    <span style="width:6px;height:6px;border-radius:50%;background:${dotColor};flex-shrink:0"></span>
    <div style="flex:1;min-width:0">
      <div style="font-size:12.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
        ${c._patientName ? `<span style="color:var(--text-secondary)">${c._patientName}</span> · ` : ''}${c.condition_slug?.replace(/-/g, ' ') || '—'}
      </div>
      <div style="font-size:10.5px;color:var(--text-tertiary);margin-top:1px;display:flex;align-items:center;gap:5px">
        <span style="color:var(--teal)">${c.modality_slug || '—'}</span>
        <span>· Session ${c.sessions_delivered || 0}/${c.planned_sessions_total || '?'}</span>
        ${(c.governance_warnings || []).length ? '<span style="color:var(--red)">⚠</span>' : ''}
        ${c.on_label === false ? '<span style="color:var(--amber)">off-label</span>' : ''}
      </div>
    </div>
    ${btn}
  </div>`;
}

// ── Patients ─────────────────────────────────────────────────────────────────
export async function pgPatients(setTopbar, navigate) {
  const canAddPatient = ['clinician', 'admin', 'clinic-admin', 'supervisor'].includes(currentUser?.role);
  const canTransfer   = ['admin', 'clinic-admin'].includes(currentUser?.role);
  setTopbar('Patients',
    canAddPatient
      ? `<button class="btn btn-sm" onclick="window.showImportCSV()" style="margin-right:6px">Import CSV</button><button class="btn btn-sm" onclick="window.showFHIRImport()" style="margin-right:6px">Import FHIR</button><button class="btn btn-primary btn-sm" onclick="window.showAddPatient()">+ New Patient</button>`
      : ''
  );

  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let items = [], conditions = [], modalities = [], allCourses = [];
  try {
    const [patientsRes, condRes, modRes, coursesRes] = await Promise.all([
      api.listPatients().catch(() => null),
      api.conditions().catch(() => null),
      api.modalities().catch(() => null),
      (api.listCourses ? api.listCourses({}) : Promise.resolve(null)).catch(() => null),
    ]);
    items      = patientsRes?.items || [];
    conditions = condRes?.items     || [];
    modalities = modRes?.items      || [];
    allCourses = coursesRes?.items  || [];
    if (!patientsRes) {
      el.innerHTML = `<div class="notice notice-warn">Could not load patients.</div>`;
      return;
    }
  } catch (e) {
    el.innerHTML = `<div class="notice notice-warn">Could not load patients: ${e.message}</div>`;
    return;
  }

  // ── Detect demo-seeded patients (server prefixes notes with "[DEMO]" and
  //    sets a demo_seed flag on PatientOut). A visible banner informs
  //    clinicians they're looking at sample data, not real records.
  const _demoPatientCount = items.filter(p => p.demo_seed || (p.notes || '').startsWith('[DEMO]')).length;

  // ── Enrich patients with course data + attention signals ─────────────────
  const _coursesByPat = {};
  for (const c of allCourses) {
    if (!c.patient_id) continue;
    (_coursesByPat[c.patient_id] = _coursesByPat[c.patient_id] || []).push(c);
  }
  function _patCourseStats(p) {
    const cs = _coursesByPat[p.id] || [];
    return {
      activeCourses: cs.filter(c => c.status === 'active' || c.status === 'in_progress'),
      sessTotal: cs.reduce((n, c) => n + (c.total_sessions || c.session_count || 0), 0),
      sessDone:  cs.reduce((n, c) => n + (c.completed_sessions || c.sessions_done || 0), 0),
    };
  }
  function _patAttention(p) {
    const { activeCourses } = _patCourseStats(p);
    if (p.outcome_trend === 'worsened')               return { type:'outcome',    label:'\u2B07 Worsened',        color:'var(--red)'           };
    if (p.has_adverse_event || p.adverse_event_flag)  return { type:'ae',         label:'\u26A0 Side Effect',      color:'var(--red)'           };
    if (p.needs_review || p.review_overdue)           return { type:'review',     label:'\u25C9 Needs Review',     color:'var(--amber)'         };
    if (p.assessment_overdue || p.missing_assessment) return { type:'assessment', label:'\u270E Assessment Due',   color:'var(--amber)'         };
    if (activeCourses.length && p.last_session_date) {
      const d = Math.floor((Date.now() - new Date(p.last_session_date)) / 86400000);
      if (d >= 14) return { type:'missed', label: d + 'd no session', color:'var(--amber)' };
    }
    if (p.wearable_disconnected)                      return { type:'wearable',   label:'\u25CC Wearable Off',     color:'var(--text-tertiary)' };
    if (p.home_adherence != null && p.home_adherence < 0.5) return { type:'adherence', label: Math.round(p.home_adherence * 100) + '% adherence', color:'var(--amber)' };
    if (p.call_requested)                             return { type:'call',       label:'\u260F Call Req.',        color:'var(--blue)'          };
    return null;
  }
  const _statActive = items.filter(p => p.status === 'active').length;
  const _statReview = items.filter(p => p.needs_review || p.review_overdue).length;
  const _statAlerts = items.filter(p => { const a = _patAttention(p); return a && (a.type === 'outcome' || a.type === 'ae'); }).length;
  const _statAssess = items.filter(p => p.assessment_overdue || p.missing_assessment).length;
  const _statToday  = items.reduce((n, p) => n + (p.sessions_today || 0), 0);

  // Build registry-backed option lists; fall back to static if registry unavailable
  const conditionOptions = conditions.length
    ? conditions.map(c => `<option value="${c.name || c.Condition_Name}">${c.name || c.Condition_Name}</option>`).join('')
    : FALLBACK_CONDITIONS.map(c => `<option>${c}</option>`).join('');

  const modalityOptions = modalities.length
    ? modalities.map(m => `<option value="${m.name || m.Modality_Name}">${m.name || m.Modality_Name}</option>`).join('')
    : FALLBACK_MODALITIES.map(m => `<option>${m}</option>`).join('');

  // ── Backend cohort count aggregates (async, optional) ─────────────────────
  async function _fetchCohortCounts() {
    try {
      const res = await api.getClinicAlertSummary?.().catch(() => null);
      if (res && typeof res === 'object') {
        return {
          active:     res.active_patients       ?? null,
          review:     res.needs_review          ?? null,
          alerts:     res.urgent_alerts         ?? null,
          assess:     res.overdue_assessments   ?? null,
          today:      res.sessions_today        ?? null,
          adherence:  res.low_adherence         ?? null,
          wearable:   res.wearable_issues       ?? null,
          ae:         res.side_effects          ?? null,
        };
      }
    } catch {}
    return null;
  }

  // ── Cohort definitions ──────────────────────────────────────────────────────
  const _thirtyDaysAgo = Date.now() - 30 * 86400000;
  const _cohorts = [
    { id: 'all',        label: 'All Patients',          count: items.length },
    { id: 'active',     label: 'Active Patients',        count: items.filter(p => p.status === 'active').length },
    { id: 'today',      label: 'Sessions Today',         count: items.filter(p => (p.sessions_today || 0) > 0).length },
    { id: 'review',     label: 'Needs Review',           count: items.filter(p => p.needs_review || p.review_overdue).length },
    { id: 'assessment', label: 'Overdue Assessments',    count: items.filter(p => p.assessment_overdue || p.missing_assessment).length },
    { id: 'ae',         label: 'Side Effects / AE',      count: items.filter(p => p.has_adverse_event || p.adverse_event_flag).length },
    { id: 'adherence',  label: 'Low Adherence (<50%)',   count: items.filter(p => p.home_adherence != null && p.home_adherence < 0.5).length },
    { id: 'wearable',   label: 'Wearable Issues',        count: items.filter(p => p.wearable_disconnected).length },
    { id: 'call',       label: 'Awaiting Reply',         count: items.filter(p => p.call_requested).length },
    { id: 'offlabel',   label: 'Off-label Review',       count: items.filter(p => p.off_label_flag || p.offlabel_review).length },
    { id: 'recent',     label: 'Recently Added (30d)',   count: items.filter(p => p.created_at && new Date(p.created_at).getTime() >= _thirtyDaysAgo).length },
    { id: 'discharged', label: 'Discharged / Completed', count: items.filter(p => p.status === 'completed' || p.status === 'discharged').length },
  ];

  el.innerHTML = `
  <!-- ── Hidden modal panels ─────────────────────────────────────────── -->

  <!-- CSV Import Panel (modal) -->
  <div id="csv-import-panel" style="display:none;position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,0.55);align-items:center;justify-content:center">
    <div class="card" style="width:min(680px,95vw);max-height:85vh;overflow-y:auto;position:relative">
      <div class="card-header">
        <h3>Import Patients from CSV</h3>
        <button class="btn btn-sm" onclick="window.showImportCSV()">Close</button>
      </div>
      <div class="card-body">
        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
          <button class="btn btn-sm" onclick="window.downloadPatientTemplate()">Download Template</button>
          <button class="btn btn-sm" id="csv-paste-toggle" onclick="window.toggleCSVPaste()">Paste CSV Text</button>
        </div>
        <div id="csv-drop-zone" style="border:2px dashed var(--border);border-radius:8px;padding:28px;text-align:center;cursor:pointer;transition:border-color 0.2s;color:var(--text-tertiary);font-size:13px" onclick="document.getElementById('csv-file-input').click()">
          <div style="font-size:22px;margin-bottom:8px;opacity:.5">↑</div>
          Drag &amp; drop a CSV file here or <strong style="color:var(--teal)">click to browse</strong>
          <div style="font-size:11px;margin-top:4px">Expected columns: first_name, last_name, email, date_of_birth, gender, primary_condition, primary_modality, clinician_notes</div>
        </div>
        <input type="file" id="csv-file-input" accept=".csv,.txt" style="display:none">
        <div id="csv-paste-area" style="display:none;margin-top:10px">
          <textarea id="csv-paste-text" class="form-control" rows="5" placeholder="Paste CSV text here (with header row)…"></textarea>
          <button class="btn btn-primary btn-sm" style="margin-top:6px" onclick="window.parseCSVInput(document.getElementById('csv-paste-text').value)">Parse</button>
        </div>
        <div id="csv-parse-notice" style="margin-top:10px;display:none"></div>
        <div id="csv-preview-section" style="display:none;margin-top:12px">
          <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px" id="csv-preview-label">Preview</div>
          <div style="overflow-x:auto;max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:6px">
            <table class="ds-table" id="csv-preview-table" style="font-size:11.5px"></table>
          </div>
          <div style="margin-top:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <button class="btn btn-primary" id="csv-import-btn" onclick="window.runPatientImport()">Import Patients</button>
            <span id="csv-import-count" style="font-size:12px;color:var(--text-secondary)"></span>
          </div>
          <div style="margin-top:8px;display:none" id="csv-progress-wrap">
            <div style="height:6px;border-radius:3px;background:var(--border)"><div id="csv-progress-bar" style="height:6px;border-radius:3px;background:var(--teal);width:0%;transition:width 0.3s"></div></div>
            <div id="csv-progress-label" style="font-size:11px;color:var(--text-tertiary);margin-top:4px"></div>
          </div>
          <div id="csv-import-result" style="margin-top:8px;display:none"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- FHIR Import Panel (modal) -->
  <div id="fhir-import-panel" style="display:none;position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,0.55);align-items:center;justify-content:center">
    <div class="card" style="width:min(560px,95vw);max-height:85vh;overflow-y:auto">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <span>Import HL7 FHIR Patient</span>
        <button class="btn btn-sm" onclick="window.showFHIRImport()">Close</button>
      </div>
      <div class="card-body">
        <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center">
          <label class="form-label" style="margin:0;font-size:12.5px">Paste HL7 FHIR Patient JSON here</label>
          <button class="btn btn-sm" onclick="window.fhirLoadExample()" style="margin-left:auto">Load Example</button>
        </div>
        <textarea id="fhir-json-input" class="form-control" rows="7" style="font-family:var(--font-mono);font-size:12px" placeholder='{ "resourceType": "Patient", "name": [{ "family": "Smith", "given": ["Jane"] }], ... }'></textarea>
        <div style="margin-top:10px;display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="window.parseFHIRInput()">Parse</button>
          <span id="fhir-parse-error" style="font-size:12px;color:var(--red);display:none"></span>
        </div>
        <div id="fhir-preview" style="display:none;margin-top:14px">
          <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Extracted Patient Data</div>
          <div id="fhir-preview-fields" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px"></div>
          <div id="fhir-save-error" style="font-size:12px;color:var(--red);margin-bottom:8px;display:none"></div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn btn-primary btn-sm" onclick="window.createPatientFromFHIR()">Create Patient</button>
            <span id="fhir-save-status" style="font-size:12px;color:var(--text-secondary)"></span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Add Patient Panel (modal) -->
  <div id="add-patient-panel" style="display:none;position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,0.55);align-items:center;justify-content:center">
    <div class="card" style="width:min(700px,95vw);max-height:90vh;overflow-y:auto">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <h3>New Patient</h3>
        <button class="btn btn-sm" onclick="document.getElementById('add-patient-panel').style.display='none'">Close</button>
      </div>
      <div class="card-body">
        <p style="font-size:11.5px;color:var(--text-tertiary);margin-bottom:14px">Fields marked <span style="color:var(--red)">*</span> are required.</p>
        <div class="g2">
          <div>
            <div class="form-group"><label class="form-label">First Name <span style="color:var(--red)">*</span></label><input id="np-first" class="form-control" placeholder="First name"></div>
            <div class="form-group"><label class="form-label">Last Name <span style="color:var(--red)">*</span></label><input id="np-last" class="form-control" placeholder="Last name"></div>
            <div class="form-group"><label class="form-label">Date of Birth <span style="color:var(--red)">*</span></label><input id="np-dob" class="form-control" type="date"></div>
            <div class="form-group"><label class="form-label">Gender</label>
              <select id="np-gender" class="form-control"><option value="">Select…</option><option>Male</option><option>Female</option><option>Non-binary</option><option>Prefer not to say</option></select>
            </div>
          </div>
          <div>
            <div class="form-group"><label class="form-label">Email</label><input id="np-email" class="form-control" type="email" placeholder="patient@email.com"></div>
            <div class="form-group"><label class="form-label">Primary Condition</label>
              <select id="np-condition" class="form-control">
                <option value="">Select condition…</option>
                ${conditionOptions}
              </select>
            </div>
            <div class="form-group"><label class="form-label">Primary Modality</label>
              <select id="np-modality" class="form-control">
                <option value="">Select modality…</option>
                ${modalityOptions}
              </select>
            </div>
            <div class="form-group"><label class="form-label">Notes</label><textarea id="np-notes" class="form-control" placeholder="Clinical notes…"></textarea></div>
          </div>
        </div>
        <div id="np-error" style="color:var(--red);font-size:12px;margin-bottom:10px;display:none"></div>
        <div style="display:flex;gap:8px">
          <button class="btn" onclick="document.getElementById('add-patient-panel').style.display='none'">Cancel</button>
          <button class="btn btn-primary" onclick="window.saveNewPatient()">Save Patient</button>
        </div>
      </div>
    </div>
  </div>

  <!-- AI Intake Parser (hidden modal) -->
  <div id="intake-parser-modal" style="display:none;position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,0.55);align-items:center;justify-content:center">
    <div class="card" style="width:min(600px,95vw);max-height:88vh;overflow-y:auto">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <h3>AI Intake Parser <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:rgba(74,158,255,0.1);color:var(--blue);margin-left:6px">Beta</span></h3>
        <button class="btn btn-sm" onclick="document.getElementById('intake-parser-modal').style.display='none'">Close</button>
      </div>
      <div class="card-body">
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Upload or paste a referral letter / intake form to extract patient data using AI.</p>
        <div id="intake-pdf-drop" style="border:2px dashed var(--border);border-radius:8px;padding:24px;text-align:center;cursor:pointer;transition:border-color 0.2s;color:var(--text-tertiary);font-size:13px;margin-bottom:10px" onclick="document.getElementById('intake-file-input').click()">
          <div style="font-size:20px;margin-bottom:6px;opacity:.5">⬆</div>
          Drag &amp; drop PDF or TXT file, or <strong style="color:var(--teal)">click to browse</strong>
          <div style="font-size:11px;margin-top:4px">Note: PDF text layer only. If garbled, use paste below.</div>
        </div>
        <input type="file" id="intake-file-input" accept=".pdf,.txt" style="display:none">
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px;text-align:center">— or paste text —</div>
        <textarea id="intake-paste-text" class="form-control" rows="5" placeholder="Paste intake notes, referral letter, or clinical summary here…" style="font-size:12px"></textarea>
        <div id="intake-parse-notice" style="margin-top:8px;display:none"></div>
        <button class="btn btn-primary" style="margin-top:10px;width:100%" id="intake-extract-btn" onclick="window.runIntakeParse()">Extract Patient Data →</button>
        <div id="intake-result-panel" style="display:none;margin-top:14px">
          <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Extraction Result</div>
          <div id="intake-result-content" style="font-size:12px;color:var(--text-secondary);line-height:1.7;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:6px;padding:12px;white-space:pre-wrap"></div>
          <button class="btn btn-sm" style="margin-top:8px" onclick="window.prefillPatientFromIntake()">Create Patient from Extraction →</button>
        </div>
      </div>
    </div>
  </div>

  ${_demoPatientCount > 0 ? `
  <div id="pat-demo-banner" role="status" style="display:flex;align-items:center;gap:10px;padding:8px 14px;margin:0 0 12px 0;background:linear-gradient(90deg,rgba(245,158,11,0.12),rgba(245,158,11,0.04));border:1px solid rgba(245,158,11,0.45);border-radius:8px;font-size:12px;color:var(--amber,#f59e0b)">
    <span style="font-size:14px">&#9888;</span>
    <strong style="font-weight:700;letter-spacing:.4px;text-transform:uppercase;font-size:11px">Demo Data</strong>
    <span style="color:var(--text-secondary)">${_demoPatientCount} sample patient${_demoPatientCount === 1 ? '' : 's'} shown for demonstration. Records with a <code style="background:rgba(0,0,0,0.2);padding:1px 4px;border-radius:3px">[DEMO]</code> note prefix are not real and will be excluded from clinical reports.</span>
  </div>` : ''}

  <!-- ── 3-Column Master-Detail Layout ──────────────────────────────────── -->
  <div class="pat-master-detail">

    <!-- LEFT RAIL: Cohort filters -->
    <div class="pat-left-rail">
      <div class="pat-left-rail-title">Cohorts</div>
      ${_cohorts.map(c => `
        <div class="pat-cohort-item${c.id === 'all' ? ' active' : ''}" id="pat-cohort-${c.id}" onclick="window._patSetCohort('${c.id}')">
          <span>${c.label}</span>
          <span class="pat-cohort-count" id="pat-cohort-count-${c.id}">${c.count}</span>
        </div>`).join('')}
    </div>

    <!-- CENTER: Searchable patient roster -->
    <div class="pat-center">
      <div class="pat-center-header">
        <input class="form-control" id="pt-search" placeholder="Search name, condition, email…" style="flex:1;min-width:160px" oninput="window.filterPatients()">
        <select class="form-control" id="pt-status-filter" style="width:120px;flex-shrink:0" onchange="window.filterPatients()">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="inactive">Inactive</option>
          <option value="completed">Completed</option>
        </select>
        <select class="form-control" id="pt-modality-filter" style="width:140px;flex-shrink:0" onchange="window.filterPatients()">
          <option value="">All Modalities</option>
          ${FALLBACK_MODALITIES.map(m => `<option>${m}</option>`).join('')}
        </select>
        <span id="pt-count" style="font-size:11px;color:var(--text-tertiary);white-space:nowrap">${items.length} patients</span>
      </div>
      <div id="pat-roster">${
        items.length === 0
          ? emptyState('\u{1F465}', 'No patients yet', canAddPatient ? 'Add your first patient to get started.' : '', canAddPatient ? '+ Add Patient' : null, canAddPatient ? 'window.showAddPatient()' : null)
          : items.map(p => _patCard(p, _patAttention(p), _patCourseStats(p), canTransfer)).join('')
      }</div>
    </div>

    <!-- RIGHT PANEL: Selected patient detail -->
    <div class="pat-right-panel" id="pat-right-panel">
      <div class="pat-rp-empty" id="pat-rp-empty">
        <div class="pat-rp-empty-icon">&#9670;</div>
        <div style="font-size:13px;font-weight:600;color:var(--text-secondary)">No patient selected</div>
        <div style="font-size:11.5px">Select a patient to view summary</div>
      </div>
      <div id="pat-rp-detail" style="display:none"></div>
    </div>

  </div>`;

  window._patientsData    = items;
  window._patQuickFilter  = 'all';
  window._patCohortFilter = 'all';
  window._patSelected     = null;

  // ── Update cohort counts from backend aggregate (fire-and-forget) ──────────
  _fetchCohortCounts().then(bc => {
    if (!bc) return;
    const _countMap = {
      active:     bc.active,
      review:     bc.review,
      assessment: bc.assess,
      ae:         bc.ae,
      today:      bc.today,
      adherence:  bc.adherence,
      wearable:   bc.wearable,
    };
    Object.entries(_countMap).forEach(([cohortId, val]) => {
      if (val == null) return;
      const el2 = document.getElementById('pat-cohort-count-' + cohortId);
      if (el2) el2.textContent = val;
    });
  }).catch(() => {});

  // ── Patient card renderer (master-detail version) ─────────────────────────
  function _patCard(p, att, cs, canTransferFlag) {
    att = att || _patAttention(p);
    cs  = cs  || _patCourseStats(p);
    const name    = (p.first_name || '') + ' ' + (p.last_name || '');
    const age     = p.dob ? Math.floor((Date.now() - new Date(p.dob)) / 31557600000) + 'y' : '';
    const progPct = cs.sessTotal ? Math.round((cs.sessDone / cs.sessTotal) * 100) : 0;
    const activeCourse = cs.activeCourses[0];
    const courseInfo = cs.activeCourses.length
      ? '<span class="pat-course-info">' + (activeCourse?.name || cs.activeCourses.length + ' active course' + (cs.activeCourses.length > 1 ? 's' : '')) + '</span>'
      : '<span class="pat-course-info pat-course-info--none">No active course</span>';
    const progressBar = cs.sessTotal
      ? '<div class="pat-prog-row"><div class="pat-prog-track"><div class="pat-prog-fill" style="width:' + progPct + '%"></div></div><span class="pat-prog-lbl">' + cs.sessDone + '/' + cs.sessTotal + ' sessions</span></div>'
      : '';
    const statusColor = { active: 'var(--green)', pending: 'var(--amber)', inactive: 'var(--text-tertiary)', completed: 'var(--blue)' }[p.status] || 'var(--text-tertiary)';
    const condTag  = p.primary_condition ? '<span class="tag" style="font-size:10.5px">' + p.primary_condition + '</span>' : '';
    const modTag   = p.primary_modality  ? '<span class="tag" style="font-size:10.5px">' + p.primary_modality  + '</span>' : '';
    const ageSpan  = age ? ' <span class="pat-card-age">' + age + '</span>' : '';
    const statusLabel = { active: 'Active', pending: 'Pending', inactive: 'Inactive', completed: 'Completed', discharged: 'Discharged' }[p.status] || (p.status || '');
    const statusPill = statusLabel ? '<span class="pat-status-pill" style="color:' + statusColor + ';background:' + statusColor + '18;border:1px solid ' + statusColor + '44">' + statusLabel + '</span>' : '';
    const primaryBtn = (p.sessions_today || 0) > 0
      ? '<button class="pat-act-btn pat-act-btn--primary" onclick="event.stopPropagation();window._patStartSession(\'' + p.id + '\')">' + 'Start Session</button>'
      : '<button class="pat-act-btn pat-act-btn--primary" onclick="event.stopPropagation();window.openPatient(\'' + p.id + '\')">' + 'Open Chart</button>';
    return '<div class="pat-roster-card" data-id="' + p.id + '" data-status="' + p.status + '" data-attention="' + (att ? att.type : 'ok') + '" onclick="window._patSelectPatient(\'' + p.id + '\')">' 
      + '<div class="pat-card-left">'
      +   '<div class="pat-card-avatar">'
      +     '<span class="pat-status-dot" style="background:' + statusColor + '"></span>'
      +     initials(name)
      +   '</div>'
      + '</div>'
      + '<div class="pat-card-main">'
      +   '<div class="pat-card-name">' + name + ageSpan + ' ' + statusPill + '</div>'
      +   '<div class="pat-card-meta">' + condTag + modTag + ' ' + courseInfo + '</div>'
      +   progressBar
      +   (att ? '<div style="margin-top:4px"><span class="pat-att-badge" style="color:' + att.color + ';border-color:' + att.color + '33;background:' + att.color + '0d">' + att.label + '</span></div>' : '')
      + '</div>'
      + '<div class="pat-card-actions" onclick="event.stopPropagation()">'
      +   primaryBtn
      +   '<button class="pat-act-btn" onclick="event.stopPropagation();window._patGetInviteLink(\'' + p.id + '\')" title="Get patient invite code" style="font-size:11px">Invite</button>'
      + '</div>'
      + '</div>';
  }
  window._patCard = _patCard;

  // ── Invite code handler ───────────────────────────────────────────
  window._patGetInviteLink = async function(patientId) {
    try {
      const data = await api.generatePatientInvite({ patient_id: patientId });
      const code = data?.invite_code || data?.code || '';
      if (!code) { window._showNotifToast?.({ title: 'No code returned', body: 'The server did not return an invite code.', severity: 'warn' }); return; }
      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center';
      modal.innerHTML = `<div style="background:var(--card);border-radius:14px;padding:28px 32px;max-width:420px;width:90%;position:relative">
        <div style="font-size:15px;font-weight:700;margin-bottom:8px;color:var(--text-primary)">Patient Invite Code</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:16px">Share this code with the patient. It expires in 7 days.</div>
        <div style="background:var(--bg-secondary,#0f172a);border-radius:8px;padding:12px 16px;display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <code id="invite-code-val" style="font-size:18px;font-weight:700;color:var(--teal);flex:1;letter-spacing:2px">${code}</code>
          <button onclick="navigator.clipboard.writeText('${code}');this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',2000)" style="background:var(--teal);color:#000;border:none;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer">Copy</button>
        </div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:16px">The patient enters this code on the sign-up page at your clinic's portal link.</div>
        <button onclick="this.closest('[style*=&quot;fixed&quot;]').remove()" style="background:transparent;border:1px solid var(--border);border-radius:8px;padding:8px 20px;color:var(--text-secondary);cursor:pointer;font-size:13px">Close</button>
      </div>`;
      document.body.appendChild(modal);
      modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    } catch(e) {
      window._showNotifToast?.({ title: 'Invite failed', body: e.message || 'Could not generate invite code.', severity: 'warn' });
    }
  };

  // ── Right-panel renderer ──────────────────────────────────────────
  function _renderRightPanel(p) {
    const emptyEl  = document.getElementById('pat-rp-empty');
    const detailEl = document.getElementById('pat-rp-detail');
    if (!p) {
      if (emptyEl)  emptyEl.style.display  = '';
      if (detailEl) detailEl.style.display = 'none';
      return;
    }
    if (emptyEl)  emptyEl.style.display  = 'none';
    if (!detailEl) return;
    const cs  = _patCourseStats(p);
    const att = _patAttention(p);
    const name = (p.first_name || '') + ' ' + (p.last_name || '');
    const activeCourse = cs.activeCourses[0];
    const trendIcon  = { improving: '↑', worsening: '↓', worsened: '↓', steady: '→' }[p.outcome_trend] || '—';
    const trendColor = { improving: 'var(--green)', worsening: 'var(--red)', worsened: 'var(--red)', steady: 'var(--text-secondary)' }[p.outcome_trend] || 'var(--text-tertiary)';
    const progPct    = cs.sessTotal ? Math.round((cs.sessDone / cs.sessTotal) * 100) : 0;
    const nextSess   = p.next_session_date || p.next_session || '—';
    const pendingAssess = p.pending_assessments != null ? p.pending_assessments : '—';
    const pendingDocs   = p.pending_documents   != null ? p.pending_documents   : '—';
    const recentNote    = p.recent_note || p.last_note || p.clinician_notes || '';
    const pid = String(p.id).replace(/'/g, "\\'" );
    detailEl.style.display = '';
    detailEl.innerHTML = `
      <div class="pat-rp-header">
        <div class="pat-rp-avatar">${initials(name)}</div>
        <div>
          <div class="pat-rp-name">${name}</div>
          <div class="pat-rp-sub">${p.primary_condition || ''}${p.primary_modality ? ' \xB7 ' + p.primary_modality : ''}</div>
        </div>
      </div>
      <div class="pat-rp-row"><span class="pat-rp-label">Status</span><span class="pat-rp-val">${p.status || '\u2014'}</span></div>
      <div class="pat-rp-row"><span class="pat-rp-label">Active Course</span><span class="pat-rp-val">${activeCourse?.name || (cs.activeCourses.length ? cs.activeCourses.length + ' course(s)' : '\u2014')}</span></div>
      <div class="pat-rp-row"><span class="pat-rp-label">Next Session</span><span class="pat-rp-val">${nextSess}</span></div>
      <div class="pat-rp-row"><span class="pat-rp-label">Sessions</span><span class="pat-rp-val">${cs.sessTotal ? cs.sessDone + ' / ' + cs.sessTotal + ' (' + progPct + '%)' : '\u2014'}</span></div>
      <div class="pat-rp-row"><span class="pat-rp-label">Outcome Trend</span><span class="pat-rp-val" style="color:${trendColor};font-weight:600">${trendIcon} ${p.outcome_trend || '\u2014'}</span></div>
      <div class="pat-rp-row"><span class="pat-rp-label">Pending Assess.</span><span class="pat-rp-val">${pendingAssess}</span></div>
      <div class="pat-rp-row"><span class="pat-rp-label">Pending Docs</span><span class="pat-rp-val">${pendingDocs}</span></div>
      ${att ? `<div class="pat-rp-row"><span class="pat-rp-label">Alert</span><span class="pat-rp-val" style="color:${att.color};font-weight:600">${att.label}</span></div>` : ''}
      ${recentNote ? `<div class="pat-rp-section-title">Recent Note</div><div class="pat-rp-note">${recentNote}</div>` : ''}
      <div class="pat-rp-section-title">Quick Actions</div>
      <div class="pat-rp-actions">
        <button class="pat-rp-action-btn pat-rp-action-btn--primary" onclick="window.openPatient('${pid}')">&#128196; Open Chart</button>
        <button class="pat-rp-action-btn" onclick="window._patStartSession('${pid}')">&#9654; Start Session</button>
        <button class="pat-rp-action-btn" onclick="window._patNavWithCtx('${pid}','messaging')">&#128222; Virtual Care</button>
        <button class="pat-rp-action-btn" onclick="window._patNavWithCtx('${pid}','outcomes')">&#128200; Log Outcome</button>
        <button class="pat-rp-action-btn" onclick="window._patNavWithCtx('${pid}','review-queue')">&#128064; Review Update</button>
      </div>`;
  }

  window._patSelectPatient = function(patId) {
    document.querySelectorAll('.pat-roster-card').forEach(function(c) {
      c.classList.toggle('selected', c.dataset.id === patId);
    });
    window._patSelected = patId;
    try { sessionStorage.setItem('ds_pat_selected_id', patId); } catch {}
    const p = (window._patientsData || []).find(function(x) { return x.id === patId; });
    _renderRightPanel(p || null);
  };

  // ── Cohort filter ─────────────────────────────────────────────────────
  window._patSetCohort = function(cohortId) {
    window._patCohortFilter = cohortId;
    document.querySelectorAll('.pat-cohort-item').forEach(function(c) {
      c.classList.toggle('active', c.id === 'pat-cohort-' + cohortId);
    });
    window._patSelected = null;
    _renderRightPanel(null);
    window.filterPatients();
  };

  window._patSetQuick = function(type) {
    window._patQuickFilter = type;
    document.querySelectorAll('.pat-qchip').forEach(b => b.classList.toggle('pat-qchip--on', b.id === 'ptq-' + type));
    window.filterPatients();
  };

  window._patStartSession = function(id) {
    window._selectedPatientId = id;
    window._profilePatientId  = id;
    window._nav('patient-profile');
  };

  // Carry the selected patient id into downstream hubs (messaging, outcomes,
  // review-queue) so those pages can scope/pre-filter to this patient rather
  // than loading unbounded.
  window._patNavWithCtx = function(id, route) {
    if (id) {
      window._selectedPatientId = id;
      window._profilePatientId  = id;
      try { sessionStorage.setItem('ds_pat_selected_id', id); } catch {}
    }
    (window._nav || navigate)(route);
  };

  window._patAddNote = function(id) {
    window._selectedPatientId = id;
    window._profilePatientId  = id;
    window._nav('patient-profile');
  };

  window.filterPatients = function() {
    const q      = (document.getElementById('pt-search')?.value || '').toLowerCase();
    const st     = document.getElementById('pt-status-filter')?.value  || '';
    const mod    = document.getElementById('pt-modality-filter')?.value || '';
    const cohort = window._patCohortFilter || 'all';
    const all    = window._patientsData || [];
    const thirtyDaysAgo = Date.now() - 30 * 86400000;

    const vis = all.filter(p => {
      const name  = ((p.first_name || '') + ' ' + (p.last_name || '')).toLowerCase();
      const matchQ   = !q   || name.includes(q) || (p.primary_condition || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q);
      const matchSt  = !st  || p.status === st;
      const matchMod = !mod || (p.primary_modality || '') === mod;
      let   matchCohort = true;
      if      (cohort === 'active')     matchCohort = p.status === 'active';
      else if (cohort === 'today')      matchCohort = (p.sessions_today || 0) > 0;
      else if (cohort === 'review')     matchCohort = !!(p.needs_review || p.review_overdue);
      else if (cohort === 'assessment') matchCohort = !!(p.assessment_overdue || p.missing_assessment);
      else if (cohort === 'ae')         matchCohort = !!(p.has_adverse_event || p.adverse_event_flag);
      else if (cohort === 'adherence')  matchCohort = p.home_adherence != null && p.home_adherence < 0.5;
      else if (cohort === 'wearable')   matchCohort = !!p.wearable_disconnected;
      else if (cohort === 'call')       matchCohort = !!p.call_requested;
      else if (cohort === 'offlabel')   matchCohort = !!(p.off_label_flag || p.offlabel_review);
      else if (cohort === 'recent')     matchCohort = !!(p.created_at && new Date(p.created_at).getTime() >= thirtyDaysAgo);
      else if (cohort === 'discharged') matchCohort = p.status === 'completed' || p.status === 'discharged';
      return matchQ && matchSt && matchMod && matchCohort;
    });

    const countEl  = document.getElementById('pt-count');
    const rosterEl = document.getElementById('pat-roster');
    if (countEl)  countEl.textContent = vis.length + ' of ' + all.length + ' patients';
    if (rosterEl) rosterEl.innerHTML  = vis.length
      ? vis.map(p => _patCard(p, _patAttention(p), _patCourseStats(p), canTransfer)).join('')
      : `<div style="text-align:center;padding:48px 24px;color:var(--text-tertiary)"><div style="font-size:28px;margin-bottom:8px">&#9670;</div>No patients match the current filters.</div>`;
    // Re-apply selected card highlight if patient still visible
    if (window._patSelected) {
      document.querySelectorAll('.pat-roster-card').forEach(function(c) {
        c.classList.toggle('selected', c.dataset.id === window._patSelected);
      });
    }
  };

  window.showAddPatient = function() {
    const p = document.getElementById('add-patient-panel');
    if (p) { p.style.display = 'flex'; }
  };

  window.saveNewPatient = async function() {
    const errEl = document.getElementById('np-error');
    errEl.style.display = 'none';
    const data = {
      first_name: document.getElementById('np-first').value.trim(),
      last_name: document.getElementById('np-last').value.trim(),
      dob: document.getElementById('np-dob').value || null,
      gender: document.getElementById('np-gender').value || null,
      email: document.getElementById('np-email').value.trim() || null,
      primary_condition: document.getElementById('np-condition').value || null,
      primary_modality: document.getElementById('np-modality').value || null,
      notes: document.getElementById('np-notes').value.trim() || null,
      status: 'pending',
    };
    if (!data.first_name || !data.last_name) { errEl.textContent = 'First and last name required.'; errEl.style.display = ''; return; }
    try {
      await api.createPatient(data);
      navigate('patients');
    } catch (e) {
      errEl.textContent = e.message || 'Save failed.';
      errEl.style.display = '';
    }
  };

  window.openPatient = function(id) {
    window._selectedPatientId = id;
    window._profilePatientId  = id;
    navigate('patient-profile');
  };

  window.deletePatient = async function(id) {
    if (!confirm('Delete this patient? This cannot be undone.')) return;
    try {
      await api.deletePatient(id); navigate('patients');
    } catch (e) {
      const b = document.createElement('div');
      b.className = 'notice notice-warn';
      b.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:380px';
      b.textContent = e.message || 'Delete failed.';
      document.body.appendChild(b); setTimeout(() => b.remove(), 4000);
    }
  };

  // ── Patient Transfer ──────────────────────────────────────────────────────
  window._transferPatient = function(patientId, patientName) {
    const existingModal = document.getElementById('transfer-modal');
    if (existingModal) existingModal.remove();

    const otherClinics = (window._clinics || []).filter(
      c => c.id !== (window._currentClinic?.id)
    );

    if (!otherClinics.length) {
      const t = document.createElement('div');
      t.style.cssText = 'position:fixed;bottom:24px;right:24px;max-width:320px;padding:12px 16px;border-radius:10px;background:var(--navy-800);border:1px solid var(--border);z-index:9999;color:var(--text-secondary);font-size:13px';
      t.textContent = 'No other clinics available for transfer.';
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 3000);
      return;
    }

    const clinicOptions = otherClinics.map(c =>
      `<option value="${c.id}">${c.name}</option>`
    ).join('');

    const modal = document.createElement('div');
    modal.id = 'transfer-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-card" onclick="event.stopPropagation()">
        <h3>Transfer Patient</h3>
        <p>Transfer <strong style="color:var(--text-primary)">${patientName}</strong> to another clinic.</p>
        <label>Destination Clinic</label>
        <select id="transfer-clinic-select" class="form-control">${clinicOptions}</select>
        <label>Transfer Note</label>
        <textarea id="transfer-note" class="form-control" rows="4" placeholder="Reason for transfer, handover notes…" style="resize:vertical"></textarea>
        <div style="display:flex;gap:8px;margin-top:16px">
          <button class="btn" onclick="document.getElementById('transfer-modal').remove()">Cancel</button>
          <button class="btn btn-primary" id="transfer-confirm-btn" onclick="window._confirmTransfer('${patientId}','${patientName.replace(/'/g,"\\'") }')">Confirm Transfer</button>
        </div>
      </div>`;
    modal.onclick = () => modal.remove();
    document.body.appendChild(modal);
    // Trap focus inside the modal for keyboard accessibility
    if (window._trapFocus) window._trapFocus(modal);
  };

  window._confirmTransfer = async function(patientId, patientName) {
    const selectEl = document.getElementById('transfer-clinic-select');
    const confirmBtn = document.getElementById('transfer-confirm-btn');
    if (!selectEl || !confirmBtn) return;

    const destId = selectEl.value;
    const destClinic = (window._clinics || []).find(c => c.id === destId);
    if (!destClinic) return;

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Transferring…';

    // Simulate API call
    await new Promise(r => setTimeout(r, 1200));

    // Remove modal
    const modal = document.getElementById('transfer-modal');
    if (modal) modal.remove();

    // Show success toast
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;max-width:340px;padding:12px 16px;border-radius:10px;background:var(--navy-800);border:1px solid var(--teal);z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.5);transition:opacity 0.3s';
    t.innerHTML = `<div style="font-size:12.5px;font-weight:600;color:var(--teal);margin-bottom:3px">Transfer Complete</div>
      <div style="font-size:11.5px;color:var(--text-secondary)">${patientName} transferred to ${destClinic.name}</div>`;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 4000);
  };

  // ── CSV Import binding ────────────────────────────────────────────────────

  function _parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    return lines.slice(1).filter(l => l.trim()).map(line => {
      const values = [];
      let cur = '', inQ = false;
      for (const ch of line) {
        if (ch === '"') inQ = !inQ;
        else if (ch === ',' && !inQ) { values.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
      values.push(cur.trim());
      return Object.fromEntries(headers.map((h, i) => [h, values[i] || '']));
    });
  }

  window.downloadPatientTemplate = function() {
    const csv = 'first_name,last_name,email,date_of_birth,gender,primary_condition,primary_modality,clinician_notes\nJohn,Smith,john@example.com,1985-03-15,male,depression,tDCS,Initial referral';
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'patient-import-template.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  window.showImportCSV = function() {
    const panel = document.getElementById('csv-import-panel');
    if (panel) panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
  };

  // ── FHIR Import ──────────────────────────────────────────────────────────────
  window.showFHIRImport = function() {
    const panel = document.getElementById('fhir-import-panel');
    if (!panel) return;
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    // Close CSV panel if open
    const csvPanel = document.getElementById('csv-import-panel');
    if (csvPanel) csvPanel.style.display = 'none';
  };

  function parseFHIRPatient(json) {
    try {
      const r = JSON.parse(json);
      if (r.resourceType !== 'Patient') throw new Error('Not a FHIR Patient resource');
      const name = r.name?.[0];
      const firstName = name?.given?.[0] || name?.text?.split(' ')[0] || '';
      const lastName = name?.family || name?.text?.split(' ').slice(1).join(' ') || '';
      const email = r.telecom?.find(t => t.system === 'email')?.value || '';
      const phone = r.telecom?.find(t => t.system === 'phone')?.value || '';
      const dob = r.birthDate || '';
      const gender = r.gender || '';
      const address = r.address?.[0];
      const addressStr = address ? [address.line?.[0], address.city, address.state, address.postalCode].filter(Boolean).join(', ') : '';
      return { first_name: firstName, last_name: lastName, email, phone, date_of_birth: dob, gender, address: addressStr };
    } catch (e) {
      throw new Error('Invalid FHIR JSON: ' + e.message);
    }
  }

  window._fhirParsed = null;

  window.parseFHIRInput = function() {
    const input = document.getElementById('fhir-json-input');
    const errEl = document.getElementById('fhir-parse-error');
    const preview = document.getElementById('fhir-preview');
    const fieldsEl = document.getElementById('fhir-preview-fields');
    if (!input || !errEl || !preview || !fieldsEl) return;
    errEl.style.display = 'none';
    preview.style.display = 'none';
    try {
      const data = parseFHIRPatient(input.value.trim());
      window._fhirParsed = data;
      const fieldMap = [
        ['First Name', data.first_name],
        ['Last Name', data.last_name],
        ['Email', data.email],
        ['Phone', data.phone],
        ['Date of Birth', data.date_of_birth],
        ['Gender', data.gender],
        ['Address', data.address],
      ];
      fieldsEl.innerHTML = fieldMap.map(([k, v]) => `
        <div style="background:var(--bg-surface-2);border:1px solid var(--border);border-radius:6px;padding:8px 10px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:var(--text-tertiary);margin-bottom:2px">${k}</div>
          <div style="font-size:13px;color:${v ? 'var(--text-primary)' : 'var(--text-tertiary)'}">${v || '—'}</div>
        </div>`).join('');
      preview.style.display = 'block';
    } catch (e) {
      errEl.textContent = e.message;
      errEl.style.display = 'inline';
    }
  };

  window.fhirLoadExample = function() {
    const input = document.getElementById('fhir-json-input');
    if (!input) return;
    input.value = JSON.stringify({
      resourceType: 'Patient',
      id: 'example-patient-001',
      name: [{ family: 'Smith', given: ['Jane', 'Marie'] }],
      gender: 'female',
      birthDate: '1985-03-22',
      telecom: [
        { system: 'email', value: 'jane.smith@example.com' },
        { system: 'phone', value: '+1-555-234-5678' }
      ],
      address: [{
        line: ['42 Maple Street'],
        city: 'Springfield',
        state: 'IL',
        postalCode: '62701'
      }]
    }, null, 2);
  };

  window.createPatientFromFHIR = async function() {
    const data = window._fhirParsed;
    if (!data) return;
    const statusEl = document.getElementById('fhir-save-status');
    const errEl = document.getElementById('fhir-save-error');
    if (statusEl) statusEl.textContent = 'Saving…';
    if (errEl) errEl.style.display = 'none';
    try {
      await api.createPatient(data);
      if (statusEl) statusEl.textContent = 'Patient created successfully.';
      const panel = document.getElementById('fhir-import-panel');
      if (panel) panel.style.display = 'none';
      window._nav('patients');
    } catch (e) {
      if (errEl) { errEl.textContent = e.message || 'Failed to create patient.'; errEl.style.display = 'block'; }
      if (statusEl) statusEl.textContent = '';
    }
  };

  window.toggleCSVPaste = function() {
    const area = document.getElementById('csv-paste-area');
    if (!area) return;
    area.style.display = area.style.display === 'none' ? '' : 'none';
  };

  window._csvParsedRows = [];

  window.parseCSVInput = function(text) {
    const notice = document.getElementById('csv-parse-notice');
    const section = document.getElementById('csv-preview-section');
    const table = document.getElementById('csv-preview-table');
    const countEl = document.getElementById('csv-import-count');
    const btn = document.getElementById('csv-import-btn');
    if (!notice || !section || !table) return;

    let rows;
    try {
      rows = _parseCSV(text);
    } catch (e) {
      notice.style.display = '';
      notice.innerHTML = `<div style="color:var(--red);font-size:12px">Parse error: ${e.message}</div>`;
      section.style.display = 'none';
      return;
    }

    if (!rows.length) {
      notice.style.display = '';
      notice.innerHTML = `<div style="color:var(--amber);font-size:12px">No data rows found in CSV.</div>`;
      section.style.display = 'none';
      return;
    }

    window._csvParsedRows = rows;
    notice.style.display = 'none';

    const requiredCols = ['first_name', 'last_name'];
    const validRows = rows.filter(r => r.first_name && r.last_name);
    const invalidCount = rows.length - validRows.length;

    const headers = ['first_name', 'last_name', 'email', 'date_of_birth', 'gender', 'primary_condition', 'primary_modality', 'clinician_notes'];
    const theadCells = headers.map(h => `<th style="white-space:nowrap">${h.replace(/_/g,' ')}</th>`).join('');
    const tbodyRows = rows.map(r => {
      const invalid = !r.first_name || !r.last_name;
      const bg = invalid ? 'background:rgba(255,107,107,0.06)' : '';
      const cells = headers.map(h => `<td style="font-size:11px">${r[h] || ''}</td>`).join('');
      return `<tr style="${bg}">${cells}</tr>`;
    }).join('');

    table.innerHTML = `<thead><tr>${theadCells}</tr></thead><tbody>${tbodyRows}</tbody>`;
    if (countEl) countEl.textContent = `${validRows.length} valid / ${rows.length} total${invalidCount > 0 ? ` — ${invalidCount} missing name (amber rows skipped)` : ''}`;
    if (btn) btn.textContent = `Import ${validRows.length} Patient${validRows.length !== 1 ? 's' : ''}`;
    section.style.display = '';
    document.getElementById('csv-preview-label').textContent = `Preview — ${rows.length} rows`;
  };

  window.runPatientImport = async function() {
    const rows = (window._csvParsedRows || []).filter(r => r.first_name && r.last_name);
    if (!rows.length) return;
    const btn = document.getElementById('csv-import-btn');
    const progressWrap = document.getElementById('csv-progress-wrap');
    const progressBar = document.getElementById('csv-progress-bar');
    const progressLabel = document.getElementById('csv-progress-label');
    const resultEl = document.getElementById('csv-import-result');
    if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }
    if (progressWrap) progressWrap.style.display = '';
    if (resultEl) resultEl.style.display = 'none';

    let done = 0, errors = 0, errorDetails = [];
    for (const row of rows) {
      const payload = {
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email || null,
        dob: row.date_of_birth || null,
        gender: row.gender || null,
        primary_condition: row.primary_condition || null,
        primary_modality: row.primary_modality || null,
        notes: row.clinician_notes || null,
        status: 'pending',
      };
      try {
        await api.createPatient(payload);
        done++;
      } catch (e) {
        errors++;
        errorDetails.push(`${row.first_name} ${row.last_name}: ${e.message || 'failed'}`);
      }
      const pct = Math.round(((done + errors) / rows.length) * 100);
      if (progressBar) progressBar.style.width = pct + '%';
      if (progressLabel) progressLabel.textContent = `Importing ${done + errors} / ${rows.length} patients…`;
      await new Promise(r => setTimeout(r, 50));
    }

    if (progressLabel) progressLabel.textContent = `Done.`;
    if (btn) { btn.disabled = false; btn.textContent = 'Import Complete'; }
    if (resultEl) {
      resultEl.style.display = '';
      if (errors === 0) {
        resultEl.innerHTML = `<div class="notice" style="background:rgba(0,212,188,0.07);border:1px solid rgba(0,212,188,0.25);border-radius:6px;padding:10px 12px;font-size:12px;color:var(--teal)">${done} patient${done !== 1 ? 's' : ''} imported successfully.</div>`;
      } else {
        resultEl.innerHTML = `<div class="notice notice-warn" style="font-size:12px">${done} imported, ${errors} failed.<br>${errorDetails.map(d => `<div style="margin-top:4px;color:var(--red)">• ${d}</div>`).join('')}</div>`;
      }
    }
    // Refresh patient list in background
    try {
      const res = await api.listPatients().catch(() => null);
      if (res?.items) {
        window._patientsData = res.items;
        window.filterPatients();
      }
    } catch {}
  };

  // Bind CSV drop zone
  setTimeout(() => {
    const zone = document.getElementById('csv-drop-zone');
    const fileInput = document.getElementById('csv-file-input');
    if (zone) {
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--teal)'; zone.style.borderStyle = 'solid'; });
      zone.addEventListener('dragleave', () => { zone.style.borderColor = 'var(--border)'; zone.style.borderStyle = 'dashed'; });
      zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        zone.style.borderColor = 'var(--border)'; zone.style.borderStyle = 'dashed';
        const file = e.dataTransfer.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => window.parseCSVInput(ev.target.result || '');
        reader.readAsText(file);
      });
    }
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => window.parseCSVInput(ev.target.result || '');
        reader.readAsText(file);
        fileInput.value = '';
      });
    }
  }, 50);

  // ── AI Intake Parser binding ──────────────────────────────────────────────

  window.toggleIntakeParser = function() {
    const body = document.getElementById('intake-parser-body');
    const arrow = document.getElementById('intake-parser-arrow');
    if (!body) return;
    const expanded = body.style.display !== 'none';
    body.style.display = expanded ? 'none' : '';
    if (arrow) arrow.textContent = expanded ? '▶ expand' : '▲ collapse';
  };

  async function _extractPDFText(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result || '');
      reader.readAsText(file);
    });
  }

  window.runIntakeParse = async function() {
    const btn = document.getElementById('intake-extract-btn');
    const notice = document.getElementById('intake-parse-notice');
    const resultPanel = document.getElementById('intake-result-panel');
    const resultContent = document.getElementById('intake-result-content');

    let text = (document.getElementById('intake-paste-text')?.value || '').trim();
    if (!text) {
      if (notice) { notice.style.display = ''; notice.innerHTML = `<div style="color:var(--amber);font-size:12px">Please upload a file or paste intake text first.</div>`; }
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }
    if (notice) notice.style.display = 'none';
    if (resultPanel) resultPanel.style.display = 'none';

    try {
      const result = await api.caseSummary({ patient_notes: text, condition: '', modality: '', session_count: 0 });
      window._lastIntakeResult = result;
      if (resultContent) {
        const lines = [];
        if (result?.presenting_symptoms?.length) lines.push(`Symptoms: ${result.presenting_symptoms.join(', ')}`);
        if (result?.possible_targets?.length) lines.push(`Possible Targets: ${result.possible_targets.join(', ')}`);
        if (result?.suggested_modalities?.length) lines.push(`Suggested Modalities: ${result.suggested_modalities.join(', ')}`);
        if (result?.red_flags?.length) lines.push(`Red Flags: ${result.red_flags.join(', ')}`);
        if (result?.summary) lines.push(`\nSummary:\n${result.summary}`);
        resultContent.textContent = lines.join('\n') || JSON.stringify(result, null, 2);
      }
      if (resultPanel) resultPanel.style.display = '';
    } catch (e) {
      if (notice) { notice.style.display = ''; notice.innerHTML = `<div style="color:var(--red);font-size:12px">Extraction failed: ${e.message}</div>`; }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Extract Patient Data →'; }
    }
  };

  window.prefillPatientFromIntake = function() {
    const result = window._lastIntakeResult;
    if (!result) return;
    // Best-effort: surface the add-patient form and pre-fill what we can
    window.showAddPatient();
    // Try to extract condition and modality
    const condition = result?.possible_targets?.[0] || result?.presenting_symptoms?.[0] || '';
    const modality = result?.suggested_modalities?.[0] || '';
    const condEl = document.getElementById('np-condition');
    const modEl  = document.getElementById('np-modality');
    const notesEl = document.getElementById('np-notes');
    if (condEl && condition) {
      // Try to match against existing options
      Array.from(condEl.options).forEach(o => {
        if (o.value.toLowerCase().includes(condition.toLowerCase()) || condition.toLowerCase().includes(o.value.toLowerCase())) {
          condEl.value = o.value;
        }
      });
    }
    if (modEl && modality) {
      Array.from(modEl.options).forEach(o => {
        if (o.value.toLowerCase().includes(modality.toLowerCase())) modEl.value = o.value;
      });
    }
    if (notesEl && result) {
      const summary = result?.summary || (result?.presenting_symptoms?.join(', ') || '');
      notesEl.value = summary ? `[From intake parser] ${summary}` : '';
    }
    // Scroll to add-patient form
    document.getElementById('add-patient-panel')?.scrollIntoView({ behavior: 'smooth' });
  };

  // Restore previously selected patient after render
  const _prevSel = sessionStorage.getItem('ds_pat_selected_id');
  if (_prevSel) {
    const _prevPat = items.find(p => String(p.id) === String(_prevSel));
    if (_prevPat) {
      setTimeout(() => window._patSelectPatient?.(_prevSel), 50);
    }
  }

  // Bind intake PDF drop zone
  setTimeout(() => {
    const zone = document.getElementById('intake-pdf-drop');
    const fileInput = document.getElementById('intake-file-input');
    const pasteText = document.getElementById('intake-paste-text');
    const notice = document.getElementById('intake-parse-notice');

    if (zone) {
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--teal)'; zone.style.borderStyle = 'solid'; });
      zone.addEventListener('dragleave', () => { zone.style.borderColor = 'var(--border)'; zone.style.borderStyle = 'dashed'; });
      zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        zone.style.borderColor = 'var(--border)'; zone.style.borderStyle = 'dashed';
        const file = e.dataTransfer.files[0];
        if (file) {
          if (notice) { notice.style.display = ''; notice.innerHTML = `<div style="font-size:12px;color:var(--text-tertiary)">Reading ${file.name}…</div>`; }
          const text = await _extractPDFText(file);
          if (!text || text.length < 20 || /^\0/.test(text)) {
            if (notice) notice.innerHTML = `<div style="font-size:12px;color:var(--amber)">PDF text extraction failed or binary content detected. Please paste text manually below.</div>`;
          } else {
            if (pasteText) pasteText.value = text;
            if (notice) notice.innerHTML = `<div style="font-size:12px;color:var(--green)">✓ Text extracted from ${file.name} (${text.length} chars). Review and click Extract.</div>`;
          }
        }
      });
    }
    if (fileInput) {
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        if (notice) { notice.style.display = ''; notice.innerHTML = `<div style="font-size:12px;color:var(--text-tertiary)">Reading ${file.name}…</div>`; }
        const text = await _extractPDFText(file);
        if (!text || text.length < 20 || /^\0/.test(text)) {
          if (notice) notice.innerHTML = `<div style="font-size:12px;color:var(--amber)">PDF text extraction failed or binary content. Please paste text manually below.</div>`;
        } else {
          if (pasteText) pasteText.value = text;
          if (notice) notice.innerHTML = `<div style="font-size:12px;color:var(--green)">✓ Text extracted from ${file.name}. Review below and click Extract.</div>`;
        }
        fileInput.value = '';
      });
    }
  }, 50);
}

// ── Patient Profile ───────────────────────────────────────────────────────────
export async function pgProfile(setTopbar, navigate) {
  const id = window._selectedPatientId;
  if (!id) { navigate('patients'); return; }

  // Always reset to the overview tab on each patient profile load
  ptab = 'courses';

  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let pt = null, sessions = [], courses = [];
  try {
    [pt, sessions, courses] = await Promise.all([
      api.getPatient(id),
      api.listSessions(id).then(r => r?.items || []).catch(() => []),
      api.listCourses({ patient_id: id }).then(r => r?.items || []).catch(() => []),
    ]);
  } catch {}

  if (!pt) { el.innerHTML = `<div class="notice notice-warn">Could not load patient.</div>`; return; }

  const name = `${pt.first_name} ${pt.last_name}`;
  const done = sessions.filter(s => s.status === 'completed').length;
  const total = sessions.length;

  setTopbar(`${name}`,
    `<button class="btn btn-ghost btn-sm" onclick="window._nav('patients')">← All Patients</button>
     <button class="btn btn-ghost btn-sm" onclick="window._nav('dashboard')">⌂ Dashboard</button>
     <button class="btn btn-primary btn-sm" onclick="window.startNewCourse()">+ New Course</button>`
  );

  el.innerHTML = `
  <div class="card" style="margin-bottom:20px;background:linear-gradient(135deg,rgba(0,212,188,0.05),rgba(74,158,255,0.05))">
    <div class="card-body" style="display:flex;align-items:flex-start;gap:16px;padding:20px">
      <div class="avatar" style="width:56px;height:56px;font-size:20px;flex-shrink:0;border-radius:var(--radius-lg)">${initials(name)}</div>
      <div style="flex:1">
        <div style="font-family:var(--font-display);font-size:20px;font-weight:700;color:var(--text-primary)">${name}</div>
        <div style="font-size:12.5px;color:var(--text-secondary);margin-top:4px">
          ${pt.dob ? `DOB: ${pt.dob} · ` : ''}${pt.gender ? `${pt.gender} · ` : ''}${pt.primary_condition || 'No condition set'}
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center">
          ${pt.primary_modality ? tag(pt.primary_modality) : ''}
          ${pt.primary_condition ? tag(pt.primary_condition) : ''}
          ${pt.consent_signed
            ? '<span class="tag" style="color:var(--green);border-color:rgba(34,197,94,0.3)">✓ Consent on File</span>'
            : '<span class="tag" style="color:var(--amber);border-color:rgba(255,181,71,0.4);cursor:pointer" onclick="window.switchPT(\'consent\')" title="Click to manage consent">⚠ Consent Required</span>'}
        </div>
      </div>
      <div style="text-align:right">
        ${pillSt(pt.status || 'pending')}
        <div style="font-size:11.5px;color:var(--text-secondary);margin-top:6px">Sessions: ${done} / ${total}</div>
        ${total > 0 ? `<div class="progress-bar" style="margin-top:7px;width:130px;margin-left:auto;height:4px"><div class="progress-fill" style="width:${Math.round((done/total)*100)}%"></div></div>` : ''}
      </div>
    </div>
  </div>

  <div class="tab-bar">
    ${['overview', 'courses', 'sessions', 'outcomes', 'protocol', 'assessments', 'notes', 'phenotype', 'consent', 'monitoring', 'home-therapy'].map(t => {
      const labels = {
        'overview':     'Overview',
        'courses':      'Treatment Courses',
        'sessions':     'Sessions',
        'outcomes':     'Outcomes',
        'protocol':     'AI Protocol',
        'assessments':  'Assessments',
        'notes':        'Clinical Notes',
        'phenotype':    'Phenotype',
        'consent':      'Consent',
        'monitoring':   '◌ Monitoring',
        'home-therapy': '⚡ Home Therapy',
      };
      const label = labels[t] || t;
      return `<button class="tab-btn ${ptab === t ? 'active' : ''}" onclick="window.switchPT('${t}')">${label}${t === 'courses' && courses.length ? ` (${courses.length})` : ''}</button>`;
    }).join('')}
  </div>
  <div id="ptab-body">${renderProfileTab(pt, sessions, courses)}</div>`;

  window._currentPatient = pt;
  window._currentSessions = sessions;
  window._currentCourses = courses;

  window.switchPT = async function(t) {
    ptab = t;
    document.querySelectorAll('.tab-btn').forEach(b => {
      const onclickAttr = b.getAttribute('onclick') || '';
      b.classList.toggle('active', onclickAttr.includes(`'${t}'`));
    });
    if (t === 'phenotype') {
      document.getElementById('ptab-body').innerHTML = spinner();
      const [assigns, phenos] = await Promise.all([
        api.listPhenotypeAssignments({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []),
        api.phenotypes().then(r => r?.items || r || []).catch(() => []),
      ]);
      document.getElementById('ptab-body').innerHTML = renderPhenotypeTab(pt, assigns, phenos);
      bindPhenotypeActions(pt);
      return;
    }
    if (t === 'consent') {
      document.getElementById('ptab-body').innerHTML = spinner();
      const consents = await api.listConsents({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []);
      document.getElementById('ptab-body').innerHTML = renderConsentTab(pt, consents);
      bindConsentActions(pt);
      return;
    }
    if (t === 'outcomes') {
      document.getElementById('ptab-body').innerHTML = spinner();
      const outcomes = await api.listOutcomes({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []);
      document.getElementById('ptab-body').innerHTML = renderOutcomesTab(pt, outcomes, window._currentCourses || []);
      bindOutcomesActions(pt);
      return;
    }
    if (t === 'assessments') {
      document.getElementById('ptab-body').innerHTML = renderProfileTab(pt, sessions, window._currentCourses || []);
      // Async load patient's recent assessments
      const bodyEl2 = document.getElementById('assessments-tab-body');
      if (bodyEl2) bodyEl2.innerHTML = `<div style="font-size:12px;color:var(--text-tertiary);padding:8px 0">Loading assessments…</div>`;
      setTimeout(async () => {
        const bodyEl = document.getElementById('assessments-tab-body');
        if (!bodyEl) return;
        try {
          const res = await api.listAssessments();
          const all = res?.items || [];
          const patAssess = all.filter(a => a.patient_id === pt.id);
          if (patAssess.length === 0) {
            bodyEl.innerHTML = `<div style="color:var(--text-tertiary);font-size:12.5px;padding:8px 0">No assessments recorded for this patient yet.</div>`;
          } else {
            bodyEl.innerHTML = `<table class="ds-table"><thead><tr><th>Template</th><th>Date</th><th>Score</th><th>Notes</th></tr></thead><tbody>
              ${patAssess.slice(0, 10).map(a => `<tr>
                <td style="font-weight:500">${a.template_id}</td>
                <td style="color:var(--text-tertiary)">${a.created_at?.split('T')[0] || '—'}</td>
                <td class="mono" style="color:var(--teal)">${a.score ?? '—'}</td>
                <td style="font-size:11px;color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.clinician_notes || '—'}</td>
              </tr>`).join('')}
            </tbody></table>`;
          }
        } catch { bodyEl.innerHTML = `<div style="color:var(--text-tertiary);font-size:12px">Could not load assessments.</div>`; }
      }, 0);
      return;
    }
    if (t === 'monitoring') {
      document.getElementById('ptab-body').innerHTML = spinner();
      try {
        const wData = await api.getPatientWearableSummary(pt.id, 30).catch(() => null);
        document.getElementById('ptab-body').innerHTML = renderMonitoringTab(pt, wData, navigate);
        bindMonitoringActions(pt, wData, navigate);
      } catch (_e) {
        document.getElementById('ptab-body').innerHTML = renderMonitoringTab(pt, null, navigate);
        bindMonitoringActions(pt, null, navigate);
      }
      return;
    }
    if (t === 'home-therapy') {
      document.getElementById('ptab-body').innerHTML = spinner();
      try {
        const htData = await renderHomeTherapyTab(pt.id, api);
        document.getElementById('ptab-body').innerHTML = htData;
        bindHomeTherapyActions(pt.id, api);
      } catch (_e) {
        document.getElementById('ptab-body').innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-tertiary)">Could not load home therapy data.</div>`;
      }
      return;
    }
    if (t === 'notes') {
      document.getElementById('ptab-body').innerHTML = renderProfileTab(pt, sessions, window._currentCourses || []);
      setTimeout(async () => {
        const listEl = document.getElementById('pt-notes-list');
        if (!listEl) return;
        try {
          const notes = await api.listClinicianNotes(pt.id);
          if (!notes || notes.length === 0) {
            listEl.innerHTML = `<div style="color:var(--text-tertiary);font-size:12.5px;padding:8px 0">No notes yet for this patient.</div>`;
          } else {
            listEl.innerHTML = notes.slice(0, 15).map(n => `
              <div style="border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:8px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                  <span style="font-size:11px;font-weight:600;text-transform:capitalize;color:var(--teal)">${(n.note_type || 'note').replace(/_/g,' ')}</span>
                  <span style="font-size:11px;color:var(--text-tertiary);margin-left:auto">${n.created_at?.split('T')[0] || ''}</span>
                  ${n.draft_status ? `<span style="font-size:10px;color:var(--amber);padding:2px 7px;border-radius:20px;background:rgba(255,181,71,.12)">${n.draft_status}</span>` : ''}
                </div>
                <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.55;white-space:pre-wrap">${(n.session_note || n.text_content || '').slice(0, 300)}${(n.session_note || n.text_content || '').length > 300 ? '…' : ''}</div>
              </div>`).join('');
          }
        } catch { listEl.innerHTML = `<div style="color:var(--text-tertiary);font-size:12px">Could not load notes.</div>`; }
      }, 0);
      return;
    }
    document.getElementById('ptab-body').innerHTML = renderProfileTab(pt, sessions, window._currentCourses || []);
    if (t === 'protocol') bindAI(pt);
  };

  window._launchInlineAssess = function(templateId, patientId) {
    // Navigate to assessments page and trigger inline mode after load
    window._assessPreFillPatient = patientId;
    window._assessPreFillTemplate = templateId;
    navigate('assessments');
  };

  window.startNewCourse = function() {
    window._wizardPatientId = pt.id;
    window._wizardPatientName = `${pt.first_name} ${pt.last_name}`;
    navigate('protocol-wizard');
  };

  function _showProfileToast(msg, isError = true) {
    const b = document.createElement('div');
    b.className = 'notice ' + (isError ? 'notice-warn' : 'notice-info');
    b.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:380px';
    b.textContent = msg;
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 4000);
  }

  window._activateCourseFromProfile = async function(courseId) {
    try {
      await api.activateCourse(courseId);
      const updated = await api.listCourses({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []);
      window._currentCourses = updated;
      document.getElementById('ptab-body').innerHTML = renderProfileTab(pt, sessions, updated);
    } catch (e) {
      _showProfileToast(e.message || 'Activation failed.');
    }
  };

  window._updateCourseStatus = async function(courseId, status) {
    // Destructive actions require confirmation; status changes don't
    if (status === 'discontinued' && !confirm('Permanently discontinue this treatment course? This cannot be undone.')) return;
    try {
      await api.updateCourse(courseId, { status });
      const updated = await api.listCourses({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []);
      window._currentCourses = updated;
      document.getElementById('ptab-body').innerHTML = renderProfileTab(pt, sessions, updated);
    } catch (e) {
      _showProfileToast(e.message || 'Update failed.');
    }
  };

  if (ptab === 'protocol') bindAI(pt);
}

function renderProfileTab(pt, sessions, courses = []) {
  const name = `${pt.first_name} ${pt.last_name}`;

  if (ptab === 'courses') {
    return `
      <div style="margin-bottom:12px;display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" onclick="window.startNewCourse()">+ New Treatment Course</button>
      </div>
      ${courses.length === 0
        ? emptyState('◎', 'No treatment courses yet', 'Create a treatment course to start planning sessions for this patient.', '+ Create Treatment Course', 'window.startNewCourse()')
        : `<div style="display:flex;flex-direction:column;gap:8px">
            ${courses.map(c => {
              const sc = COURSE_STATUS_COLORS[c.status] || 'var(--text-tertiary)';
              const pct = c.planned_sessions_total > 0 ? Math.min(100, Math.round(c.sessions_delivered / c.planned_sessions_total * 100)) : 0;
              const actionBtns = [];
              if (c.status === 'pending_approval' || c.status === 'approved')
                actionBtns.push(`<button class="btn btn-sm" onclick="window._activateCourseFromProfile('${c.id}')">Approve &amp; Activate</button>`);
              if (c.status === 'active')
                actionBtns.push(`<button class="btn btn-sm" onclick="window._updateCourseStatus('${c.id}','paused')">Pause</button>`);
              if (c.status === 'paused')
                actionBtns.push(`<button class="btn btn-sm" onclick="window._updateCourseStatus('${c.id}','active')">Resume</button>`);
              if (c.status === 'active' || c.status === 'paused')
                actionBtns.push(`<button class="btn btn-sm" onclick="window._updateCourseStatus('${c.id}','completed')">Complete</button>`);
              if (c.status !== 'discontinued' && c.status !== 'completed')
                actionBtns.push(`<button class="btn btn-sm" style="color:var(--red)" onclick="window._updateCourseStatus('${c.id}','discontinued')">Discontinue</button>`);
              actionBtns.push(`<button class="btn btn-sm" onclick="window._openCourse('${c.id}')">Detail →</button>`);
              return `<div class="card" style="padding:14px 18px">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
                  <span style="font-size:13px;font-weight:600;color:var(--text-primary);flex:1">${c.condition_slug?.replace(/-/g,' ') || '—'} · <span style="color:var(--teal)">${c.modality_slug || '—'}</span></span>
                  ${approvalBadge(c.status)}
                  ${evidenceBadge(c.evidence_grade)}
                  ${c.on_label === false ? labelBadge(false) : ''}
                  ${safetyBadge(c.governance_warnings)}
                </div>
                <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px">
                  ${c.planned_sessions_per_week || '?'}×/wk · ${c.planned_sessions_total || '?'} sessions
                  ${c.planned_frequency_hz ? ` · ${c.planned_frequency_hz} Hz` : ''}
                  ${c.target_region ? ` · ${c.target_region}` : ''}
                </div>
                <div style="margin-bottom:8px">
                  <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-tertiary);margin-bottom:3px">
                    <span>Progress</span><span>${c.sessions_delivered || 0}/${c.planned_sessions_total || '?'}</span>
                  </div>
                  <div style="height:3px;border-radius:2px;background:var(--border)">
                    <div style="height:3px;border-radius:2px;background:${sc};width:${pct}%"></div>
                  </div>
                </div>
                ${(c.governance_warnings || []).map(w => `<div style="font-size:11px;color:var(--amber);margin-bottom:3px">⚠ ${String(w).replace(/[<>&"]/g, '')}</div>`).join('')}
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">${actionBtns.join('')}</div>
              </div>`;
            }).join('')}
          </div>`
      }`;
  }

  if (ptab === 'overview') return `<div class="g2">
    <div>
      ${cardWrap('Clinical Details', [
        ['Name', name],
        ['Condition', pt.primary_condition || '—'],
        ['Gender', pt.gender || '—'],
        ['DOB', pt.dob || '—'],
        ['Referring Clinician', pt.referring_clinician || '—'],
        ['Contraindications', pt.notes || 'None documented'],
      ].map(([k, v]) => fr(k, v)).join(''))}
      ${cardWrap('Risk Flags', (() => {
        const contra = pt.notes ? pt.notes.toLowerCase() : '';
        const hasContra = contra && contra !== 'none documented' && contra.length > 3;
        const flags = [];
        if (pt.primary_condition?.toLowerCase().includes('epilep')) flags.push({ msg: 'Epilepsy — check TMS/tDCS contraindications', level: 'warn' });
        if (contra && hasContra) flags.push({ msg: `Contraindication note: ${pt.notes}`, level: 'warn' });
        if (!pt.consent_signed) flags.push({ msg: 'Consent not yet signed', level: 'warn' });
        if (flags.length === 0) return '<div class="notice notice-ok" style="margin:0"><span style="color:var(--green);font-weight:600">✓ No contraindications recorded.</span> This patient has no documented safety flags.</div>';
        return flags.map(f => govFlag(f.msg, f.level)).join('');
      })())}
    </div>
    <div>
      ${cardWrap('Contact & Insurance', [
        ['Email', pt.email || '—'],
        ['Phone', pt.phone || '—'],
        ['Insurance', pt.insurance_provider || '—'],
        ['Insurance #', pt.insurance_number || '—'],
        ['Consent Signed', pt.consent_signed ? `<span style="color:var(--green)">Yes — ${pt.consent_date || ''}</span>` : '<span style="color:var(--amber)">Not yet</span>'],
      ].map(([k, v]) => fr(k, v)).join(''))}
      ${cardWrap('Quick Links', `<div style="display:grid;gap:7px">
        <button class="btn btn-sm" onclick="window.startNewCourse()">+ New Treatment Course ◎</button>
        <button class="btn btn-sm" onclick="window.switchPT('courses')">View Courses</button>
        <button class="btn btn-sm" onclick="window.switchPT('sessions')">View Sessions</button>
        <button class="btn btn-sm" onclick="window.switchPT('assessments')">Run Assessment</button>
      </div>`)}
    </div>
  </div>`;

  if (ptab === 'sessions') return `
    <div style="margin-bottom:14px;display:flex;gap:8px">
      <button class="btn btn-primary btn-sm" onclick="window.showNewSession()">+ Log Session</button>
    </div>
    <div id="new-session-form" style="display:none;margin-bottom:16px">
      ${cardWrap('Log Session', `
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="form-group"><label class="form-label">Date & Time</label><input id="ns-date" class="form-control" type="datetime-local" required></div>
          <div class="form-group"><label class="form-label">Duration (minutes)</label><input id="ns-dur" class="form-control" type="number" value="30" min="5" max="180" required></div>
          <div class="form-group"><label class="form-label">Modality</label>
            <select id="ns-mod" class="form-control" required><option value="">Select modality…</option>
              ${FALLBACK_MODALITIES.map(m => `<option>${m}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="ns-error" style="color:var(--red);font-size:12px;display:none;margin-bottom:8px"></div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn" onclick="document.getElementById('new-session-form').style.display='none'">Cancel</button>
          <button class="btn btn-primary" onclick="window.saveSession()">Log Session</button>
        </div>
      `)}
    </div>
    ${sessions.length === 0
      ? emptyState('◻', 'No sessions logged yet', 'Log your first treatment session to track delivery and outcomes.', '+ Log Session', 'window.showNewSession()')
      : cardWrap('Session Log', `<table class="ds-table">
        <thead><tr><th>#</th><th>Date</th><th>Modality</th><th>Duration</th><th>Status</th><th>Outcome</th><th></th></tr></thead>
        <tbody>${sessions.map(s => `<tr>
          <td class="mono">${s.session_number || '—'}</td>
          <td style="color:var(--text-secondary)">${s.scheduled_at ? s.scheduled_at.split('T')[0] : '—'}</td>
          <td><span class="tag">${s.modality || '—'}</span></td>
          <td class="mono">${s.duration_minutes || '—'} min</td>
          <td>${pillSt(s.status || 'pending')}</td>
          <td style="font-size:12px;color:var(--text-secondary)">${s.outcome || '—'}</td>
          <td><button class="btn btn-sm" onclick="window.completeSession('${s.id}')">Mark Done</button></td>
        </tr>`).join('')}</tbody>
      </table>`)}`;

  if (ptab === 'protocol') return `<div class="g2">
    ${cardWrap(savedProto ? 'Saved Protocol ✓' : 'Current Protocol',
      savedProto ? `
        <div style="font-family:var(--font-display);font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:3px">${savedProto.protocol_name || savedProto.rationale?.split('.')[0] || 'AI Protocol'}</div>
        <div style="font-size:11.5px;color:var(--teal);margin-bottom:14px">${savedProto.modality || pt.primary_modality || '—'}</div>
        ${[
          ['Target Region', savedProto.target_region || '—'],
          ['Evidence Grade', savedProto.evidence_grade || '—'],
          ['Session Freq.', savedProto.session_frequency || '—'],
          ['Duration', savedProto.duration || '—'],
          ['Approval', savedProto.approval_status_badge || '—'],
        ].map(([k, v]) => fr(k, v)).join('')}
        <div style="background:rgba(0,212,188,0.05);border:1px solid var(--border-teal);border-radius:var(--radius-md);padding:12px;margin-top:12px;font-size:12px;color:var(--text-secondary);line-height:1.65">${savedProto.rationale || ''}</div>
        <div style="display:flex;gap:7px;margin-top:12px">
          <button class="btn btn-sm" onclick="window.exportProto()">Download DOCX</button>
          <button class="btn btn-sm" onclick="window._savedProto=null;window.switchPT('protocol')">Regenerate</button>
        </div>
      ` : fr('Condition', pt.primary_condition || '—') + fr('Modality', pt.primary_modality || '—') + `<div style="margin-top:12px;font-size:12px;color:var(--text-secondary)">Generate a protocol using the AI generator →</div>`,
      savedProto ? '<span class="pill pill-active" style="font-size:10px">AI Generated</span>' : ''
    )}
    ${cardWrap('AI Protocol Generator ✦', `<div id="ai-gen-zone">${renderAIZone(pt)}</div>`)}
  </div>`;

  if (ptab === 'assessments') {
    const patId = pt.id;
    const patName = `${pt.first_name} ${pt.last_name}`;
    return `
    <div style="margin-bottom:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" onclick="window._launchInlineAssess('PHQ-9','${patId}')">Run PHQ-9</button>
      <button class="btn btn-primary btn-sm" onclick="window._launchInlineAssess('GAD-7','${patId}')">Run GAD-7</button>
      <button class="btn btn-primary btn-sm" onclick="window._launchInlineAssess('ISI','${patId}')">Run ISI</button>
      <button class="btn btn-sm" onclick="window._nav('assessments')">All Assessments →</button>
    </div>
    <div id="assessments-tab-body">${spinner()}</div>`;
  }

  if (ptab === 'notes') return `
    ${cardWrap('New Note', `
      <div class="form-group"><label class="form-label">Note type</label>
        <select id="pt-note-type" class="form-control">
          <option value="post_session_note">Session Note</option>
          <option value="progress_note">Progress Note</option>
          <option value="clinical_update">Clinical Update</option>
          <option value="adverse_event">Adverse Event</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Clinical note</label>
        <textarea id="pt-note-text" class="form-control" style="height:120px" placeholder="Write clinical note…"></textarea>
      </div>
      <div id="pt-note-err" style="color:var(--red);font-size:12px;display:none;margin-bottom:8px"></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" onclick="window._savePatientNote()">Save Note</button>
      </div>
    `)}
    ${cardWrap('Previous Notes', `<div id="pt-notes-list">${spinner()}</div>`)}
  `;

  if (ptab === 'billing') return cardWrap('Billing', `
    <div style="padding:24px;text-align:center;color:var(--text-tertiary)">
      <div style="font-size:12px">Session billing codes are managed per session. Go to <strong>Sessions</strong> tab to update billing.</div>
    </div>
  `);

  if (ptab === 'outcomes') return spinner();
  if (ptab === 'phenotype') return spinner();
  if (ptab === 'consent') return spinner();
  if (ptab === 'monitoring') return spinner();
  if (ptab === 'home-therapy') return spinner();

  return '';
}

// ── Outcomes tab ──────────────────────────────────────────────────────────────
function renderOutcomesTab(pt, outcomes, courses) {
  const courseMap = {};
  courses.forEach(c => { courseMap[c.id] = `${c.condition_slug?.replace(/-/g,' ') || '—'} · ${c.modality_slug || '—'}`; });

  return `
    <div style="margin-bottom:14px;display:flex;gap:8px">
      <button class="btn btn-primary btn-sm" onclick="document.getElementById('new-outcome-form').style.display=''">+ Record Outcome</button>
    </div>
    <div id="new-outcome-form" style="display:none;margin-bottom:16px">
      ${cardWrap('Record Outcome', `
        <div class="g2">
          <div>
            <div class="form-group"><label class="form-label">Course</label>
              <select id="oc-course" class="form-control">
                <option value="">Select course…</option>
                ${courses.map(c => `<option value="${c.id}">${courseMap[c.id]}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label class="form-label">Assessment</label>
              <select id="oc-template" class="form-control">
                <option value="">Select…</option>
                ${FALLBACK_ASSESSMENT_TEMPLATES.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label class="form-label">Score</label>
              <input id="oc-score" class="form-control" type="number" step="0.1" placeholder="0">
            </div>
          </div>
          <div>
            <div class="form-group"><label class="form-label">Baseline Score</label>
              <input id="oc-baseline" class="form-control" type="number" step="0.1" placeholder="Pre-treatment score">
            </div>
            <div class="form-group"><label class="form-label">Assessment Date</label>
              <input id="oc-date" class="form-control" type="date">
            </div>
            <div class="form-group"><label class="form-label">Notes</label>
              <textarea id="oc-notes" class="form-control" style="height:60px" placeholder="Clinician notes…"></textarea>
            </div>
          </div>
        </div>
        <div id="oc-error" style="color:var(--red);font-size:12px;display:none;margin-bottom:8px"></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" onclick="document.getElementById('new-outcome-form').style.display='none'">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="window._saveOutcome()">Save Outcome</button>
        </div>
      `)}
    </div>
    ${outcomes.length === 0
      ? emptyState('◫', 'No outcomes recorded yet', 'Run assessments to measure treatment response and clinical progress.', '+ Run Assessment', 'window.switchPT("assessments")')
      : `<div class="card" style="overflow-x:auto">
          <table class="ds-table">
            <thead><tr>
              <th>Date</th><th>Assessment</th><th>Score</th><th>Baseline</th><th>Δ Change</th><th>Course</th><th>Notes</th>
            </tr></thead>
            <tbody>
              ${outcomes.map(o => {
                const delta = (o.score !== null && o.score !== undefined && o.baseline_score !== null && o.baseline_score !== undefined)
                  ? (o.score - o.baseline_score).toFixed(1) : null;
                const deltaColor = delta !== null ? (parseFloat(delta) < 0 ? 'var(--green)' : parseFloat(delta) > 0 ? 'var(--red)' : 'var(--text-secondary)') : '';
                return `<tr>
                  <td class="mono" style="white-space:nowrap">${o.assessed_at ? o.assessed_at.split('T')[0] : '—'}</td>
                  <td style="font-size:12px;font-weight:500">${o.assessment_template_id || '—'}</td>
                  <td class="mono">${o.score ?? '—'}</td>
                  <td class="mono" style="color:var(--text-secondary)">${o.baseline_score ?? '—'}</td>
                  <td class="mono" style="color:${deltaColor}">${delta !== null ? (parseFloat(delta) < 0 ? delta : '+' + delta) : '—'}</td>
                  <td style="font-size:11px;color:var(--text-secondary)">${courseMap[o.course_id] || (o.course_id ? o.course_id.slice(0,8) + '…' : '—')}</td>
                  <td style="font-size:11.5px;color:var(--text-secondary);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.notes || '—'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`
    }`;
}

function bindOutcomesActions(pt) {
  window._saveOutcome = async function() {
    const errEl = document.getElementById('oc-error');
    errEl.style.display = 'none';
    const score = parseFloat(document.getElementById('oc-score').value);
    const baseline = parseFloat(document.getElementById('oc-baseline').value);
    const data = {
      patient_id: pt.id,
      course_id: document.getElementById('oc-course').value || null,
      assessment_template_id: document.getElementById('oc-template').value || null,
      score: isNaN(score) ? null : score,
      baseline_score: isNaN(baseline) ? null : baseline,
      assessed_at: document.getElementById('oc-date').value || null,
      notes: document.getElementById('oc-notes').value.trim() || null,
    };
    if (!data.assessment_template_id) { errEl.textContent = 'Select an assessment.'; errEl.style.display = ''; return; }
    try {
      await api.recordOutcome(data);
      const [outcomes, courses] = await Promise.all([
        api.listOutcomes({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []),
        api.listCourses({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []),
      ]);
      window._currentCourses = courses;
      document.getElementById('ptab-body').innerHTML = renderOutcomesTab(pt, outcomes, courses);
      bindOutcomesActions(pt);
    } catch (e) { errEl.textContent = e.message || 'Save failed.'; errEl.style.display = ''; }
  };
}

// ── Phenotype tab ─────────────────────────────────────────────────────────────
function renderPhenotypeTab(pt, assigns, phenos) {
  const CONF_COLOR = { high: 'var(--teal)', moderate: 'var(--blue)', low: 'var(--amber)' };

  // Existing assignments table
  const assignmentsHtml = assigns.length === 0
    ? emptyState('◎', 'No phenotype assignments yet', 'Assign phenotypes based on clinical presentation and assessments.')
    : `<div style="overflow-x:auto"><table class="ds-table">
        <thead><tr>
          <th>Phenotype</th><th>Assigned</th><th>Confidence</th><th>qEEG</th><th>Rationale</th><th></th>
        </tr></thead>
        <tbody>
          ${assigns.map(a => {
            const cc = CONF_COLOR[a.confidence] || 'var(--text-tertiary)';
            return `<tr>
              <td style="font-weight:500">${a.phenotype_id}</td>
              <td style="color:var(--text-tertiary);font-size:11.5px">${a.assigned_at ? a.assigned_at.split('T')[0] : '—'}</td>
              <td><span style="font-size:11px;padding:2px 7px;border-radius:4px;background:${cc}22;color:${cc}">${a.confidence || '—'}</span></td>
              <td>${a.qeeg_supported ? '<span style="font-size:10px;color:var(--teal)">✓ qEEG</span>' : '<span style="color:var(--text-tertiary);font-size:11px">—</span>'}</td>
              <td style="font-size:11.5px;color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.rationale || '—'}</td>
              <td><button class="btn btn-sm" style="color:var(--red);font-size:10.5px" onclick="window._deletePheno('${a.id}')">Remove</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>`;

  // Phenotype library cards
  const libraryHtml = phenos.length === 0
    ? ''
    : `<div style="margin-top:24px">
        <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:1.1px;padding-bottom:10px;border-bottom:1px solid var(--border);margin-bottom:14px">Phenotype Library</div>
        <div class="g3">
          ${phenos.map(ph => {
            const phid = ph.id || '';
            const recommendedMods = (ph.recommended_modalities || ph.modalities || []);
            return `<div class="card" style="margin-bottom:0;padding:14px 16px;transition:border-color var(--transition)" onmouseover="this.style.borderColor='var(--border-teal)'" onmouseout="this.style.borderColor='var(--border)'">
              <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px">${ph.name || ph.slug || phid}</div>
              ${ph.description ? `<div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5;margin-bottom:8px">${ph.description.slice(0, 120)}${ph.description.length > 120 ? '…' : ''}</div>` : ''}
              ${ph.typical_biomarker_patterns || ph.biomarker_patterns ? `<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px">Biomarkers: ${ph.typical_biomarker_patterns || ph.biomarker_patterns}</div>` : ''}
              ${recommendedMods.length ? `<div style="margin-bottom:8px">${recommendedMods.slice(0, 4).map(m => `<span class="tag" style="font-size:10.5px">${m}</span>`).join('')}</div>` : ''}
              <button class="btn btn-sm" style="width:100%;font-size:11px;margin-top:4px" onclick="window._quickAssignPheno('${phid}')">Assign to Patient</button>
            </div>`;
          }).join('')}
        </div>
      </div>`;

  return `
    <div style="margin-bottom:14px;display:flex;gap:8px">
      <button class="btn btn-primary btn-sm" onclick="document.getElementById('new-pheno-form').style.display=''">+ Assign Phenotype</button>
    </div>
    <div id="new-pheno-form" style="display:none;margin-bottom:16px">
      ${cardWrap('Assign Phenotype', `
        <div class="g2">
          <div>
            <div class="form-group"><label class="form-label">Phenotype</label>
              <select id="ph-id" class="form-control">
                <option value="">Select…</option>
                ${phenos.map(p => `<option value="${p.id}">${p.name || p.slug || p.id}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label class="form-label">Confidence</label>
              <select id="ph-conf" class="form-control">
                <option value="moderate">Moderate</option>
                <option value="high">High</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
          <div>
            <div class="form-group"><label class="form-label">Rationale / Notes</label>
              <textarea id="ph-rationale" class="form-control" style="height:76px" placeholder="Clinical basis for this phenotype…"></textarea>
            </div>
            <div class="form-group" style="margin-top:8px">
              <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
                <input type="checkbox" id="ph-qeeg"> qEEG-supported
              </label>
            </div>
          </div>
        </div>
        <div id="ph-error" style="color:var(--red);font-size:12px;display:none;margin-bottom:8px"></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" onclick="document.getElementById('new-pheno-form').style.display='none'">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="window._savePhenotype()">Save Assignment</button>
        </div>
      `)}
    </div>
    ${cardWrap(`Existing Assignments (${assigns.length})`, assignmentsHtml)}
    ${libraryHtml}`;
}

function bindPhenotypeActions(pt) {
  window._savePhenotype = async function() {
    const errEl = document.getElementById('ph-error');
    errEl.style.display = 'none';
    const phenotype_id = document.getElementById('ph-id').value;
    if (!phenotype_id) { errEl.textContent = 'Select a phenotype.'; errEl.style.display = ''; return; }
    const data = {
      patient_id: pt.id,
      phenotype_id,
      confidence: document.getElementById('ph-conf').value,
      rationale: document.getElementById('ph-rationale').value.trim() || null,
      qeeg_supported: document.getElementById('ph-qeeg').checked,
    };
    try {
      await api.assignPhenotype(data);
      const [assigns, phenos] = await Promise.all([
        api.listPhenotypeAssignments({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []),
        api.phenotypes().then(r => r?.items || r || []).catch(() => []),
      ]);
      document.getElementById('ptab-body').innerHTML = renderPhenotypeTab(pt, assigns, phenos);
      bindPhenotypeActions(pt);
    } catch (e) { errEl.textContent = e.message || 'Save failed.'; errEl.style.display = ''; }
  };

  window._deletePheno = async function(id) {
    if (!confirm('Remove this phenotype assignment?')) return;
    try {
      await api.deletePhenotypeAssignment(id);
      const [assigns, phenos] = await Promise.all([
        api.listPhenotypeAssignments({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []),
        api.phenotypes().then(r => r?.items || r || []).catch(() => []),
      ]);
      document.getElementById('ptab-body').innerHTML = renderPhenotypeTab(pt, assigns, phenos);
      bindPhenotypeActions(pt);
    } catch (e) {
      const errEl = document.getElementById('ph-error');
      if (errEl) { errEl.textContent = e.message || 'Delete failed.'; errEl.style.display = ''; }
      else { _dsToast(e.message || 'Delete failed. Please try again.', 'error'); }
    }
  };

  window._quickAssignPheno = async function(phenoId) {
    if (!phenoId) return;
    if (!confirm(`Assign phenotype "${phenoId}" to this patient?`)) return;
    try {
      await api.assignPhenotype({ patient_id: pt.id, phenotype_id: phenoId, confidence: 'moderate' });
      const [assigns, phenos] = await Promise.all([
        api.listPhenotypeAssignments({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []),
        api.phenotypes().then(r => r?.items || r || []).catch(() => []),
      ]);
      document.getElementById('ptab-body').innerHTML = renderPhenotypeTab(pt, assigns, phenos);
      bindPhenotypeActions(pt);
    } catch (e) {
      const b = document.createElement('div');
      b.className = 'notice notice-warn';
      b.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:380px';
      b.textContent = e.message || 'Assignment failed.';
      document.body.appendChild(b); setTimeout(() => b.remove(), 4000);
    }
  };
}

// ── Consent tab ───────────────────────────────────────────────────────────────
function _consentStatusBadge(status, expiryDate) {
  const today = new Date(); today.setHours(0,0,0,0);
  const exp = expiryDate ? new Date(expiryDate) : null;
  const isExpired = exp && exp < today;
  const expiringSoon = exp && !isExpired && (exp - today) < 30 * 86400000;
  if (isExpired || status === 'expired') return `<span style="font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:4px;background:rgba(255,107,107,0.1);color:var(--red)">Expired</span>`;
  if (status === 'withdrawn') return `<span style="font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:4px;background:rgba(255,107,107,0.1);color:var(--red)">Withdrawn</span>`;
  if (status === 'pending') return `<span style="font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:4px;background:rgba(255,181,71,0.1);color:var(--amber)">Pending</span>`;
  if (expiringSoon) return `<span style="font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:4px;background:rgba(255,181,71,0.1);color:var(--amber)">Active — Expiring Soon</span>`;
  return `<span style="font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:4px;background:rgba(0,212,188,0.1);color:var(--teal)">Active</span>`;
}

function renderConsentTab(pt, consents) {
  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = today.toISOString().split('T')[0];
  const nextYear = new Date(today); nextYear.setFullYear(nextYear.getFullYear() + 1);
  const nextYearStr = nextYear.toISOString().split('T')[0];

  // Consent status summary
  const treatmentConsents = consents.filter(c => c.consent_type === 'treatment' && c.status !== 'withdrawn');
  const hasValidTreatment = treatmentConsents.some(c => {
    const exp = c.expires_at ? new Date(c.expires_at) : null;
    return (!exp || exp >= today) && c.status === 'active';
  });
  const hasExpired = consents.some(c => {
    const exp = c.expires_at ? new Date(c.expires_at) : null;
    return (exp && exp < today) || c.status === 'expired';
  });
  const hasPending = consents.some(c => c.status === 'pending');

  const summaryBanner = hasValidTreatment && !hasExpired
    ? `<div class="notice notice-ok" style="margin-bottom:14px"><span style="color:var(--green);font-weight:600">&#10003; Consent on file.</span> Valid treatment consent recorded.</div>`
    : hasExpired
    ? govFlag('One or more consents have expired. Review and renew before proceeding with treatment.', 'error')
    : hasPending
    ? govFlag('Consent records are pending. Obtain signed consent before delivering treatment.', 'warn')
    : consents.length === 0
    ? govFlag('No consent records found. Obtain and record consent before starting treatment.', 'warn')
    : '';

  return `
    ${summaryBanner}
    <div style="margin-bottom:14px;display:flex;gap:8px">
      <button class="btn btn-primary btn-sm" onclick="(function(){var f=document.getElementById('new-consent-form');f.style.display=f.style.display==='none'?'':'none';})()">+ Add Consent</button>
    </div>
    <div id="new-consent-form" style="display:none;margin-bottom:16px">
      ${cardWrap('New Consent Record', `
        <div class="g2">
          <div>
            <div class="form-group"><label class="form-label">Consent Type</label>
              <select id="cn-type" class="form-control">
                <option value="treatment">Treatment</option>
                <option value="data_processing">Data Processing</option>
                <option value="recording">Recording</option>
                <option value="telehealth">Telehealth</option>
                <option value="research">Research</option>
              </select>
            </div>
            <div class="form-group"><label class="form-label">Signed Date</label>
              <input id="cn-signed-at" type="date" class="form-control" value="${todayStr}">
            </div>
            <div class="form-group"><label class="form-label">Expiry Date</label>
              <input id="cn-expires-at" type="date" class="form-control" value="${nextYearStr}">
            </div>
          </div>
          <div>
            <div class="form-group"><label class="form-label">Method</label>
              <select id="cn-method" class="form-control">
                <option value="written">Written</option>
                <option value="verbal">Verbal</option>
                <option value="digital">Digital</option>
                <option value="witnessed">Witnessed</option>
              </select>
            </div>
            <div class="form-group"><label class="form-label">Notes</label>
              <textarea id="cn-notes" class="form-control" style="height:80px" placeholder="Optional notes, document references..."></textarea>
            </div>
          </div>
        </div>
        <div id="cn-error" style="color:var(--red);font-size:12px;display:none;margin-bottom:8px"></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" onclick="document.getElementById('new-consent-form').style.display='none'">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="window._saveConsent()">Save Consent</button>
        </div>
      `)}
    </div>
    ${consents.length === 0
      ? emptyState('&#9671;', 'No consent records yet', 'Obtain and record patient consent before starting treatment.')
      : `<div class="card" style="overflow:hidden">
          <table class="ds-table" style="width:100%">
            <thead><tr>
              <th>Type</th><th>Status</th><th>Signed</th><th>Expires</th><th>Method</th><th>Actions</th>
            </tr></thead>
            <tbody>
              ${consents.map(c => {
                const exp = c.expires_at ? new Date(c.expires_at) : null;
                const isExpired = exp && exp < today;
                const expiringSoon = exp && !isExpired && (exp - today) < 30 * 86400000;
                const expCell = c.expires_at
                  ? c.expires_at.split('T')[0] + (isExpired ? ' <span style="color:var(--red);font-weight:700">&#9888;</span>' : expiringSoon ? ' <span style="color:var(--amber)">&#9888;</span>' : '')
                  : '&#8212;';
                return `<tr>
                  <td style="font-weight:500">${(c.consent_type||'').replace(/_/g,' ')}</td>
                  <td>${_consentStatusBadge(c.status, c.expires_at)}</td>
                  <td style="font-size:12px">${c.signed_at ? c.signed_at.split('T')[0] : '&#8212;'}</td>
                  <td style="font-size:12px">${expCell}</td>
                  <td style="font-size:12px;color:var(--text-secondary)">${c.method || c.modality_slug || '&#8212;'}</td>
                  <td>${c.status !== 'withdrawn' ? `<button class="btn btn-sm" style="font-size:10px;padding:2px 8px;color:var(--red);border-color:rgba(255,107,107,0.3)" onclick="window._revokeConsent('${c.id}')">Revoke</button>` : '<span style="font-size:11px;color:var(--text-tertiary)">Withdrawn</span>'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          ${consents.some(c => c.notes) ? `<div style="padding:12px 16px;border-top:1px solid var(--border)">
            ${consents.filter(c => c.notes).map(c => `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px"><strong style="color:var(--text-primary)">${(c.consent_type||'').replace(/_/g,' ')}:</strong> ${c.notes}</div>`).join('')}
          </div>` : ''}
        </div>`
    }`;
}

function bindConsentActions(pt) {
  window._saveConsent = async function() {
    const errEl = document.getElementById('cn-error');
    if (errEl) errEl.style.display = 'none';
    const data = {
      patient_id: pt.id,
      consent_type: document.getElementById('cn-type').value,
      signed_at: document.getElementById('cn-signed-at').value || null,
      expires_at: document.getElementById('cn-expires-at').value || null,
      method: document.getElementById('cn-method').value || null,
      notes: document.getElementById('cn-notes').value.trim() || null,
      status: 'active',
    };
    try {
      await api.createConsent(data);
      const consents = await api.listConsents({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []);
      document.getElementById('ptab-body').innerHTML = renderConsentTab(pt, consents);
      bindConsentActions(pt);
    } catch (e) { if (errEl) { errEl.textContent = e.message || 'Save failed.'; errEl.style.display = ''; } }
  };

  window._revokeConsent = async function(id) {
    if (!confirm('Revoke this consent record?')) return;
    try {
      await api.updateConsent(id, { status: 'withdrawn' });
      const consents = await api.listConsents({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []);
      document.getElementById('ptab-body').innerHTML = renderConsentTab(pt, consents);
      bindConsentActions(pt);
    } catch (e) {
      const t = document.createElement('div'); t.className = 'notice notice-error'; t.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:360px'; t.textContent = e.message || 'Revoke failed.'; document.body.appendChild(t); setTimeout(() => t.remove(), 4000);
    }
  };

  // Keep legacy _signConsent in case it is referenced elsewhere
  window._signConsent = async function(id) {
    const btn = document.querySelector(`[onclick="window._signConsent('${id}')"]`);
    if (btn && btn.disabled) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Signing…'; }
    try {
      await api.updateConsent(id, { signed: true });
      const consents = await api.listConsents({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []);
      document.getElementById('ptab-body').innerHTML = renderConsentTab(pt, consents);
      bindConsentActions(pt);
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Sign'; }
      const t = document.createElement('div'); t.className = 'notice notice-error'; t.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:360px'; t.textContent = e.message || 'Sign failed.'; document.body.appendChild(t); setTimeout(() => t.remove(), 4000);
    }
  };
}

// ── Monitoring tab ────────────────────────────────────────────────────────────
// Guard flag prevents concurrent AI summary requests
let _monitoringAiInProgress = false;

function renderMonitoringTab(pt, wData, navigate) {
  const summaries    = wData?.summaries     || [];
  const connections  = wData?.connections   || [];
  const alertFlags   = wData?.recent_alerts || [];
  const latest       = summaries.length ? summaries[summaries.length - 1] : null;

  // ── Mini sparkline (inline SVG) ──────────────────────────────────────────
  function miniSpark(vals, color) {
    // viewBox + fluid width so sparklines scale on narrow/mobile viewports without overflow
    const svgAttrs = `viewBox="0 0 80 20" style="width:100%;max-width:80px;height:20px;display:block"`;
    if (!vals || vals.length < 2) return `<svg ${svgAttrs}><line x1="0" y1="10" x2="80" y2="10" stroke="${color}" stroke-width="1" stroke-dasharray="2,2" opacity=".3"/></svg>`;
    const max = Math.max(...vals), min = Math.min(...vals), range = max - min || 1;
    const pts = vals.map((v, i) => {
      const x = 3 + (i / (vals.length - 1)) * 74;
      const y = 3 + 14 - ((v - min) / range) * 14;
      return `${x},${y}`;
    }).join(' ');
    return `<svg ${svgAttrs}><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function trendVals(field) { return summaries.map(s => s[field]).filter(v => v != null); }
  function trendArrow(vals) {
    if (vals.length < 2) return '<span style="color:var(--text-tertiary)">→</span>';
    const delta = vals[vals.length - 1] - vals[0];
    if (delta > 0) return '<span style="color:var(--green)">↑</span>';
    if (delta < 0) return '<span style="color:var(--red)">↓</span>';
    return '<span style="color:var(--text-tertiary)">→</span>';
  }

  function metricCard(label, field, unit, color) {
    const vals = trendVals(field);
    const cur  = vals.length ? vals[vals.length - 1] : null;
    return `<div class="card" style="padding:12px 14px;position:relative;overflow:hidden">
      <div style="position:absolute;top:0;left:0;width:3px;height:100%;background:${color}"></div>
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;color:var(--text-tertiary);margin-bottom:4px">${label}</div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <span style="font-size:18px;font-weight:700;color:${color};font-family:var(--font-mono)">${cur != null ? cur : '—'}</span>
        <span style="font-size:10.5px;color:var(--text-tertiary)">${unit}</span>
        <span style="margin-left:auto">${trendArrow(vals)}</span>
      </div>
      ${miniSpark(vals, color)}
    </div>`;
  }

  // ── Alert flag colours ────────────────────────────────────────────────────
  const FLAG_STYLE = {
    sleep_worsening:   { color: 'var(--amber)', bg: 'rgba(255,181,71,0.08)',  icon: '▲', label: 'Sleep Worsening' },
    rhr_rising:        { color: 'var(--amber)', bg: 'rgba(255,181,71,0.08)',  icon: '▲', label: 'RHR Rising' },
    hrv_declining:     { color: 'var(--amber)', bg: 'rgba(255,181,71,0.08)',  icon: '▲', label: 'HRV Declining' },
    sync_gap:          { color: 'var(--blue)',  bg: 'rgba(74,158,255,0.08)',  icon: '◌', label: 'Sync Gap' },
    symptom_worsening: { color: 'var(--red)',   bg: 'rgba(255,107,107,0.08)', icon: '◉', label: 'Symptom Worsening' },
    presession_concern:{ color: 'var(--red)',   bg: 'rgba(255,107,107,0.08)', icon: '◉', label: 'Pre-session Concern' },
  };

  function flagRow(flag) {
    const st = FLAG_STYLE[flag.flag_type] || { color: 'var(--text-tertiary)', bg: 'rgba(255,255,255,0.04)', icon: '◎', label: flag.flag_type || 'Unknown' };
    const sevColors = { critical: 'var(--red)', warning: 'var(--amber)', info: 'var(--blue)' };
    const sevColor = sevColors[flag.severity] || st.color;
    const sevLabel = flag.severity ? flag.severity.toUpperCase() : 'INFO';
    const timeStr = flag.triggered_at ? new Date(flag.triggered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
    return `<div id="flag-row-${flag.id || ''}" style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--radius-md);background:${st.bg};border:1px solid ${sevColor}44;margin-bottom:6px">
      <span style="font-size:9px;font-weight:700;color:${sevColor};background:rgba(0,0,0,.2);padding:2px 6px;border-radius:99px;border:1px solid ${sevColor}66;flex-shrink:0;white-space:nowrap">${sevLabel}</span>
      <span style="color:${st.color};font-size:13px;flex-shrink:0">${st.icon}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12.5px;font-weight:600;color:${st.color}">${st.label}</div>
        ${flag.detail ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${flag.detail}</div>` : ''}
      </div>
      <div style="font-size:10.5px;color:var(--text-tertiary);white-space:nowrap;flex-shrink:0">${timeStr}</div>
      <button class="btn btn-sm" style="font-size:11px;flex-shrink:0" onclick="window._reviewFlag('${flag.id || ''}')">Review</button>
      <button class="btn btn-sm" style="font-size:11px;flex-shrink:0;color:var(--text-tertiary)" onclick="window._dismissAlertFlag('${flag.id || ''}')">Dismiss</button>
    </div>`;
  }

  // ── Readiness score ───────────────────────────────────────────────────────
  function computeReadiness() {
    if (!latest) return null;
    let score = 100;
    const factors = [];
    const hrv   = latest.hrv_ms;
    const sleep = latest.sleep_duration_h;
    const rhr   = latest.rhr_bpm;

    if (hrv != null && hrv < 40)    { score -= 20; factors.push({ label: 'Low HRV', delta: -20, color: 'var(--amber)' }); }
    if (sleep != null && sleep < 6) { score -= 15; factors.push({ label: 'Poor sleep (<6h)', delta: -15, color: 'var(--amber)' }); }
    if (rhr != null && rhr > 80)    { score -= 10; factors.push({ label: 'Elevated resting HR', delta: -10, color: 'var(--amber)' }); }

    const alertPenalty = Math.min(alertFlags.length * 10, 30);
    if (alertPenalty > 0) {
      score -= alertPenalty;
      factors.push({ label: `${alertFlags.length} recent alert flag${alertFlags.length > 1 ? 's' : ''}`, delta: -alertPenalty, color: 'var(--red)' });
    }
    score = Math.max(0, Math.min(100, score));
    const color = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--amber)' : 'var(--red)';
    const label = score >= 70 ? 'Good' : score >= 40 ? 'Moderate' : 'Low';
    return { score, color, label, factors };
  }

  const readiness = computeReadiness();

  const dataAsOf = latest?.date
    ? `<span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:11.5px;margin-left:8px;opacity:.65">data as of ${latest.date}</span>`
    : '';

  return `
  <!-- Section 1: 7-day Health Trends -->
  <div style="margin-bottom:22px">
    <div style="font-size:13px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border)">
      7-day Health Trends${dataAsOf}
    </div>
    ${summaries.length === 0
      ? `<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:12.5px;background:var(--bg-card);border-radius:var(--radius-md);border:1px solid var(--border)">
          <div style="font-size:22px;margin-bottom:8px;opacity:.35">◌</div>
          No wearable data available for this patient.
        </div>`
      : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:12px">
          ${metricCard('Resting HR', 'rhr_bpm', 'bpm', 'var(--teal)')}
          ${metricCard('HRV', 'hrv_ms', 'ms', 'var(--blue)')}
          ${metricCard('Sleep', 'sleep_duration_h', 'hrs', 'var(--violet)')}
          ${metricCard('Steps', 'steps', '/day', 'var(--green)')}
          ${metricCard('SpO\u2082', 'spo2_pct', '%', 'var(--blue)')}
        </div>
        ${connections.length > 0 ? `<div style="font-size:11px;color:var(--text-tertiary)">
          Sources: ${connections.map(c => c.display_name || c.source).join(', ')}
        </div>` : ''}`
    }
  </div>

  <!-- Section 2: Alert Flags -->
  <div style="margin-bottom:22px">
    <div style="font-size:13px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border)">
      Alert Flags
    </div>
    <div id="monitoring-flags-wrap">
    ${alertFlags.length === 0
      ? `<div style="font-size:12.5px;color:var(--text-tertiary);padding:12px 0">No alert flags recorded.</div>`
      : alertFlags.map(f => flagRow(f)).join('')
    }
    </div>
  </div>

  <!-- Section 3: AI Summary -->
  <div style="margin-bottom:22px">
    <div style="font-size:13px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border)">
      AI Clinical Summary
    </div>
    <div id="monitoring-ai-wrap">
      <button class="btn btn-primary btn-sm" id="monitoring-ai-btn" onclick="window._generateMonitoringSummary()">Generate AI Summary</button>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:6px">Summarises wearable trends, treatment progress, and outcomes over the last 30 days.</div>
    </div>
  </div>

  <!-- Section 4: Session Readiness -->
  <div>
    <div style="font-size:13px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border)">
      Readiness Before Next Session
    </div>
    ${!readiness
      ? `<div style="font-size:12.5px;color:var(--text-tertiary)">No wearable data — readiness score unavailable.</div>`
      : `<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div style="width:80px;height:80px;border-radius:50%;border:4px solid ${readiness.color};display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;background:rgba(0,0,0,.15)">
            <span style="font-size:20px;font-weight:800;color:${readiness.color};font-family:var(--font-mono);line-height:1">${readiness.score}</span>
            <span style="font-size:10px;color:${readiness.color};font-weight:600;margin-top:1px">${readiness.label}</span>
          </div>
          <div style="flex:1;min-width:180px">
            <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">Contributing factors</div>
            ${readiness.factors.length === 0
              ? `<div style="font-size:12px;color:var(--green)">No adverse factors detected.</div>`
              : readiness.factors.map(f => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;font-size:12px">
                  <span style="color:${f.color};font-weight:600">${f.delta}</span>
                  <span style="color:var(--text-secondary)">${f.label}</span>
                </div>`).join('')
            }
          </div>
        </div>`
    }
  </div>`;
}

function bindMonitoringActions(pt, wData, navigate) {
  window._reviewFlag = function(flagId) {
    if (navigate) navigate('review-queue');
  };

  window._dismissAlertFlag = async function(flagId) {
    if (!flagId) return;
    const rowEl = document.getElementById('flag-row-' + flagId);
    if (rowEl) {
      rowEl.style.opacity = '0.4';
      rowEl.style.pointerEvents = 'none';
    }
    try {
      await api.dismissAlertFlag(flagId);
      if (rowEl) rowEl.remove();
      const wrap = document.getElementById('monitoring-flags-wrap');
      if (wrap && !wrap.querySelector('[id^="flag-row-"]')) {
        wrap.innerHTML = '<div style="font-size:12.5px;color:var(--text-tertiary);padding:12px 0">No alert flags recorded.</div>';
      }
    } catch (_e) {
      if (rowEl) { rowEl.style.opacity = ''; rowEl.style.pointerEvents = ''; }
      _dsToast('Could not dismiss flag. Please try again.', 'error');
    }
  };

  window._generateMonitoringSummary = async function() {
    if (_monitoringAiInProgress) return;  // guard against double-click
    _monitoringAiInProgress = true;

    const wrap = document.getElementById('monitoring-ai-wrap');
    if (!wrap) { _monitoringAiInProgress = false; return; }
    wrap.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:14px;color:var(--text-tertiary);font-size:12.5px">
      <span style="display:inline-flex;gap:4px">${[0,1,2].map(i => `<span style="width:5px;height:5px;border-radius:50%;background:var(--teal);display:inline-block;animation:pulseDot 1.2s ${i*0.2}s infinite ease-in-out"></span>`).join('')}</span>
      Generating clinical summary…
    </div>`;

    try {
      const initMsg = 'Summarize this patient\'s wearable trends, treatment progress, and assessment outcomes over the last 30 days. Highlight correlations, concerns, and any missing data.';
      const result  = await api.wearableCopilotClinician(pt.id, [{ role: 'user', content: initMsg }]);
      const reply   = result?.message || result?.content || result?.reply || 'No summary generated.';
      const now     = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

      wrap.innerHTML = `<div class="card" style="border:1px solid var(--border)">
        <div class="card-body" style="padding:14px 16px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:10px">
            <span style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--teal)">AI-generated summary · logged for audit</span>
            <span style="font-size:11px;color:var(--text-tertiary)">${now}</span>
          </div>
          <div style="font-size:12.5px;color:var(--text-primary);line-height:1.6;white-space:pre-wrap;margin-bottom:12px">${reply.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
          <div style="font-size:10.5px;color:var(--text-tertiary);border-top:1px solid var(--border);padding-top:8px;margin-bottom:10px">
            For clinical reference only — verify with clinical judgment. This summary does not replace clinical assessment.
          </div>
          <button class="btn btn-sm" onclick="window._generateMonitoringSummary()">Regenerate</button>
        </div>
      </div>`;
    } catch (_e) {
      wrap.innerHTML = `<div class="notice notice-warn" style="font-size:12px">Could not generate summary. Please try again.</div>
        <button class="btn btn-sm" style="margin-top:8px" onclick="window._generateMonitoringSummary()">Retry</button>`;
    } finally {
      _monitoringAiInProgress = false;
    }
  };
}

window.showNewSession = function() {
  document.getElementById('new-session-form').style.display = '';
};

window.saveSession = async function() {
  const errEl = document.getElementById('ns-error');
  errEl.style.display = 'none';
  const pt = window._currentPatient;
  if (!pt) return;
  const data = {
    patient_id: pt.id,
    scheduled_at: document.getElementById('ns-date').value,
    duration_minutes: parseInt(document.getElementById('ns-dur').value) || 30,
    modality: document.getElementById('ns-mod').value || null,
    status: 'scheduled',
  };
  if (!data.scheduled_at) { errEl.textContent = 'Date and time required.'; errEl.style.display = ''; return; }
  if (!data.modality) { errEl.textContent = 'Modality required.'; errEl.style.display = ''; return; }
  try {
    await api.createSession(data);
    document.getElementById('new-session-form').style.display = 'none';
    window.switchPT('sessions');
  } catch (e) { errEl.textContent = e.message; errEl.style.display = ''; }
};

window._savePatientNote = async function() {
  const errEl = document.getElementById('pt-note-err');
  if (errEl) errEl.style.display = 'none';
  const pt = window._currentPatient;
  if (!pt) return;
  const noteType = document.getElementById('pt-note-type')?.value || 'post_session_note';
  const textContent = document.getElementById('pt-note-text')?.value?.trim() || '';
  if (!textContent) {
    if (errEl) { errEl.textContent = 'Note text required.'; errEl.style.display = ''; }
    return;
  }
  const btn = document.querySelector('#pt-note-text ~ div button, button[onclick*="_savePatientNote"]');
  if (btn) btn.disabled = true;
  try {
    await api.createClinicianNote({ patient_id: pt.id, note_type: noteType, text_content: textContent });
    const ta = document.getElementById('pt-note-text');
    if (ta) ta.value = '';
    window.switchPT('notes');
  } catch (e) {
    if (errEl) { errEl.textContent = e.message || 'Could not save note.'; errEl.style.display = ''; }
  } finally {
    if (btn) btn.disabled = false;
  }
};

window.completeSession = async function(id) {
  try { await api.updateSession(id, { status: 'completed' }); window._nav('profile'); } catch (e) {
    const b = document.createElement('div');
    b.className = 'notice notice-warn';
    b.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:380px';
    b.textContent = e.message || 'Update failed.';
    document.body.appendChild(b); setTimeout(() => b.remove(), 4000);
  }
};

window.exportProto = async function() {
  const pt = window._currentPatient;
  if (!pt || !savedProto) return;
  try {
    const blob = await api.exportProtocolDocx({
      condition_name: pt.primary_condition || 'Unknown',
      modality_name: pt.primary_modality || 'Unknown',
      device_name: '',
      setting: 'Clinic',
      evidence_threshold: 'A',
      off_label: false,
      symptom_cluster: '',
    });
    downloadBlob(blob, `protocol-${pt.first_name}-${pt.last_name}.docx`);
  } catch (e) {
    const b = document.createElement('div');
    b.className = 'notice notice-warn';
    b.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:380px';
    b.textContent = e.message || 'Export failed.';
    document.body.appendChild(b); setTimeout(() => b.remove(), 4000);
  }
};

// ── AI Zone ──────────────────────────────────────────────────────────────────
function renderAIZone(pt) {
  if (aiLoading) return `<div style="text-align:center;padding:32px 0">
    <div style="display:flex;justify-content:center;gap:5px;margin-bottom:16px">
      ${Array.from({ length: 5 }, (_, i) => `<div class="ai-dot" style="animation-delay:${i * .12}s"></div>`).join('')}
    </div>
    <div style="font-size:12.5px;color:var(--text-secondary)">Generating protocol from clinical data…</div>
  </div>`;

  if (aiResult?.devicePickRequired) {
    const rows = (aiResult.candidates || []).slice(0, 16).map(c => {
      const enc = encodeURIComponent(c.device_name || '');
      return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;font-size:12px">
        <span><strong>#${c.rank}</strong> ${String(c.device_name || '').replace(/</g, '&lt;')}</span>
        <button type="button" class="btn btn-sm btn-primary" onclick="window._pickProtocolDeviceFromEncoded('${enc}')">Use</button>
      </div>`;
    }).join('');
    return `<div style="text-align:left;max-width:440px;margin:0 auto">
      <div class="notice notice-warn" style="margin-bottom:12px;font-size:12px;line-height:1.5">${String(aiResult.pickMessage || '').replace(/</g, '&lt;')}</div>
      ${rows}
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:10px">Choose a device to continue. Ranking is deterministic from the imported clinical snapshot (see API <code>candidate_devices</code> rationale).</div>
    </div>`;
  }

  if (aiResult) return `
    <div style="font-family:var(--font-display);font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:2px">${aiResult.rationale?.split('.')[0] || 'Evidence-based protocol draft'}</div>
    <div style="font-size:11.5px;color:var(--teal);margin-bottom:14px">Evidence Grade: ${aiResult.evidence_grade || '—'} · ${aiResult.approval_status_badge || ''}</div>
    ${aiResult.device_resolution ? `<div style="font-size:11px;color:var(--text-tertiary);margin:-6px 0 10px;line-height:1.45">
      Device: <strong style="color:var(--text-secondary)">${String(aiResult.device_resolution.resolved_device || '').replace(/</g, '&lt;')}</strong>
      · ${String(aiResult.device_resolution.resolution_method || '').replace(/_/g, ' ')}
      ${aiResult.device_resolution.clinical_evidence_snapshot_id ? ` · snapshot <code style="font-size:10px">${aiResult.device_resolution.clinical_evidence_snapshot_id}</code>` : ''}
    </div>` : ''}
    <div style="background:rgba(0,212,188,0.05);border:1px solid var(--border-teal);border-radius:var(--radius-md);padding:12px;margin-bottom:12px;font-size:12px;color:var(--text-secondary);line-height:1.65">${aiResult.rationale || ''}</div>
    ${[
      ['Target Region', aiResult.target_region || '—'],
      ['Session Freq.', aiResult.session_frequency || '—'],
      ['Duration', aiResult.duration || '—'],
      ['Off-label', aiResult.off_label_review_required ? '⚠ Review required' : 'No'],
    ].map(([k, v]) => fr(k, `<span class="mono" style="color:var(--blue)">${v}</span>`)).join('')}
    ${aiResult.contraindications?.length ? `<div style="margin-top:10px;padding:10px;background:rgba(255,107,107,0.06);border:1px solid rgba(255,107,107,0.2);border-radius:var(--radius-md);font-size:12px;color:var(--red)">⚠ Contraindications: ${aiResult.contraindications.join(', ')}</div>` : ''}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-sm" onclick="window.resetAI()">Regenerate</button>
      <button class="btn btn-primary btn-sm" onclick="window.saveProtocol()">Save Protocol ✓</button>
    </div>`;

  const name = pt ? `${pt.first_name} ${pt.last_name}` : 'this patient';
  return `<div style="text-align:center;padding:22px 0">
    <div style="width:48px;height:48px;background:var(--teal-ghost);border:1px solid var(--border-teal);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:20px">🧬</div>
    <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:18px;line-height:1.65;max-width:320px;margin-left:auto;margin-right:auto">
      Build a <strong>safety-checked, evidence-graded draft</strong> for <strong style="color:var(--text-primary)">${name}</strong> from the imported clinical registry (condition + modality). Device is auto-resolved when only one compatible option exists; otherwise choose from the ranked list.
    </div>
    <div class="g2" style="margin-bottom:16px;text-align:left">
      <div class="form-group"><label class="form-label">Condition</label>
        <select id="ai-condition" class="form-control">
          <option value="${pt?.primary_condition || ''}">${pt?.primary_condition || 'Select…'}</option>
          ${FALLBACK_CONDITIONS.map(c => `<option>${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Modality</label>
        <select id="ai-modality" class="form-control">
          <option value="${pt?.primary_modality || ''}">${pt?.primary_modality || 'Select…'}</option>
          ${FALLBACK_MODALITIES.map(m => `<option>${m}</option>`).join('')}
        </select>
      </div>
    </div>
    <button class="btn btn-primary" onclick="window.runAI()" style="padding:10px 26px;font-size:13px">Generate draft ✦</button>
  </div>`;
}

function bindAI(pt) {
  window.runAI = async function() {
    aiLoading = true; aiResult = null;
    const z = document.getElementById('ai-gen-zone');
    if (z) z.innerHTML = renderAIZone(pt);
    const condition = document.getElementById('ai-condition')?.value || pt?.primary_condition || '';
    const modality = document.getElementById('ai-modality')?.value || pt?.primary_modality || '';
    const deviceOverride = window._protocolGenDeviceOverride || '';
    try {
      const res = await api.generateProtocol({
        condition: condition,
        symptom_cluster: 'General',
        modality: modality,
        device: deviceOverride,
        setting: 'Clinic',
        evidence_threshold: 'Systematic Review',
        off_label: false,
      });
      window._protocolGenDeviceOverride = '';
      aiResult = res;
    } catch (e) {
      if (e.status === 409 && e.body?.code === 'device_candidates_required' && e.body?.details?.candidate_devices?.length) {
        aiResult = {
          devicePickRequired: true,
          candidates: e.body.details.candidate_devices,
          pickMessage: e.body.message || 'Multiple compatible devices match this condition and modality.',
          _condition: condition,
          _modality: modality,
        };
      } else {
        aiResult = { rationale: `Error: ${e.body?.message || e.message}`, target_region: '—', evidence_grade: '—', approval_status_badge: 'error' };
      }
    }
    aiLoading = false;
    const zz = document.getElementById('ai-gen-zone');
    if (zz) { zz.innerHTML = renderAIZone(pt); bindAI(pt); }
  };
  window._pickProtocolDeviceAndGenerate = function(deviceName) {
    window._protocolGenDeviceOverride = deviceName;
    window.runAI();
  };
  window._pickProtocolDeviceFromEncoded = function(enc) {
    try { window._protocolGenDeviceOverride = decodeURIComponent(enc); } catch { window._protocolGenDeviceOverride = ''; }
    window.runAI();
  };
  window.resetAI = function() {
    aiResult = null;
    window._protocolGenDeviceOverride = '';
    const z = document.getElementById('ai-gen-zone');
    if (z) { z.innerHTML = renderAIZone(pt); bindAI(pt); }
  };
  window.saveProtocol = async function() {
    savedProto = aiResult;
    // Persist to backend (fire-and-forget, don't block UI)
    try {
      const ptId = pt?.id;
      await api.saveProtocol({
        patient_id: ptId || null,
        protocol_name: aiResult?.protocol_name || aiResult?.rationale?.split('.')[0] || 'AI Protocol',
        condition: aiResult?.condition || pt?.primary_condition || null,
        modality: aiResult?.modality || pt?.primary_modality || null,
        governance_state: 'draft',
        protocol_json: aiResult,
      });
    } catch { /* non-blocking */ }
    window.switchPT('protocol');
  };
}

// ── Protocol Wizard — 5-step deep wizard ─────────────────────────────────────

const WIZ_STEPS = [
  'Patient & Condition',
  'Phenotype & Modality',
  'Device & Parameters',
  'Evidence draft',
  'Saved',
];

const TARGET_REGION_SUGGESTIONS = ['DLPFC', 'M1', 'Cerebellum', 'PFC', 'SMA', 'VMPFC', 'Insula', 'DMPFC', 'OFC', 'Primary somatosensory'];

function wizState() { return window._wizState || {}; }

function renderWizIndicator(step) {
  return `<div style="display:flex;gap:0;margin-bottom:28px;align-items:center;max-width:760px;margin-left:auto;margin-right:auto">
    ${WIZ_STEPS.map((s, i) => {
      const done = i < step;
      const active = i === step;
      const pipStyle = done
        ? `background:var(--teal);border-color:var(--teal);color:#fff`
        : active
          ? `background:rgba(0,212,188,0.15);border-color:var(--teal);color:var(--teal)`
          : `background:transparent;border-color:var(--border);color:var(--text-tertiary)`;
      return `<div style="display:flex;align-items:center;flex:1;min-width:0">
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0">
          <div class="step-pip" style="width:28px;height:28px;border-radius:50%;border:2px solid;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;transition:all .2s;${pipStyle}">${done ? '✓' : i + 1}</div>
          <span style="font-size:10px;font-weight:${active ? 600 : 400};color:var(--${active ? 'text-primary' : 'text-tertiary'});white-space:nowrap;max-width:80px;text-align:center;line-height:1.2">${s}</span>
        </div>
        ${i < WIZ_STEPS.length - 1 ? `<div style="flex:1;height:2px;background:${done ? 'var(--teal)' : 'var(--border)'};margin:0 6px;margin-bottom:16px;transition:background .2s"></div>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

function wizChipStyle(selected) {
  return selected
    ? `background:rgba(0,212,188,0.15);border:1px solid var(--teal);color:var(--teal);border-radius:20px;padding:5px 14px;font-size:12px;cursor:pointer;transition:all .15s`
    : `background:rgba(0,212,188,0.05);border:1px solid var(--border);color:var(--text-secondary);border-radius:20px;padding:5px 14px;font-size:12px;cursor:pointer;transition:all .15s`;
}

// ── Step renderers ────────────────────────────────────────────────────────────

function renderWizStep1() {
  const ws = wizState();
  return `<div style="max-width:760px;margin:0 auto">
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><h3>Patient</h3></div>
      <div class="card-body">
        <div class="form-group">
          <label class="form-label">Select Patient</label>
          <select id="wiz-patient" class="form-control">
            <option value="">Loading patients…</option>
          </select>
        </div>
        <div style="font-size:11px;color:var(--text-tertiary)">Or <button class="btn btn-ghost btn-sm" onclick="window._nav('patients')">add a new patient →</button></div>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><h3>Primary Condition</h3></div>
      <div class="card-body">
        <div class="form-group">
          <label class="form-label">Condition</label>
          <div id="wiz-condition-chips" style="display:flex;flex-wrap:wrap;gap:8px;padding:4px 0">
            <span style="font-size:12px;color:var(--text-tertiary)">Loading conditions…</span>
          </div>
        </div>
        <div class="form-group" style="margin-top:16px">
          <label class="form-label">Chief Complaint / Symptom Cluster</label>
          <input id="wiz-symptom" class="form-control" placeholder="e.g. anhedonia, fatigue, poor concentration, insomnia" value="${ws.symptomCluster || ''}">
        </div>
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:8px">
      <button class="btn btn-primary" onclick="window._wizNext()">Next →</button>
    </div>
  </div>`;
}

function renderWizStep2() {
  const ws = wizState();
  return `<div style="max-width:760px;margin:0 auto">
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><h3>Phenotype / Subtype</h3><span style="font-size:11px;color:var(--text-tertiary)">Optional — <button class="btn btn-ghost btn-sm" onclick="window._wizSkipPheno()">Skip</button></span></div>
      <div class="card-body">
        <div id="wiz-phenotype-cards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">
          <div style="font-size:12px;color:var(--text-tertiary)">${spinner()} Loading phenotypes…</div>
        </div>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><h3>Modality</h3><span style="font-size:11px;color:var(--text-tertiary)">Select one or more</span></div>
      <div class="card-body">
        <div id="wiz-modality-chips" style="display:flex;flex-wrap:wrap;gap:8px;padding:4px 0">
          <span style="font-size:12px;color:var(--text-tertiary)">Loading modalities…</span>
        </div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:8px">
      <button class="btn" onclick="window._wizBack()">← Back</button>
      <button class="btn btn-primary" onclick="window._wizNext()">Next →</button>
    </div>
  </div>`;
}

function renderWizStep3() {
  const ws = wizState();
  const suggestions = TARGET_REGION_SUGGESTIONS.map(r =>
    `<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 8px;margin:2px" onclick="document.getElementById('wiz-target').value='${r}'">${r}</button>`
  ).join('');
  return `<div style="max-width:760px;margin:0 auto">
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><h3>Device</h3></div>
      <div class="card-body">
        <div class="form-group">
          <label class="form-label">Device</label>
          <select id="wiz-device" class="form-control">
            <option value="">Loading devices…</option>
          </select>
        </div>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><h3>Stimulation Parameters</h3></div>
      <div class="card-body">
        <div class="form-group">
          <label class="form-label">Target Region</label>
          <input id="wiz-target" class="form-control" placeholder="e.g. DLPFC" value="${ws.targetRegion || ''}">
          <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:0">${suggestions}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group">
            <label class="form-label">Frequency (Hz)</label>
            <input id="wiz-freq" class="form-control" type="number" step="0.1" placeholder="e.g. 10" value="${ws.frequencyHz || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Intensity (% RMT)</label>
            <input id="wiz-intensity" class="form-control" type="number" step="1" placeholder="e.g. 110" value="${ws.intensityPct || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Sessions / Week</label>
            <select id="wiz-spw" class="form-control">
              ${[1,2,3,4,5,6,7].map(n => `<option value="${n}" ${(ws.sessionsPerWeek||5) == n ? 'selected' : ''}>${n}×/week</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Total Sessions</label>
            <input id="wiz-total" class="form-control" type="number" min="1" value="${ws.totalSessions || 20}">
          </div>
          <div class="form-group">
            <label class="form-label">Session Duration (min)</label>
            <input id="wiz-dur" class="form-control" type="number" min="1" value="${ws.sessionDurationMin || 30}">
          </div>
          <div class="form-group">
            <label class="form-label">Laterality</label>
            <select id="wiz-lat" class="form-control">
              <option value="left" ${ws.laterality === 'left' ? 'selected' : ''}>Left</option>
              <option value="right" ${ws.laterality === 'right' ? 'selected' : ''}>Right</option>
              <option value="bilateral" ${(ws.laterality === 'bilateral' || !ws.laterality) ? 'selected' : ''}>Bilateral</option>
            </select>
          </div>
        </div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:8px">
      <button class="btn" onclick="window._wizBack()">← Back</button>
      <button class="btn btn-primary" onclick="window._wizGenerate()">Generate Protocol →</button>
    </div>
  </div>`;
}

function renderWizStep4Loading() {
  return `<div style="max-width:760px;margin:0 auto">
    <div class="card">
      <div class="card-body" style="text-align:center;padding:48px 24px">
        ${spinner()}
        <div style="margin-top:16px;font-size:13px;color:var(--text-secondary)">Generating evidence-based protocol draft…</div>
        <div style="margin-top:6px;font-size:11px;color:var(--text-tertiary)">Deterministic registry match — this may take a few seconds.</div>
      </div>
    </div>
  </div>`;
}

function renderWizStep4Error(msg) {
  return `<div style="max-width:760px;margin:0 auto">
    <div class="card">
      <div class="card-body">
        <div style="color:var(--red);font-size:13px;font-weight:600;margin-bottom:8px">Protocol generation failed</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:16px">${msg || 'Unknown error.'}</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="window._wizGenerate()">Try Again</button>
          <button class="btn btn-sm" onclick="window._wizSkipAI()">Skip AI / Manual Entry</button>
        </div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:8px">
      <button class="btn" onclick="window._wizBack()">← Back</button>
    </div>
  </div>`;
}

function renderWizStep4Result(result) {
  const ws = wizState();
  const grade = result?.evidence_grade || result?.Evidence_Grade || '';
  const onLabel = result?.on_label_vs_off_label || result?.on_label || '';
  const warnings = result?.governance_warnings || result?.warnings || [];
  const rationale = result?.rationale || result?.notes || result?.description || result?.summary || '';

  // Save this generation as a new version (only if there's meaningful content)
  const draftText = result?.protocol || result?.draft || rationale || JSON.stringify(result);
  if (draftText && draftText !== '{}') {
    _saveProtoVersion(ws.patientId || '', ws.conditionSlug || '', draftText, ws);
  }

  const prevVersions = _getProtoVersions(ws.patientId || '', ws.conditionSlug || '');
  // prevVersions[0] is the one we just saved, so previous = length - 1
  const prevCount = prevVersions.length - 1;

  const paramsRows = [
    ['Condition', ws.conditionSlug],
    ['Modality', (ws.modalitySlugs||[]).join(', ')],
    ['Device', ws.deviceSlug],
    ['Target Region', ws.targetRegion],
    ['Frequency', ws.frequencyHz ? `${ws.frequencyHz} Hz` : '—'],
    ['Intensity', ws.intensityPct ? `${ws.intensityPct}% RMT` : '—'],
    ['Sessions/Week', ws.sessionsPerWeek],
    ['Total Sessions', ws.totalSessions],
    ['Duration', ws.sessionDurationMin ? `${ws.sessionDurationMin} min` : '—'],
    ['Laterality', ws.laterality],
  ].filter(([, v]) => v).map(([k, v]) => fr(k, v)).join('');

  const govHtml = warnings.length
    ? warnings.map(w => govFlag(w)).join('')
    : '';

  const explainabilityBanner = result?.personalization_why_selected_debug
    ? `<div class="notice notice-info" style="margin-bottom:12px;font-size:11px;line-height:1.45">A compact personalization explainability snapshot will be stored with the course when you save (matches this generated protocol).</div>`
    : `<div class="notice notice-info" style="margin-bottom:12px;font-size:11px;line-height:1.45;opacity:.92">No explainability snapshot will be attached — the server did not return personalization debug for this run (for example, no eligible protocol rows).</div>`;

  const versionBtn = prevCount > 0
    ? `<button class="btn btn-sm" style="border-color:var(--teal-400);color:var(--teal-400)" onclick="window._showProtoVersions()">&#x21BA; ${prevCount} previous version${prevCount > 1 ? 's' : ''}</button>`
    : '';

  return `<div style="max-width:760px;margin:0 auto">
    <div class="card" style="margin-bottom:14px">
      <div class="card-header">
        <h3>Generated Protocol</h3>
        <div style="display:flex;gap:6px;align-items:center">
          ${grade ? evidenceBadge(grade) : ''}
          ${onLabel ? labelBadge(onLabel) : ''}
          ${warnings.length ? safetyBadge(warnings) : ''}
        </div>
      </div>
      <div class="card-body">
        <div class="clinical-disclaimer" role="note" style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.35);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:14px;display:flex;gap:10px;align-items:flex-start">
          <span style="font-size:16px;color:var(--amber);flex-shrink:0">&#9888;</span>
          <div style="font-size:12px;line-height:1.55;color:var(--text-secondary)">
            <strong style="color:var(--text-primary)">For qualified clinicians only.</strong>
            These parameters are generated from evidence registries — verify every value against the current device label and the patient&rsquo;s contraindications before committing. Not a clinical recommendation.
          </div>
        </div>
        ${explainabilityBanner}
        ${govHtml}
        ${result?.device_resolution ? `<div class="notice notice-info" style="margin-bottom:12px;font-size:11px;line-height:1.55">
          <strong>Registry trace</strong> — device <strong>${String(result.device_resolution.resolved_device || '').replace(/</g, '&lt;')}</strong>
          · ${String(result.device_resolution.resolution_method || '').replace(/_/g, ' ')}
          ${result.device_resolution.clinical_evidence_snapshot_id ? ` · snapshot <code style="font-size:10px">${result.device_resolution.clinical_evidence_snapshot_id}</code>` : ''}
        </div>` : ''}
        <div style="background:rgba(0,212,188,0.04);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px;margin-bottom:14px">
          ${paramsRows}
        </div>
        ${rationale ? `<div id="proto-result-text" style="font-size:12.5px;color:var(--text-secondary);line-height:1.7;margin-bottom:14px;padding:12px;background:rgba(255,255,255,0.02);border-radius:var(--radius-md)">${rationale}</div>` : ''}
        <div class="form-group">
          <label class="form-label">Clinician Notes</label>
          <textarea id="wiz-clinician-notes" class="form-control" rows="3" placeholder="Add clinical rationale, patient-specific considerations, contraindication context&hellip;">${ws.clinicianNotes || ''}</textarea>
        </div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:8px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn" onclick="window._wizBack()">&#x2190; Back</button>
        ${versionBtn}
      </div>
      <div style="display:flex;gap:8px">
        ${(result?.citations?.length || result?.evidence_refs?.length) ? `<button class="btn btn-sm" style="border-color:var(--blue);color:var(--blue)" onclick="window._showProtoCitations(window._lastProtoResult)">&#128196; View Citations</button>` : `<button class="btn btn-sm" style="border-color:var(--text-tertiary);color:var(--text-tertiary);cursor:default" title="No citations were returned by the registry for this protocol — verify manually against the evidence registry." disabled>No Citations — Verify Manually</button>`}
        <button class="btn btn-sm" onclick="window._wizSave('draft')">Save as Draft Course &rarr;</button>
        <button class="btn btn-primary" onclick="window._wizSave('active')">Activate Course &rarr;</button>
      </div>
    </div>
  </div>`;
}

window._showProtoCitations = function(result) {
  if (!result) return;
  const refs = result.citations || result.evidence_refs || [];
  const rows = refs.length
    ? refs.map((c, i) => {
        const url = c.url || c.pmid && `https://pubmed.ncbi.nlm.nih.gov/${c.pmid}/` || c.nct && `https://clinicaltrials.gov/ct2/show/${c.nct}` || c.pma && `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?id=${c.pma}` || '';
        const label = c.title || c.pmid && `PMID ${c.pmid}` || c.nct || c.pma || `Reference ${i + 1}`;
        return `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary)">
          ${url ? `<a href="${url}" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:none">${label}</a>` : `<span>${label}</span>`}
        </div>`;
      }).join('')
    : `<div style="font-size:12.5px;color:var(--text-secondary);padding:12px 0">No citations were returned for this protocol — verify parameters manually against the evidence registry before committing.</div>`;
  const overlay = document.createElement('div');
  overlay.className = 'ds-modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2000;display:flex;align-items:center;justify-content:center';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `<div class="ds-modal" style="min-width:360px;max-width:540px;max-height:70vh;overflow-y:auto;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-size:14px;font-weight:700;color:var(--text-primary)">Protocol Citations</div>
      <button onclick="this.closest('.ds-modal-overlay').remove()" style="background:none;border:none;color:var(--text-tertiary);font-size:18px;cursor:pointer">&#x2715;</button>
    </div>
    ${rows}
    <div style="margin-top:14px;font-size:11px;color:var(--text-tertiary);line-height:1.5">Evidence grades are informed estimates. Always cross-check against the current device label and local protocols before prescribing.</div>
    <div style="margin-top:14px;text-align:right"><button class="btn btn-sm" onclick="this.closest('.ds-modal-overlay').remove()">Close</button></div>
  </div>`;
  document.body.appendChild(overlay);
};

function renderWizStep5() {
  const ws = wizState();
  const course = ws.savedCourse || {};
  return `<div style="max-width:760px;margin:0 auto">
    <div class="card" style="margin-bottom:16px">
      <div class="card-body" style="text-align:center;padding:36px 24px">
        <div style="font-size:32px;margin-bottom:12px">✓</div>
        <div style="font-size:18px;font-weight:700;color:var(--teal);margin-bottom:8px">Course Created</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px">Course ID: <strong>${course.id || '—'}</strong></div>
        ${course.status ? `<div style="font-size:12px;color:var(--text-tertiary)">Status: ${course.status.replace(/_/g,' ')}</div>` : ''}
        ${course.planned_sessions_total ? `<div style="font-size:12px;color:var(--text-tertiary);margin-top:4px">${course.planned_sessions_total} sessions planned · ${course.planned_sessions_per_week || ws.sessionsPerWeek}×/week</div>` : ''}
        ${course.review_required ? `<div style="font-size:12px;color:var(--amber);margin-top:8px">Review required before the course can be activated.</div>` : ''}
        <div style="display:flex;gap:10px;justify-content:center;margin-top:22px;flex-wrap:wrap">
          ${course.id ? `<button class="btn btn-primary" onclick="window._openCourse('${course.id}')">View Course →</button>` : ''}
          <button class="btn" onclick="window._nav('session-execution')">Start Session →</button>
        </div>
      </div>
    </div>
    <div style="text-align:center">
      <button class="btn btn-ghost btn-sm" onclick="window._wizReset()">Create Another Protocol →</button>
    </div>
  </div>`;
}

// ── Wizard core ───────────────────────────────────────────────────────────────

function renderWizPage() {
  const ws = wizState();
  const step = ws.step || 0;
  const el = document.getElementById('pil-wizard-body') || document.getElementById('content');
  if (!el) return;

  let body = '';
  if (step === 0) body = renderWizStep1();
  else if (step === 1) body = renderWizStep2();
  else if (step === 2) body = renderWizStep3();
  else if (step === 3) body = ws._step4Html || renderWizStep4Loading();
  else if (step === 4) body = renderWizStep5();

  el.innerHTML = `
    <div style="padding:0">
      ${renderWizIndicator(step)}
      <div id="wiz-body">${body}</div>
    </div>`;

  // After render, load async data for each step
  if (step === 0) _wizLoadStep1Data();
  if (step === 1) _wizLoadStep2Data();
  if (step === 2) _wizLoadStep3Data();
}

async function _wizLoadStep1Data() {
  const ws = wizState();
  // Load patients
  try {
    const pts = await api.listPatients();
    const items = pts?.items || pts || [];
    const sel = document.getElementById('wiz-patient');
    if (sel) {
      sel.innerHTML = `<option value="">No specific patient</option>` +
        items.map(p => `<option value="${p.id}" ${p.id === ws.patientId ? 'selected' : ''}>${p.first_name || ''} ${p.last_name || ''}</option>`).join('');
    }
  } catch {
    const sel = document.getElementById('wiz-patient');
    if (sel) sel.innerHTML = `<option value="">No specific patient</option>`;
  }

  // Load conditions
  try {
    const condData = await api.conditions();
    const items = condData?.items || condData || [];
    const container = document.getElementById('wiz-condition-chips');
    if (container) {
      const list = items.length > 0 ? items : FALLBACK_CONDITIONS.map(c => ({ name: c, slug: c.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'') }));
      container.innerHTML = list.map(c => {
        const slug = c.slug || c.id || c.Condition_ID || c.name;
        const label = c.name || c.Condition_Name || slug;
        const sel = ws.conditionSlug === slug;
        return `<button style="${wizChipStyle(sel)}" onclick="window._wizSelectCondition('${slug}','${label.replace(/'/g,"\\'")}',this)">${label}</button>`;
      }).join('');
    }
  } catch {
    const container = document.getElementById('wiz-condition-chips');
    if (container) {
      container.innerHTML = FALLBACK_CONDITIONS.map(c => {
        const slug = c.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
        const sel = ws.conditionSlug === slug;
        return `<button style="${wizChipStyle(sel)}" onclick="window._wizSelectCondition('${slug}','${c.replace(/'/g,"\\'")}',this)">${c}</button>`;
      }).join('');
    }
  }
}

async function _wizLoadStep2Data() {
  const ws = wizState();
  // Load phenotypes
  const phenoContainer = document.getElementById('wiz-phenotype-cards');
  try {
    const params = ws.conditionSlug ? { condition_id: ws.conditionSlug } : {};
    const data = await api.phenotypes(params);
    const items = data?.items || data || [];
    if (phenoContainer) {
      if (items.length === 0) {
        phenoContainer.innerHTML = `<div style="font-size:12px;color:var(--text-tertiary)">No phenotypes available for this condition. <button class="btn btn-ghost btn-sm" onclick="window._wizSkipPheno()">Skip →</button></div>`;
      } else {
        phenoContainer.innerHTML = items.map(p => {
          const pid = p.id || p.Phenotype_ID || p.name;
          const pname = p.name || p.Phenotype_Name || pid;
          const pdesc = p.description || p.Description || '';
          const sel = ws.phenotypeId === pid;
          return `<div onclick="window._wizSelectPhenotype('${pid}',this)" style="padding:12px;border:1px solid ${sel ? 'var(--teal)' : 'var(--border)'};border-radius:var(--radius-md);cursor:pointer;background:${sel ? 'rgba(0,212,188,0.07)' : 'transparent'};transition:all .15s">
            <div style="font-size:12.5px;font-weight:600;color:${sel ? 'var(--teal)' : 'var(--text-primary)'};margin-bottom:4px">${pname}</div>
            ${pdesc ? `<div style="font-size:11px;color:var(--text-tertiary);line-height:1.4">${pdesc.slice(0,100)}${pdesc.length>100?'…':''}</div>` : ''}
          </div>`;
        }).join('');
      }
    }
  } catch {
    if (phenoContainer) phenoContainer.innerHTML = `<div style="font-size:12px;color:var(--text-tertiary)">Phenotypes unavailable. <button class="btn btn-ghost btn-sm" onclick="window._wizSkipPheno()">Skip →</button></div>`;
  }

  // Load modalities
  const modContainer = document.getElementById('wiz-modality-chips');
  try {
    const data = await api.modalities();
    const items = data?.items || data || [];
    const list = items.length > 0 ? items : FALLBACK_MODALITIES.map(m => ({ name: m, slug: m }));
    if (modContainer) {
      modContainer.innerHTML = list.map(m => {
        const slug = m.slug || m.id || m.Modality_ID || m.name;
        const label = m.name || m.Modality_Name || slug;
        const sel = (ws.modalitySlugs || []).includes(slug);
        return `<button style="${wizChipStyle(sel)}" onclick="window._wizToggleModality('${slug}',this)">${label}</button>`;
      }).join('');
    }
  } catch {
    const modContainer2 = document.getElementById('wiz-modality-chips');
    if (modContainer2) {
      modContainer2.innerHTML = FALLBACK_MODALITIES.map(m => {
        const sel = (ws.modalitySlugs || []).includes(m);
        return `<button style="${wizChipStyle(sel)}" onclick="window._wizToggleModality('${m}',this)">${m}</button>`;
      }).join('');
    }
  }
}

async function _wizLoadStep3Data() {
  const ws = wizState();
  const devSel = document.getElementById('wiz-device');
  try {
    const data = await api.devices_registry();
    const items = data?.items || data || [];
    if (devSel) {
      devSel.innerHTML = `<option value="">Select device…</option>` +
        items.map(d => {
          const slug = d.slug || d.id || d.Device_ID || d.name;
          const label = d.name || d.Device_Name || slug;
          return `<option value="${slug}" ${ws.deviceSlug === slug ? 'selected' : ''}>${label}</option>`;
        }).join('');
    }
  } catch {
    if (devSel) devSel.innerHTML = `<option value="">No devices available</option>`;
  }
}

// ── Wizard actions ────────────────────────────────────────────────────────────

function _wizBindActions() {
  window._wizSelectCondition = (slug, label, btn) => {
    const ws = wizState();
    if (ws.conditionSlug === slug) {
      ws.conditionSlug = '';
      ws.conditionLabel = '';
    } else {
      ws.conditionSlug = slug;
      ws.conditionLabel = label;
    }
    // Update chip styles
    document.querySelectorAll('#wiz-condition-chips button').forEach(b => {
      b.style.cssText = wizChipStyle(false);
    });
    if (ws.conditionSlug) btn.style.cssText = wizChipStyle(true);
  };

  window._wizSelectPhenotype = (pid, card) => {
    const ws = wizState();
    if (ws.phenotypeId === pid) {
      ws.phenotypeId = '';
    } else {
      ws.phenotypeId = pid;
    }
    // Update card styles
    document.querySelectorAll('#wiz-phenotype-cards > div').forEach(c => {
      c.style.border = `1px solid var(--border)`;
      c.style.background = 'transparent';
      const title = c.querySelector('div');
      if (title) title.style.color = 'var(--text-primary)';
    });
    if (ws.phenotypeId) {
      card.style.border = `1px solid var(--teal)`;
      card.style.background = 'rgba(0,212,188,0.07)';
      const title = card.querySelector('div');
      if (title) title.style.color = 'var(--teal)';
    }
  };

  window._wizSkipPheno = () => {
    const ws = wizState();
    ws.phenotypeId = '';
    const container = document.getElementById('wiz-phenotype-cards');
    if (container) container.innerHTML = `<div style="font-size:12px;color:var(--text-tertiary)">Phenotype skipped.</div>`;
  };

  window._wizToggleModality = (slug, btn) => {
    const ws = wizState();
    if (!ws.modalitySlugs) ws.modalitySlugs = [];
    const idx = ws.modalitySlugs.indexOf(slug);
    if (idx >= 0) {
      ws.modalitySlugs.splice(idx, 1);
      btn.style.cssText = wizChipStyle(false);
    } else {
      ws.modalitySlugs.push(slug);
      btn.style.cssText = wizChipStyle(true);
    }
  };

  window._wizNext = () => {
    const ws = wizState();
    const step = ws.step || 0;
    if (step === 0) {
      // Collect step 1 data
      const patEl = document.getElementById('wiz-patient');
      const symEl = document.getElementById('wiz-symptom');
      ws.patientId = patEl?.value || '';
      ws.symptomCluster = symEl?.value?.trim() || '';
    } else if (step === 1) {
      // Data collected via callbacks; nothing extra to do
    }
    ws.step = step + 1;
    ws._step4Html = null;
    renderWizPage();
  };

  window._wizBack = () => {
    const ws = wizState();
    ws.step = Math.max(0, (ws.step || 0) - 1);
    ws._step4Html = null;
    renderWizPage();
  };

  window._wizGenerate = async () => {
    const ws = wizState();
    // Collect step 3 data
    ws.deviceSlug = document.getElementById('wiz-device')?.value || ws.deviceSlug || '';
    ws.targetRegion = document.getElementById('wiz-target')?.value?.trim() || ws.targetRegion || '';
    ws.frequencyHz = document.getElementById('wiz-freq')?.value || ws.frequencyHz || '';
    ws.intensityPct = document.getElementById('wiz-intensity')?.value || ws.intensityPct || '';
    ws.sessionsPerWeek = document.getElementById('wiz-spw')?.value || ws.sessionsPerWeek || 5;
    ws.totalSessions = document.getElementById('wiz-total')?.value || ws.totalSessions || 20;
    ws.sessionDurationMin = document.getElementById('wiz-dur')?.value || ws.sessionDurationMin || 30;
    ws.laterality = document.getElementById('wiz-lat')?.value || ws.laterality || 'bilateral';

    ws.generatedProtocolPersistedExplainability = null;
    ws.draftGenContextFingerprint = null;
    ws.generatedProtocolDebugPresent = false;

    ws.step = 3;
    ws._step4Html = renderWizStep4Loading();
    renderWizPage();

    try {
      const modalitySlug = (ws.modalitySlugs || [])[0] || '';
      let modalityName = modalitySlug;
      if (modalitySlug) {
        try {
          const modData = await api.modalities();
          const items = modData?.items || modData || [];
          const found = items.find(
            (x) => (x.slug || x.id || x.Modality_ID || x.name) === modalitySlug
          );
          if (found) modalityName = found.name || found.Modality_Name || modalityName;
        } catch {
          /* keep slug */
        }
      }
      const conditionName =
        (ws.conditionLabel || '').trim() || String(ws.conditionSlug || '').replace(/-/g, ' ');

      const payload = {
        condition: conditionName,
        symptom_cluster: ws.symptomCluster || 'General',
        modality: modalityName,
        device: ws.deviceSlug || '',
        setting: 'Clinic',
        evidence_threshold: 'Guideline',
        off_label: false,
        include_personalization_debug: true,
        include_structured_rule_matches_detail: false,
      };
      Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

      const result = await api.generateProtocol(payload);
      ws.generatedProtocol = result;
      const dbg = result.personalization_why_selected_debug;
      ws.generatedProtocolPersistedExplainability = dbg
        ? toPersistedPersonalizationExplainability(dbg)
        : null;
      ws.generatedProtocolDebugPresent = !!dbg;
      ws.draftGenContextFingerprint = computeWizardDraftFingerprint(ws);
      window._lastProtoResult = result;
      ws._step4Html = renderWizStep4Result(result);
    } catch (e) {
      ws._step4Html = renderWizStep4Error(e?.message || 'Generation failed.');
    }
    const body = document.getElementById('wiz-body');
    if (body) body.innerHTML = ws._step4Html;
  };

  window._wizSkipAI = () => {
    const ws = wizState();
    ws.generatedProtocol = null;
    ws.generatedProtocolPersistedExplainability = null;
    ws.draftGenContextFingerprint = null;
    ws.generatedProtocolDebugPresent = false;
    ws._step4Html = renderWizStep4Result({});
    const body = document.getElementById('wiz-body');
    if (body) body.innerHTML = ws._step4Html;
  };

  window._wizSave = async (mode) => {
    const ws = wizState();
    // Collect clinician notes from textarea
    const notesEl = document.getElementById('wiz-clinician-notes');
    ws.clinicianNotes = notesEl?.value?.trim() || '';

    const result = ws.generatedProtocol || {};
    const saveBtn1 = document.querySelector('[onclick="_wizSave(\'draft\')"]');
    const saveBtn2 = document.querySelector('[onclick="_wizSave(\'active\')"]');

    // Disable buttons during save
    document.querySelectorAll('#wiz-body button').forEach(b => b.disabled = true);

    try {
      const courseData = {
        condition_slug: ws.conditionSlug || undefined,
        modality_slug: (ws.modalitySlugs || [])[0] || undefined,
        device_slug: ws.deviceSlug || undefined,
        target_region: ws.targetRegion || undefined,
        planned_frequency_hz: ws.frequencyHz ? parseFloat(ws.frequencyHz) : undefined,
        planned_intensity_pct_rmt: ws.intensityPct ? parseFloat(ws.intensityPct) : undefined,
        planned_sessions_per_week: ws.sessionsPerWeek ? parseInt(ws.sessionsPerWeek) : undefined,
        planned_sessions_total: ws.totalSessions ? parseInt(ws.totalSessions) : undefined,
        planned_session_duration_min: ws.sessionDurationMin ? parseInt(ws.sessionDurationMin) : undefined,
        laterality: ws.laterality || undefined,
        patient_id: ws.patientId || undefined,
        phenotype_id: ws.phenotypeId || undefined,
        evidence_grade: result?.evidence_grade || undefined,
        on_label: result?.on_label_vs_off_label ? result.on_label_vs_off_label.toLowerCase().startsWith('on') : undefined,
        clinician_notes: ws.clinicianNotes || undefined,
      };
      const fp = computeWizardDraftFingerprint(ws);
      const attach = shouldAttachPersonalizationExplainability(ws, result, fp);
      let protocolId =
        result?.personalization_why_selected_debug?.selected_protocol_id ||
        result?.id ||
        ws._fromProtocolId;
      if (attach) {
        protocolId = attach.selected_protocol_id;
        courseData.personalization_explainability = attach;
      }
      if (protocolId) courseData.protocol_id = protocolId;
      Object.keys(courseData).forEach((k) => courseData[k] === undefined && delete courseData[k]);

      const course = await api.createCourse(courseData);

      if (mode === 'active' && course?.id) {
        try { await api.activateCourse(course.id); } catch {}
        // Refresh course status
        try { const refreshed = await api.getCourse(course.id); if (refreshed) ws.savedCourse = refreshed; else ws.savedCourse = course; } catch { ws.savedCourse = course; }
      } else {
        ws.savedCourse = course;
      }
      ws.step = 4;
      ws._step4Html = null;
      renderWizPage();
    } catch (e) {
      document.querySelectorAll('#wiz-body button').forEach(b => b.disabled = false);
      const body = document.getElementById('wiz-body');
      const errDiv = document.createElement('div');
      errDiv.className = 'notice notice-warn';
      errDiv.style.marginTop = '10px';
      errDiv.textContent = e?.message || 'Failed to save course.';
      if (body) body.appendChild(errDiv);
    }
  };

  window._wizReset = () => {
    window._wizState = {
      step: 0, patientId: '', conditionSlug: '', conditionLabel: '',
      symptomCluster: '', phenotypeId: '', modalitySlugs: [],
      deviceSlug: '', targetRegion: '', frequencyHz: '', intensityPct: '',
      sessionsPerWeek: 5, totalSessions: 20, sessionDurationMin: 30,
      laterality: 'bilateral', generatedProtocol: null, clinicianNotes: '',
      savedCourse: null, _step4Html: null,
      generatedProtocolPersistedExplainability: null,
      draftGenContextFingerprint: null,
      generatedProtocolDebugPresent: false,
    };
    renderWizPage();
  };
}

export async function pgProtocols(setTopbar) {
  setTopbar('Protocol Intelligence', `
    <button class="btn btn-sm" onclick="window._nav('protocol-builder')" style="border-color:var(--teal,#00d4bc);color:var(--teal,#00d4bc)">⚡ Builder</button>
    <button class="btn btn-sm" onclick="window._nav('handbooks')">Handbooks</button>
    <button class="btn btn-sm" onclick="window._nav('decision-support')">Decision Support</button>
  `);

  const el = document.getElementById('content');
  // Start in wizard tab if explicitly navigated to wizard or a protocol was pre-selected
  const initMode = (window._pilMode === 'wizard' || !!window._wizardProtocolId) ? 'wizard' : 'library';
  window._pilMode = initMode;

  el.innerHTML = `
    <div class="pil-hub">
      <div class="pil-tab-bar">
        <button id="pil-tab-lib" class="pil-tab${initMode === 'library' ? ' pil-tab--active' : ''}"
          onclick="window._pilTab('library')">
          <span class="pil-tab-icon">&#9776;</span> Protocol Library
        </button>
        <button id="pil-tab-wiz" class="pil-tab${initMode === 'wizard' ? ' pil-tab--active' : ''}"
          onclick="window._pilTab('wizard')">
          <span class="pil-tab-icon">&#10011;</span> Create Course
        </button>
      </div>
      <div id="pil-body"></div>
    </div>`;

  window._pilTab = async function(m) {
    window._pilMode = m;
    document.getElementById('pil-tab-lib')?.classList.toggle('pil-tab--active', m === 'library');
    document.getElementById('pil-tab-wiz')?.classList.toggle('pil-tab--active', m === 'wizard');
    if (m === 'library') await _pilRenderLibrary();
    else _pilRenderWizard();
  };

  if (initMode === 'library') await _pilRenderLibrary();
  else _pilRenderWizard();
}

// ── Protocol Intelligence: 10-20 stimulation brain map ───────────────────────

function _stimMapSVG(targetRegion, laterality, modality) {
  const W = 148, H = 148, cx = 74, cy = 74, hr = 60;

  // 10-20 electrode positions (top-down view, nasion at top)
  const SITES = {
    'Fp1':[60,22],'Fp2':[88,22],
    'F7':[22,54],'F3':[50,46],'Fz':[74,42],'F4':[98,46],'F8':[126,54],
    'T3':[16,74],'C3':[40,74],'Cz':[74,74],'C4':[108,74],'T4':[132,74],
    'T5':[22,94],'P3':[50,102],'Pz':[74,108],'P4':[98,102],'T6':[126,94],
    'O1':[58,128],'Oz':[74,134],'O2':[90,128],
    'AF3':[57,33],'AF4':[91,33],'FC3':[47,60],'FCz':[74,57],'FC4':[101,60],
    'CP3':[47,88],'CPz':[74,90],'CP4':[101,88],
    // 10-10 extension sites
    'F1':[62,44],'F2':[86,44],'F5':[36,50],'F6':[112,50],
    'FC1':[61,59],'FC2':[88,59],'FC5':[20,65],'FC6':[128,65],
    'FT7':[20,65],'FT8':[128,65],
    'C1':[57,74],'C2':[91,74],'C5':[28,74],'C6':[120,74],
    'TP7':[19,84],'TP8':[129,84],'TP9':[14,90],'TP10':[134,90],
    'CP1':[61,89],'CP2':[88,89],'CP5':[36,98],'CP6':[112,98],
    'P1':[62,105],'P2':[86,105],'P9':[18,108],'P10':[130,108],
    'PO3':[54,115],'PO4':[94,115],'PO7':[40,111],'PO8':[108,111],'POz':[74,122],
    'AF7':[41,38],'AF8':[107,38],
  };

  // Target region → 10-20 site mappings
  const REGION_MAP = {
    'dlpfc':              { left:['F3'],        right:['F4'],        bilateral:['F3','F4'] },
    'left dlpfc':         { left:['F3'],        right:['F3'],        bilateral:['F3'] },
    'right dlpfc':        { left:['F4'],        right:['F4'],        bilateral:['F4'] },
    'm1':                 { left:['C3'],        right:['C4'],        bilateral:['C3','C4'] },
    'motor':              { left:['C3'],        right:['C4'],        bilateral:['C3','C4'] },
    'motorcortex':        { left:['C3'],        right:['C4'],        bilateral:['C3','C4'] },
    'sma':                { left:['FCz','Fz'], right:['FCz','Fz'], bilateral:['FCz','Fz','Cz'] },
    'vmpfc':              { left:['Fz'],        right:['Fz'],        bilateral:['Fz'] },
    'pfc':                { left:['F3','Fz'],  right:['F4','Fz'],  bilateral:['Fz'] },
    'prefrontal':         { left:['F3','Fz'],  right:['F4','Fz'],  bilateral:['Fz'] },
    'cerebellum':         { left:['Oz'],        right:['Oz'],        bilateral:['Oz'] },
    'parietal':           { left:['P3','Pz'],  right:['P4','Pz'],  bilateral:['Pz'] },
    'occipital':          { left:['O1','Oz'],  right:['O2','Oz'],  bilateral:['Oz'] },
    'temporal':           { left:['T3'],        right:['T4'],        bilateral:['T3','T4'] },
    'insula':             { left:['T3','C3'],  right:['T4','C4'],  bilateral:['T3','T4'] },
    'primarysomatosensory':{ left:['C3'],       right:['C4'],        bilateral:['C3','C4'] },
    'cz':                 { left:['Cz'],        right:['Cz'],        bilateral:['Cz'] },
    'pz':                 { left:['Pz'],        right:['Pz'],        bilateral:['Pz'] },
    'fz':                 { left:['Fz'],        right:['Fz'],        bilateral:['Fz'] },
  };

  // Modality color
  const modL = (modality || '').toLowerCase();
  const col = modL.includes('tms') || modL.includes('magnetic') || modL.includes('theta') ? '#818cf8'
    : modL.includes('tdcs') || modL.includes('tacs') || modL.includes('trns') ? '#00d4bc'
    : modL.includes('nfb') || modL.includes('neurofeedback') || modL.includes('eeg') || modL.includes('heg') ? '#fbbf24'
    : '#4a9eff';

  // Resolve active sites
  const rk = (targetRegion || '').toLowerCase().replace(/[\s\-_]/g, '');
  const lat = (laterality || 'bilateral').toLowerCase();
  const match = Object.entries(REGION_MAP).find(([k]) => rk.includes(k))?.[1]
    || Object.entries(REGION_MAP).find(([k]) => k.includes(rk.slice(0, 4)))?.[1];
  const active = match ? (match[lat] || match.bilateral || []) : [];

  const parts = [
    `<circle cx="${cx}" cy="${cy}" r="${hr}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1.5"/>`,
    // Nose
    `<path d="M${cx-5},${cy-hr+3} Q${cx},${cy-hr-6} ${cx+5},${cy-hr+3}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.5"/>`,
    // Left ear
    `<path d="M${cx-hr},${cy-5} Q${cx-hr-6},${cy} ${cx-hr},${cy+5}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>`,
    // Right ear
    `<path d="M${cx+hr},${cy-5} Q${cx+hr+6},${cy} ${cx+hr},${cy+5}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>`,
    // Reference lines (very subtle)
    `<line x1="${cx}" y1="${cy-hr}" x2="${cx}" y2="${cy+hr}" stroke="rgba(255,255,255,0.04)" stroke-width="0.5"/>`,
    `<line x1="${cx-hr}" y1="${cy}" x2="${cx+hr}" y2="${cy}" stroke="rgba(255,255,255,0.04)" stroke-width="0.5"/>`,
  ];

  // All site dots (dimmed)
  Object.entries(SITES).forEach(([n, [x, y]]) => {
    if (active.includes(n)) return;
    parts.push(`<circle cx="${x}" cy="${y}" r="2.5" fill="rgba(148,163,184,0.12)" stroke="rgba(148,163,184,0.18)" stroke-width="0.5"/>`);
  });

  // Active site dots (highlighted with glow)
  active.forEach(n => {
    const pos = SITES[n];
    if (!pos) return;
    const [x, y] = pos;
    parts.push(`<circle cx="${x}" cy="${y}" r="10" fill="${col}" opacity="0.1"/>`);
    parts.push(`<circle cx="${x}" cy="${y}" r="6" fill="${col}" opacity="0.88"/>`);
  });

  const siteLabel = active.length ? active.join(' · ') : '';
  const regionLabel = targetRegion ? targetRegion : '';

  return `<div class="pil-map-wrap">
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block">${parts.join('')}</svg>
    <div class="pil-map-label">
      ${regionLabel ? `<span class="pil-map-region">${regionLabel}</span>` : ''}
      ${siteLabel ? `<span class="pil-map-sites" style="color:${col}">${siteLabel}</span>` : ''}
    </div>
  </div>`;
}


// ── Protocol Intelligence: classification helper ─────────────────────────────

function _pilGetClassification(p) {
  if (p.classification === 'ai-personalized' || p.ai_generated === true) return 'ai';
  if (p.brain_scan_required === true || p.classification === 'brain-scan') return 'brain-scan';
  if (p.on_label === true || p.classification === 'on-label') return 'on-label';
  if (p.on_label === false || p.classification === 'off-label') return 'off-label';
  // Fallback: use legacy on_label_vs_off_label field
  const lv = String(p.on_label_vs_off_label || '').toLowerCase();
  if (lv.startsWith('on')) return 'on-label';
  if (lv.startsWith('off')) return 'off-label';
  return null;
}

function _pilClassBadge(cls) {
  if (!cls) return '';
  const map = {
    'on-label':   { label: 'On-Label',       color: 'var(--green,#4ade80)',   bg: 'rgba(74,222,128,0.12)'  },
    'off-label':  { label: 'Off-Label',       color: 'var(--amber,#ffb547)',   bg: 'rgba(255,181,71,0.12)'  },
    'ai':         { label: 'AI-Personalized', color: 'var(--violet,#9b7fff)',  bg: 'rgba(155,127,255,0.12)' },
    'brain-scan': { label: 'Brain Scan',      color: 'var(--blue,#4a9eff)',    bg: 'rgba(74,158,255,0.12)'  },
  };
  const m = map[cls];
  if (!m) return '';
  return `<span class="pil-class-badge" style="color:${m.color};background:${m.bg};border-color:${m.color}25">${m.label}</span>`;
}

// ── Protocol Intelligence: Library tab ───────────────────────────────────────

function _pilProtoCard(p, condMap) {
  const isOn  = String(p.on_label_vs_off_label || '').toLowerCase().startsWith('on');
  const pid   = (p.id || '').replace(/['"<>&]/g, '');
  const cname = condMap[p.condition_id] || p.condition_id || '—';
  const mod   = p.modality_id || '';
  const region = p.target_region || '';
  const lat   = p.laterality || '';

  const paramRows = [
    ['Condition',    cname !== '—' ? cname : null],
    ['Modality',     mod || null],
    ['Target',       region || null],
    ['Laterality',   lat || null],
    ['Frequency',    p.frequency_hz ? p.frequency_hz + ' Hz' : null],
    ['Intensity',    p.intensity || null],
    ['Duration',     p.session_duration || null],
    ['Sessions/wk',  p.sessions_per_week ? p.sessions_per_week + '×/wk' : null],
    ['Total course', p.total_course || null],
    ['Placement',    p.coil_or_electrode_placement || null],
    ['Device',       p.device_id_if_specific || null],
  ].filter(([, v]) => v);

  const hasMap = !!(region || lat);

  return `<div class="pil-proto-card" id="pil-pc-${pid}">
    <div class="pil-proto-header" onclick="window._pilToggle('${pid}')">
      <div class="pil-proto-badges">
        ${evidenceBadge(p.evidence_grade)}
        ${_pilClassBadge(_pilGetClassification(p))}
        ${(p.governance_flags || []).length ? `<span class="pil-gov-pill">⚠ ${p.governance_flags.length}</span>` : ''}
      </div>
      <div class="pil-proto-meta">
        <div class="pil-proto-name">${p.name || '—'}</div>
        <div class="pil-proto-sub">
          ${cname !== '—' ? `<span>${cname}</span>` : ''}
          ${mod   ? `<span class="pil-tag-mod">${mod}</span>` : ''}
          ${region ? `<span class="pil-tag-region">${region}</span>` : ''}
          ${p.frequency_hz ? `<span class="pil-tag-param">${p.frequency_hz} Hz</span>` : ''}
          ${p.intensity    ? `<span class="pil-tag-param">${p.intensity}</span>` : ''}
        </div>
      </div>
      <span id="pil-chev-${pid}" class="pil-chevron">▼</span>
    </div>
    <div id="pil-detail-${pid}" class="pil-detail-panel" style="display:none">
      <div class="pil-detail-body">
        <div class="pil-detail-params">
          ${paramRows.map(([k, v]) => `
            <div class="pil-param-row">
              <span class="pil-param-key">${k}</span>
              <span class="pil-param-val">${v}</span>
            </div>`).join('')}
        </div>
        ${hasMap ? _stimMapSVG(region, lat, mod) : ''}
      </div>
      ${p.monitoring_requirements
        ? `<div class="pil-monitoring-note">Monitoring: ${p.monitoring_requirements}</div>` : ''}
      ${(p.governance_flags || []).map(f =>
        `<div class="pil-gov-flag">⚠ ${f}</div>`).join('')}
      ${p.clinician_review_required === 'Yes'
        ? `<div class="pil-review-req">Clinician review required before first use</div>` : ''}
      <div class="pil-detail-cta">
        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();window._pilUseProtocol('${pid}')">Use This Protocol →</button>
        <button class="btn btn-sm" onclick="event.stopPropagation();window._pilToggle('${pid}')">Close</button>
      </div>
    </div>
  </div>`;
}

function _pilBindCards() {
  window._pilToggle = function(pid) {
    document.querySelectorAll('[id^="pil-detail-"]').forEach(el => {
      if (el.id !== 'pil-detail-' + pid && el.style.display !== 'none') {
        el.style.display = 'none';
        const ch = document.getElementById('pil-chev-' + el.id.replace('pil-detail-', ''));
        if (ch) ch.textContent = '▼';
      }
    });
    const panel = document.getElementById('pil-detail-' + pid);
    const chev  = document.getElementById('pil-chev-' + pid);
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : '';
    if (chev) chev.textContent = isOpen ? '▼' : '▲';
  };

  window._pilUseProtocol = function(pid) {
    const p = (window._pilAllProtos || []).find(pr => (pr.id || '').replace(/['"<>&]/g, '') === pid);
    if (p) window._pilSelectedProtocol = p;
    window._pilMode = 'wizard';
    document.getElementById('pil-tab-lib')?.classList.remove('pil-tab--active');
    document.getElementById('pil-tab-wiz')?.classList.add('pil-tab--active');
    _pilRenderWizard();
    // Scroll to top of wizard
    const body = document.getElementById('pil-body');
    if (body) body.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

async function _pilRenderLibrary() {
  const body = document.getElementById('pil-body');
  if (!body) return;
  body.innerHTML = `<div class="pil-loading">${spinner()} Loading protocol library…</div>`;

  try {
    const [protoData, condData, modData] = await Promise.all([
      api.protocols(),
      api.conditions().catch(() => null),
      api.modalities().catch(() => null),
    ]);
    const items = protoData?.items || [];
    const conds = condData?.items  || [];
    const mods  = modData?.items   || [];

    const condMap = {};
    conds.forEach(c => { condMap[c.id || c.Condition_ID] = c.name || c.Condition_Name || c.id; });

    window._pilAllProtos = items;
    window._pilCondMap   = condMap;

    const condOptions = conds.map(c =>
      `<option value="${c.id || c.Condition_ID}">${c.name || c.Condition_Name || c.id}</option>`
    ).join('');
    const modOptions = mods.map(m =>
      `<option value="${m.id || m.name || m.Modality_Name}">${m.name || m.Modality_Name || m.id}</option>`
    ).join('');

    // Compute classification counts
    const _clsCounts = { 'on-label': 0, 'off-label': 0, 'ai': 0, 'brain-scan': 0 };
    items.forEach(p => { const c = _pilGetClassification(p); if (c) _clsCounts[c]++; });
    window._pilClassFilter = window._pilClassFilter || 'all';

    body.innerHTML = `
      <div class="pil-library">
        <div class="pil-class-tabs" role="tablist">
          <button class="pil-class-tab${window._pilClassFilter==='all'?' pil-class-tab--active':''}" onclick="window._pilSetFilter('all')" data-cls="all">All <span class="pil-class-count">${items.length}</span></button>
          <button class="pil-class-tab${window._pilClassFilter==='on-label'?' pil-class-tab--active':''}" onclick="window._pilSetFilter('on-label')" data-cls="on-label">On-Label <span class="pil-class-count">${_clsCounts['on-label']}</span></button>
          <button class="pil-class-tab${window._pilClassFilter==='off-label'?' pil-class-tab--active':''}" onclick="window._pilSetFilter('off-label')" data-cls="off-label">Off-Label <span class="pil-class-count">${_clsCounts['off-label']}</span></button>
          <button class="pil-class-tab${window._pilClassFilter==='ai'?' pil-class-tab--active':''}" onclick="window._pilSetFilter('ai')" data-cls="ai">AI-Personalized <span class="pil-class-count">${_clsCounts['ai']}</span></button>
          <button class="pil-class-tab${window._pilClassFilter==='brain-scan'?' pil-class-tab--active':''}" onclick="window._pilSetFilter('brain-scan')" data-cls="brain-scan">Brain Scan <span class="pil-class-count">${_clsCounts['brain-scan']}</span></button>
        </div>
        <div class="pil-filter-bar">
          <input id="pil-search" class="form-control" placeholder="Search by name, condition, modality…"
            oninput="window._pilFilter()" style="flex:1;min-width:160px;font-size:12.5px">
          <select id="pil-cond" class="form-control" onchange="window._pilFilter()" style="font-size:12.5px">
            <option value="">All Conditions</option>${condOptions}
          </select>
          <select id="pil-mod" class="form-control" onchange="window._pilFilter()" style="font-size:12.5px">
            <option value="">All Modalities</option>${modOptions}
          </select>
          <select id="pil-grade" class="form-control" onchange="window._pilFilter()" style="font-size:12.5px">
            <option value="">Any Evidence</option>
            <option value="EV-A">EV-A — Strongest</option>
            <option value="EV-B">EV-B — Moderate</option>
            <option value="EV-C">EV-C — Emerging</option>
            <option value="EV-D">EV-D — Experimental</option>
          </select>
          <label class="pil-onlabel-row">
            <input type="checkbox" id="pil-onlabel" onchange="window._pilFilter()"> On-label only
          </label>
        </div>
        <div id="pil-count" class="pil-count">${items.length} protocols</div>
        <div id="pil-cards">
          ${items.length
            ? items.map(p => _pilProtoCard(p, condMap)).join('')
            : emptyState('◇', 'No protocols available', 'Check your connection or contact support to load the protocol library.')}
        </div>
      </div>`;

    window._pilFilter = function() {
      const q    = (document.getElementById('pil-search')?.value || '').toLowerCase();
      const cond = document.getElementById('pil-cond')?.value  || '';
      const mod  = document.getElementById('pil-mod')?.value   || '';
      const grade= document.getElementById('pil-grade')?.value || '';
      const onl  = document.getElementById('pil-onlabel')?.checked || false;
      const cls  = window._pilClassFilter || 'all';
      const all  = window._pilAllProtos || [];
      const cm   = window._pilCondMap  || {};

      const vis = all.filter(p => {
        const cn  = cm[p.condition_id] || p.condition_id || '';
        const txt = `${p.name||''} ${cn} ${p.modality_id||''} ${p.target_region||''}`.toLowerCase();
        const isOn = String(p.on_label_vs_off_label || '').toLowerCase().startsWith('on');
        const pCls = _pilGetClassification(p);
        return (!q    || txt.includes(q))
          && (!grade || p.evidence_grade === grade)
          && (!onl   || isOn)
          && (!cond  || (p.condition_id||'').includes(cond) || cn.toLowerCase().includes(cond.toLowerCase()))
          && (!mod   || (p.modality_id||'').toLowerCase().includes(mod.toLowerCase()))
          && (cls === 'all' || pCls === cls);
      });

      const countEl = document.getElementById('pil-count');
      const cardsEl = document.getElementById('pil-cards');
      if (countEl) countEl.textContent = `${vis.length} of ${all.length} protocols`;
      if (cardsEl) cardsEl.innerHTML = vis.length
        ? vis.map(p => _pilProtoCard(p, window._pilCondMap || {})).join('')
        : emptyState('◇', 'No protocols match your filters.', 'Try removing a filter.');
      _pilBindCards();
    };

    window._pilSetFilter = function(cls) {
      window._pilClassFilter = cls;
      document.querySelectorAll('.pil-class-tab').forEach(btn => {
        btn.classList.toggle('pil-class-tab--active', btn.dataset.cls === cls);
      });
      window._pilFilter();
    };

    _pilBindCards();

  } catch (e) {
    body.innerHTML = `<div style="padding:32px">${emptyState('◇', 'Protocol library unavailable.', 'Check backend connection.')}</div>`;
  }
}

function _pilRenderWizard() {
  const body = document.getElementById('pil-body');
  if (!body) return;

  // Show pre-fill banner if arriving from a protocol card
  const sel = window._pilSelectedProtocol;
  const bannerHtml = sel ? `
    <div class="pil-prefill-banner">
      <span>Pre-filled from: <strong>${sel.name || sel.id}</strong></span>
      <button class="btn btn-ghost btn-sm" onclick="window._pilSelectedProtocol=null;window._wizState._fresh=true;_pilRenderWizard()">Clear ×</button>
    </div>` : '';

  body.innerHTML = `${bannerHtml}<div id="pil-wizard-body" style="padding:16px 0"></div>`;

  // Pre-fill wizard state from selected protocol
  if (sel) {
    const spw = sel.sessions_per_week ? parseInt(String(sel.sessions_per_week)) : 5;
    const dur = sel.session_duration  ? parseInt(String(sel.session_duration))  : 30;
    window._wizState = {
      step: 0,
      patientId:         window._wizardPatientId || '',
      conditionSlug:     sel.condition_id || '',
      conditionLabel:    window._pilCondMap?.[sel.condition_id] || sel.condition_id || '',
      symptomCluster:    '',
      phenotypeId:       sel.phenotype_id || '',
      modalitySlugs:     sel.modality_id ? [sel.modality_id] : [],
      deviceSlug:        sel.device_id_if_specific || '',
      targetRegion:      sel.target_region || '',
      frequencyHz:       sel.frequency_hz || '',
      intensityPct:      '',
      sessionsPerWeek:   isNaN(spw) ? 5 : spw,
      totalSessions:     20,
      sessionDurationMin:isNaN(dur) ? 30 : dur,
      laterality:        sel.laterality || 'bilateral',
      generatedProtocol: null,
      clinicianNotes:    '',
      savedCourse:       null,
      _step4Html:        null,
      _fresh:            false,
      _fromProtocolId:   sel.id,
      generatedProtocolPersistedExplainability: null,
      draftGenContextFingerprint: null,
      generatedProtocolDebugPresent: false,
    };
  } else if (!window._wizState || window._wizState._fresh) {
    window._wizState = {
      step: 0, patientId: window._wizardPatientId || '', conditionSlug: '',
      conditionLabel: '', symptomCluster: '', phenotypeId: '',
      modalitySlugs: [], deviceSlug: '', targetRegion: '', frequencyHz: '',
      intensityPct: '', sessionsPerWeek: 5, totalSessions: 20,
      sessionDurationMin: 30, laterality: 'bilateral',
      generatedProtocol: null, clinicianNotes: '', savedCourse: null,
      _step4Html: null, _fresh: false,
      generatedProtocolPersistedExplainability: null,
      draftGenContextFingerprint: null,
      generatedProtocolDebugPresent: false,
    };
  }

  _wizBindActions();
  renderWizPage();
}

// ── (Legacy renderProStep removed — replaced by new wizard) ──────────────────
function renderProStep_UNUSED() {
  if (proStep === 0) {
    const prefilledName = window._wizardPatientName ? `<div class="notice notice-info" style="margin-bottom:12px">Patient: <strong>${window._wizardPatientName}</strong></div>` : '';
    return `<div class="g2">
    ${cardWrap('Select Patient', `
      ${prefilledName}
      <div class="form-group">
        <label class="form-label">Patient</label>
        <select id="proto-patient" class="form-control">
          <option value="${window._wizardPatientId || ''}">${window._wizardPatientName || 'Loading patients…'}</option>
        </select>
      </div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">Or <button class="btn btn-ghost btn-sm" onclick="window._nav('patients')">add a new patient →</button></div>
      <div id="wizard-pheno-note"></div>
    `)}
    ${cardWrap('Clinical Context', `
      <div class="form-group">
        <label class="form-label">Primary Diagnosis</label>
        <select id="proto-condition" class="form-control">
          <option value="">Loading conditions...</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Phenotype / Subtype</label>
        <select id="proto-phenotype" class="form-control">
          <option value="">Select condition first…</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Key Symptoms</label><input id="proto-key-symptoms" class="form-control" placeholder="e.g. anhedonia, fatigue, poor concentration"></div>
    `)}
  </div>
  <div style="text-align:right;margin-top:4px"><button class="btn btn-primary" onclick="window.nextStep()">Next: Modality & Type →</button></div>`;
  }

  if (proStep === 1) return `
    ${cardWrap('Select Modality', `
      <div id="modality-chips" style="display:flex;flex-wrap:wrap;padding:4px 0">
        ${[
          { l: 'tDCS', s: 'Transcranial DC' }, { l: 'TPS', s: 'Transcranial Pulse' },
          { l: 'TMS / rTMS', s: 'Magnetic' }, { l: 'taVNS', s: 'Transcutaneous VNS' },
          { l: 'CES', s: 'Cranial Electrotherapy' }, { l: 'Neurofeedback', s: 'qEEG-guided NFB' },
          { l: 'PBM', s: 'Photobiomodulation' }, { l: 'Multimodal', s: 'Combined' },
        ].map(m => `<div class="mod-chip ${selMods.includes(m.l) ? 'selected' : ''}" onclick="window.toggleMod('${m.l}')">${m.l} <span style="font-weight:400;font-size:10.5px;opacity:.6">· ${m.s}</span></div>`).join('')}
      </div>
      <div id="registry-modalities-loading" style="font-size:11px;color:var(--text-tertiary);margin-top:8px">Loading modalities from registry…</div>
    `)}
    ${cardWrap('Matching Registry Protocols', `
      <div id="registry-protocols-list" style="font-size:12px;color:var(--text-secondary)">Select a modality above to see matching protocols.</div>
    `)}
    ${cardWrap('Protocol Type', `<div class="g3">
      ${[
        { t: 'evidence', l: 'Evidence-Based', s: 'Standard Clinical', d: 'Published RCT-derived protocols.', c: 'var(--blue)' },
        { t: 'offlabel', l: 'Off-Label', s: 'Extended Indication', d: 'Outside primary indication with case support.', c: 'var(--amber)' },
        { t: 'personalized', l: 'Patient-context draft', s: 'When data is available', d: 'Uses charted patient context with the same registry-backed draft engine (not a separate AI model).', c: 'var(--teal)' },
      ].map(pt => `<div class="proto-type-card ${proType === pt.t ? 'selected' : ''}" onclick="window.selectProType('${pt.t}')">
        <div style="font-size:9.5px;letter-spacing:.8px;text-transform:uppercase;font-weight:600;margin-bottom:6px;color:${pt.c}">${pt.l}</div>
        <div class="proto-type-name">${pt.s}</div>
        <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5;margin-top:5px">${pt.d}</div>
      </div>`).join('')}
    </div>`)}
    <div style="display:flex;justify-content:space-between;margin-top:4px">
      <button class="btn" onclick="window.prevStep()">← Back</button>
      <button class="btn btn-primary" onclick="window.nextStep()">Next: Configure →</button>
    </div>`;

  if (proStep === 2) {
    // Use registry-preloaded parameters if available, otherwise fall back to defaults
    const rp = window._registryProtocol || {};
    const targetRegion = rp.Target_Region || '';
    const freqHz = rp.Frequency_Hz || '';
    const intensity = rp.Intensity || '2.0';
    const sessionDuration = rp.Session_Duration || '20';
    const sessPerWeek = rp.Sessions_per_Week || '';
    const totalCourse = rp.Total_Course || '10';
    const coilPlacement = rp.Coil_or_Electrode_Placement || '';
    const protocolBadge = rp.Protocol_Name
      ? `<div class="notice notice-info" style="margin-bottom:16px">
           Pre-filled from registry: <strong>${rp.Protocol_Name}</strong>
           ${rp.Evidence_Grade ? `<span style="margin-left:8px;font-size:11px;color:var(--teal)">${rp.Evidence_Grade}</span>` : ''}
         </div>`
      : '';
    const contraHtml = (rp.Contraindications || rp.contraindications || []).length
      ? `<div style="background:rgba(239,68,68,0.06);border-left:4px solid var(--red);padding:10px 14px;margin-bottom:14px;font-size:12.5px;color:var(--text-secondary);border-radius:var(--radius-md)">
           <strong style="color:var(--text-primary)">Contraindications for this registry protocol:</strong>
           <ul style="margin:6px 0 0 16px;padding:0;font-size:12px;color:var(--red)">
             ${(rp.Contraindications || rp.contraindications).map(c => `<li>${String(c).replace(/</g,'&lt;')}</li>`).join('')}
           </ul>
         </div>`
      : '';
    return `<div>
    <div class="clinical-disclaimer" role="note" style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.35);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:14px;display:flex;gap:10px;align-items:flex-start">
      <span style="font-size:16px;color:var(--amber);flex-shrink:0">&#9888;</span>
      <div style="font-size:12px;line-height:1.55;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">For qualified clinicians only.</strong>
        These parameters are pre-filled from the evidence registry. Verify every value against the current device label and the patient&rsquo;s contraindications before proceeding. Not a clinical recommendation.
      </div>
    </div>
    ${contraHtml}
    ${protocolBadge}
    <div class="g2">
    ${cardWrap('Stimulation Parameters', `
      <div class="form-group"><label class="form-label">Target Region</label>
        <input id="param-target-region" class="form-control" value="${targetRegion}" placeholder="e.g. DLPFC (F3/F4)">
      </div>
      <div class="form-group"><label class="form-label">Frequency (Hz)</label>
        <input id="param-frequency" class="form-control" type="text" value="${freqHz}" placeholder="e.g. 10">
      </div>
      <div class="form-group"><label class="form-label">Intensity (mA)</label>
        <input id="param-intensity" class="form-control" type="text" value="${intensity}" placeholder="e.g. 2.0">
      </div>
      <div class="form-group"><label class="form-label">Duration per Session (min)</label>
        <input id="param-duration" class="form-control" type="number" value="${sessionDuration}">
      </div>
      <div class="form-group"><label class="form-label">Sessions per Week</label>
        <input id="param-sessions-per-week" class="form-control" type="text" value="${sessPerWeek}" placeholder="e.g. 5">
      </div>
      <div class="form-group"><label class="form-label">Total Course Sessions</label>
        <input id="param-total-course" class="form-control" type="text" value="${totalCourse}" placeholder="e.g. 20–30">
      </div>
    `)}
    <div>
      ${cardWrap('Coil / Electrode Placement', `
        <div class="form-group"><label class="form-label">Placement</label>
          <input id="param-coil-placement" class="form-control" value="${coilPlacement}" placeholder="e.g. F3 (Left DLPFC)">
        </div>
        <div class="form-group"><label class="form-label">Ramp Up/Down (s)</label><input id="param-ramp" class="form-control" type="number" value="30"></div>
        <div class="form-group"><label class="form-label">Electrode Size</label><select id="param-electrode-size" class="form-control"><option>25 cm² (5×5)</option><option>35 cm² standard</option><option>Custom</option></select></div>
      `)}
      ${cardWrap('Scheduling & Notes', `
        <div class="form-group"><label class="form-label">Planned Start Date</label>
          <input id="param-start-date" class="form-control" type="date" value="${new Date().toISOString().slice(0,10)}">
        </div>
        <div class="form-group"><label class="form-label">Concurrent interventions</label><input id="param-concurrent" class="form-control" placeholder="e.g. CBT, physiotherapy"></div>
        <div class="form-group"><label class="form-label">Clinician Notes</label>
          <textarea id="param-clinician-notes" class="form-control" rows="3" placeholder="Clinical rationale, patient-specific considerations, contraindication context…"></textarea>
        </div>
        <div class="form-group"><label class="form-label">Evidence threshold</label>
          <select class="form-control"><option value="A">EV-A (Strong RCT)</option><option value="B">EV-B (Moderate)</option><option value="C">EV-C (Emerging)</option></select>
        </div>
      `)}
    </div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:4px">
      <button class="btn" onclick="window.prevStep()">← Back</button>
      <button class="btn btn-primary" onclick="window.nextStep()">Review & Generate →</button>
    </div></div>`;
  }

  if (proStep === 3) {
    const rp = window._registryProtocol || {};
    const protocolId = rp.Protocol_ID || rp.id || '';
    const hasProto = !!protocolId;
    return `<div id="proto-review">
    ${hasProto
      ? `<div class="notice notice-info" style="margin-bottom:16px">
           <strong>Registry Protocol:</strong> ${rp.Protocol_Name || rp.name || protocolId}
           ${rp.Evidence_Grade ? `· <span style="color:var(--teal)">${rp.Evidence_Grade}</span>` : ''}
           ${rp.On_Label_vs_Off_Label?.toLowerCase().startsWith('on') ? '' : ' · <span style="color:var(--amber)">Off-label</span>'}
         </div>`
      : `<div class="notice notice-warn" style="margin-bottom:16px">No registry protocol selected. Go back to Step 2 and click a protocol card.</div>`
    }
    <div style="display:flex;gap:8px;justify-content:space-between">
      <button class="btn" onclick="window.prevStep()">← Back</button>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm" onclick="window.generateProtoAPI()">Generate DOCX only</button>
        <button class="btn btn-primary" onclick="window._confirmCreateCourse()" id="gen-btn" ${hasProto ? '' : 'disabled'}>Create Treatment Course ◎</button>
      </div>
    </div>
    <div id="proto-result" style="margin-top:20px"></div>
  </div>`;
  }

  return '';
}

// ── Create Treatment Course — confirmation modal ──────────────────────────────
window._confirmCreateCourse = function() {
  const rp = window._registryProtocol || {};
  const result = window._lastProtoResult || {};
  const refs = result.citations || result.evidence_refs || [];
  const citationRows = refs.length
    ? refs.map((c, i) => {
        const url = c.url || (c.pmid && `https://pubmed.ncbi.nlm.nih.gov/${c.pmid}/`) || (c.nct && `https://clinicaltrials.gov/ct2/show/${c.nct}`) || (c.pma && `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?id=${c.pma}`) || '';
        const label = c.title || (c.pmid && `PMID ${c.pmid}`) || c.nct || c.pma || `Reference ${i + 1}`;
        return `<li style="margin-bottom:4px">${url ? `<a href="${url}" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:none;font-size:11.5px">${label}</a>` : `<span style="font-size:11.5px;color:var(--text-secondary)">${label}</span>`}</li>`;
      }).join('')
    : `<li style="font-size:11.5px;color:var(--text-tertiary)">No citations available — verify manually against the registry.</li>`;
  const paramRows = [
    ['Protocol', rp.Protocol_Name || rp.name || '—'],
    ['Frequency', rp.Frequency_Hz ? `${rp.Frequency_Hz} Hz` : '—'],
    ['Intensity', rp.Intensity ? `${rp.Intensity} mA / % RMT` : '—'],
    ['Pulse Width', rp.Pulse_Width_us || rp.pulse_width || '—'],
    ['Sessions / Week', rp.Sessions_per_Week || '—'],
    ['Total Sessions', rp.Total_Course || rp.Total_Sessions || '—'],
    ['Duration / Session', rp.Session_Duration ? `${rp.Session_Duration} min` : '—'],
    ['Target Region', rp.Target_Region || '—'],
  ].map(([k, v]) => `<tr><td style="padding:4px 8px 4px 0;font-size:11.5px;color:var(--text-tertiary);white-space:nowrap">${k}</td><td style="padding:4px 0;font-size:12px;color:var(--text-primary);font-family:var(--font-mono)">${String(v).replace(/</g,'&lt;')}</td></tr>`).join('');
  const overlay = document.createElement('div');
  overlay.className = 'ds-modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2000;display:flex;align-items:center;justify-content:center';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `<div class="ds-modal" style="min-width:380px;max-width:560px;max-height:80vh;overflow-y:auto;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:22px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-size:15px;font-weight:700;color:var(--text-primary)">Confirm Treatment Course</div>
      <button onclick="this.closest('.ds-modal-overlay').remove()" style="background:none;border:none;color:var(--text-tertiary);font-size:18px;cursor:pointer">&#x2715;</button>
    </div>
    <div style="background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.3);border-radius:var(--radius-md);padding:9px 12px;margin-bottom:14px;font-size:11.5px;color:var(--text-secondary);line-height:1.5">
      &#9888; Review each parameter against the device label and patient contraindications before confirming.
    </div>
    <div style="font-size:12px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px">Generated Stim Parameters</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:14px"><tbody>${paramRows}</tbody></table>
    <div style="font-size:12px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.7px;margin-bottom:6px">Evidence Citations</div>
    <ul style="margin:0 0 16px 16px;padding:0">${citationRows}</ul>
    <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:var(--radius-md);cursor:pointer;margin-bottom:16px">
      <input type="checkbox" id="_ctc-ack" style="margin-top:2px;flex-shrink:0" onchange="document.getElementById('_ctc-confirm-btn').disabled=!this.checked">
      <span style="font-size:12px;color:var(--text-secondary);line-height:1.5">I have reviewed these parameters and the contraindications for this patient.</span>
    </label>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost btn-sm" onclick="this.closest('.ds-modal-overlay').remove()">Cancel</button>
      <button class="btn btn-primary btn-sm" id="_ctc-confirm-btn" disabled onclick="this.closest('.ds-modal-overlay').remove();window.createTreatmentCourse()">Confirm &amp; Create Course</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
};

// ── Registry integration for Protocol Wizard ──────────────────────────────────
async function loadProtocolWizardRegistry() {
  // 1. Populate conditions dropdown
  try {
    const condData = await api.conditions();
    const condEl = document.getElementById('proto-condition');
    if (condEl && condData) {
      const items = condData.items || condData || [];
      if (items.length > 0) {
        condEl.innerHTML = `<option value="">Select condition…</option>` +
          items.map(c => `<option value="${c.id || c.Condition_ID || c.name}">${c.name || c.Condition_Name || c.id}</option>`).join('');
      } else {
        // Fallback static list if API returns empty
        condEl.innerHTML = `<option value="">Select condition…</option>` +
          FALLBACK_CONDITIONS.map(c => `<option>${c}</option>`).join('');
      }
    }

    // When condition changes, load phenotypes
    if (condEl) {
      condEl.addEventListener('change', async () => {
        const condId = condEl.value;
        const phenoEl = document.getElementById('proto-phenotype');
        if (!condId || !phenoEl) return;
        phenoEl.innerHTML = `<option value="">Loading phenotypes…</option>`;
        try {
          const phenoData = await api.phenotypes({ condition_id: condId });
          const phenoItems = phenoData?.items || phenoData || [];
          phenoEl.innerHTML = phenoItems.length > 0
            ? `<option value="">Select phenotype…</option>` +
              phenoItems.map(p => `<option value="${p.id || p.Phenotype_ID || p.name}">${p.name || p.Phenotype_Name || p.id}</option>`).join('')
            : `<option value="">No phenotypes found</option>`;
        } catch {
          phenoEl.innerHTML = `<option value="">Phenotypes unavailable</option>`;
        }
      });
    }
  } catch {
    const condEl = document.getElementById('proto-condition');
    if (condEl) {
      condEl.innerHTML = `<option value="">Select condition…</option>` +
        FALLBACK_CONDITIONS.map(c => `<option>${c}</option>`).join('');
    }
  }

  // 2. Load modalities from registry (supplement hardcoded chips)
  try {
    const modData = await api.modalities();
    const loadingEl = document.getElementById('registry-modalities-loading');
    if (loadingEl) {
      const modItems = modData?.items || modData || [];
      loadingEl.textContent = modItems.length > 0
        ? `${modItems.length} modalities loaded from registry.`
        : 'Registry modalities unavailable — using defaults.';
      setTimeout(() => { if (loadingEl) loadingEl.style.display = 'none'; }, 2000);
    }
  } catch {
    const loadingEl = document.getElementById('registry-modalities-loading');
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

// Load matching protocols for condition+modality selection (Step 1)
async function loadMatchingProtocols(conditionId, modalityLabel) {
  const listEl = document.getElementById('registry-protocols-list');
  if (!listEl) return;
  if (!conditionId && !modalityLabel) {
    listEl.innerHTML = `<span style="color:var(--text-tertiary)">Select a condition and modality to see matching protocols.</span>`;
    return;
  }
  listEl.innerHTML = `<span style="color:var(--text-tertiary)">Loading…</span>`;
  try {
    const params = {};
    if (conditionId) params.condition_id = conditionId;
    if (modalityLabel) params.modality = modalityLabel;
    const data = await api.protocols(params);
    const items = data?.items || [];
    if (items.length === 0) {
      listEl.innerHTML = `<span style="color:var(--text-tertiary)">No registry protocols found for this combination.</span>`;
      return;
    }
    listEl.innerHTML = items.map(p => `
      <div style="padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:8px;cursor:pointer;transition:border-color var(--transition)"
           onmouseover="this.style.borderColor='var(--border-teal)'" onmouseout="this.style.borderColor='var(--border)'"
           onclick="window.selectRegistryProtocol(${JSON.stringify(p).replace(/"/g,'&quot;')})">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:12px;font-weight:600;color:var(--text-primary);flex:1">${p.Protocol_Name || p.name || ''}</span>
          ${p.Evidence_Grade ? `<span style="font-size:10px;font-weight:600;padding:1px 6px;border-radius:3px;background:rgba(0,212,188,0.1);color:var(--teal)">${p.Evidence_Grade}</span>` : ''}
          ${p.On_Label_vs_Off_Label?.includes('On-label') ? `<span style="font-size:10px;color:var(--teal)">On-label</span>` : `<span style="font-size:10px;color:var(--amber)">Off-label</span>`}
        </div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;display:flex;gap:12px;flex-wrap:wrap">
          ${p.Target_Region ? `<span>Target: ${p.Target_Region}</span>` : ''}
          ${p.Sessions_per_Week ? `<span>${p.Sessions_per_Week}×/wk</span>` : ''}
          ${p.Total_Course ? `<span>${p.Total_Course} total</span>` : ''}
        </div>
      </div>
    `).join('');
  } catch {
    listEl.innerHTML = `<span style="color:var(--text-tertiary)">Registry protocols unavailable.</span>`;
  }
}

// bindProtoPage is a no-op — the new wizard manages its own DOM via pgProtocols
export function bindProtoPage() {}

// ── Assessments Hub (instruments: registries/assess-instruments-registry.js) ───

function _hubResolveRegistryScale(scaleId) {
  const mapped = resolveScaleCanonical(scaleId);
  return ASSESS_REGISTRY.find(r => r.id === mapped || r.id === scaleId) || null;
}

function _hubEscHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function _hubInterpretScore(scaleId, score, extraScalesMap) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return '';
  const n = Number(score);
  const reg = _hubResolveRegistryScale(scaleId);
  if (reg?.interpret && typeof reg.interpret === 'function') {
    const o = reg.interpret(n);
    return o?.label || '';
  }
  const canon = resolveScaleCanonical(scaleId);
  const ex = extraScalesMap[scaleId] || extraScalesMap[canon];
  if (ex?.interpretation) {
    for (const r of ex.interpretation) {
      if (n <= r.max) return r.label;
    }
  }
  return '';
}

/** Writes hub completion rows to ds_assessment_runs for dashboard + patient profile Assessments tab */
function _syncAssessHubResultsToPlatform(assignment, results) {
  if (!assignment?.patientId || !results?.length) return;
  let runs = [];
  try {
    runs = JSON.parse(localStorage.getItem('ds_assessment_runs') || '[]');
  } catch {
    runs = [];
  }
  const ts = new Date().toISOString();
  const phase = assignment.phase || '';
  results.forEach(r => {
    const tpl = _hubResolveRegistryScale(r.scale);
    const sm = getScaleMeta(r.scale);
    runs.push({
      patient_id: assignment.patientId,
      scale_id: r.scale,
      scale_name: (!sm.unknown && sm.display_name) ? sm.display_name : (tpl?.abbr || tpl?.t || r.scale),
      score: r.score,
      interpretation: r.interp || '',
      completed_at: ts,
      status: 'completed',
      timing_window: phase,
      source: 'assessments-hub',
      assignment_id: assignment.id,
      condition_name: assignment.condName || '',
    });
  });
  try {
    localStorage.setItem('ds_assessment_runs', JSON.stringify(runs));
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent('ds-assessment-runs-updated', { detail: { patientId: assignment.patientId } }));
  } catch {}

  // Persist each completed result to the backend so AI agents, reports, and
  // protocol personalization read from the same source of truth. Fire-and-
  // forget per scale; localStorage keeps the UI working offline.
  if (typeof api !== 'undefined' && api && typeof api.createAssessment === 'function') {
    results.forEach(r => {
      const tpl = _hubResolveRegistryScale(r.scale);
      const templateId = (tpl?.scoringKey || tpl?.id || r.scale || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
      const templateTitle = tpl?.t || tpl?.abbr || r.scale;
      try {
        api.createAssessment({
          template_id: templateId || String(r.scale).toLowerCase(),
          template_title: templateTitle,
          patient_id: assignment.patientId,
          data: { score: r.score, interpretation: r.interp, items: r.items || null, source: 'assessments-hub' },
          status: 'completed',
          score: String(r.score),
          phase: phase || null,
          respondent_type: tpl?.inline ? 'patient' : 'clinician',
          bundle_id: assignment.condId || null,
          scale_version: tpl?.scoringKey ? (tpl.scoringKey + '@1') : null,
        }).catch(err => {
          console.warn('[assessments-hub] backend persist failed for', r.scale, err?.message || err);
        });
      } catch (err) {
        console.warn('[assessments-hub] backend persist threw for', r.scale, err);
      }
    });
  }
}

// Condition → phase → scale bundle map  (20 conditions × 5 phases)
const CONDITION_BUNDLES = {
  'CON-001': { name: 'Major Depressive Disorder',     cat: 'Mood',
    baseline:['PHQ-9','HAM-D17','MADRS','GAD-7','ISI','DASS-21','SF-12'], pre_session:['PHQ-9'],
    post_session:['PHQ-9','NRS-SE'], weekly:['PHQ-9','GAD-7','ISI'], discharge:['PHQ-9','HAM-D17','GAD-7','ISI','DASS-21','SF-12'] },
  'CON-002': { name: 'Bipolar Disorder',               cat: 'Mood',
    baseline:['PHQ-9','MADRS','YMRS','GAD-7','ISI','SF-12'], pre_session:['PHQ-9','YMRS'],
    post_session:['NRS-SE'], weekly:['PHQ-9','YMRS','ISI'], discharge:['PHQ-9','MADRS','YMRS','GAD-7','SF-12'] },
  'CON-003': { name: 'Generalised Anxiety Disorder',   cat: 'Anxiety',
    baseline:['GAD-7','PHQ-9','DASS-21','ISI','SF-12'], pre_session:['GAD-7'],
    post_session:['GAD-7','NRS-SE'], weekly:['GAD-7','PHQ-9','ISI'], discharge:['GAD-7','PHQ-9','DASS-21','SF-12'] },
  'CON-004': { name: 'Panic Disorder',                 cat: 'Anxiety',
    baseline:['PDSS','GAD-7','PHQ-9','ISI'], pre_session:['PDSS'],
    post_session:['NRS-SE'], weekly:['PDSS','GAD-7'], discharge:['PDSS','GAD-7','PHQ-9'] },
  'CON-005': { name: 'Social Anxiety Disorder',        cat: 'Anxiety',
    baseline:['LSAS','GAD-7','PHQ-9','DASS-21'], pre_session:['LSAS'],
    post_session:['NRS-SE'], weekly:['LSAS','GAD-7'], discharge:['LSAS','GAD-7','PHQ-9'] },
  'CON-006': { name: 'OCD',                            cat: 'Anxiety',
    baseline:['Y-BOCS','OCI-R','GAD-7','PHQ-9'], pre_session:['Y-BOCS'],
    post_session:['NRS-SE'], weekly:['Y-BOCS','OCI-R'], discharge:['Y-BOCS','OCI-R','GAD-7','PHQ-9'] },
  'CON-007': { name: 'PTSD',                           cat: 'Trauma',
    baseline:['PCL-5','PHQ-9','GAD-7','ISI'], pre_session:['PCL-5'],
    post_session:['NRS-SE'], weekly:['PCL-5','PHQ-9','ISI'], discharge:['PCL-5','PHQ-9','GAD-7','ISI'] },
  'CON-008': { name: 'ADHD',                           cat: 'Neurodevelopmental',
    baseline:['ADHD-RS-5','PHQ-9','GAD-7'], pre_session:['ADHD-RS-5'],
    post_session:['NRS-SE'], weekly:['ADHD-RS-5'], discharge:['ADHD-RS-5','PHQ-9'] },
  'CON-009': { name: 'Chronic Insomnia',               cat: 'Sleep',
    baseline:['ISI','PSQI','ESS','PHQ-9'], pre_session:['ISI'],
    post_session:['NRS-SE'], weekly:['ISI','ESS'], discharge:['ISI','PSQI','PHQ-9'] },
  'CON-010': { name: 'Chronic Pain',                   cat: 'Pain',
    baseline:['NRS-Pain','PHQ-9','GAD-7','SF-12'], pre_session:['NRS-Pain'],
    post_session:['NRS-Pain','NRS-SE'], weekly:['NRS-Pain','PHQ-9'], discharge:['NRS-Pain','PHQ-9','SF-12'] },
  'CON-011': { name: 'Fibromyalgia',                   cat: 'Pain',
    baseline:['NRS-Pain','PHQ-9','GAD-7','FSS','SF-12'], pre_session:['NRS-Pain'],
    post_session:['NRS-Pain','NRS-SE'], weekly:['NRS-Pain','FSS','PHQ-9'], discharge:['NRS-Pain','PHQ-9','FSS','SF-12'] },
  'CON-012': { name: "Parkinson's Disease",            cat: 'Neurology',
    baseline:['UPDRS-III','PHQ-9','SF-12'], pre_session:['UPDRS-III'],
    post_session:['UPDRS-III','NRS-SE'], weekly:['UPDRS-III','PHQ-9'], discharge:['UPDRS-III','PHQ-9','SF-12'] },
  'CON-013': { name: 'Post-Stroke Rehabilitation',     cat: 'Neurology',
    baseline:['PHQ-9','FSS','SF-12'], pre_session:['NRS-SE'],
    post_session:['NRS-SE'], weekly:['PHQ-9','FSS'], discharge:['PHQ-9','FSS','SF-12'] },
  'CON-014': { name: 'Traumatic Brain Injury',         cat: 'Neurology',
    baseline:['PHQ-9','GAD-7','FSS','SF-12'], pre_session:['PHQ-9'],
    post_session:['NRS-SE'], weekly:['PHQ-9','FSS'], discharge:['PHQ-9','GAD-7','FSS','SF-12'] },
  'CON-015': { name: 'Multiple Sclerosis',             cat: 'Neurology',
    baseline:['PHQ-9','FSS','SF-12'], pre_session:['NRS-SE'],
    post_session:['NRS-SE'], weekly:['PHQ-9','FSS'], discharge:['PHQ-9','FSS','SF-12'] },
  'CON-016': { name: 'Tinnitus',                       cat: 'Sensory',
    baseline:['THI','PHQ-9','GAD-7','ISI'], pre_session:['THI'],
    post_session:['NRS-SE'], weekly:['THI','ISI'], discharge:['THI','PHQ-9','ISI'] },
  'CON-017': { name: 'CRPS',                           cat: 'Pain',
    baseline:['NRS-Pain','PHQ-9','GAD-7'], pre_session:['NRS-Pain'],
    post_session:['NRS-Pain','NRS-SE'], weekly:['NRS-Pain','PHQ-9'], discharge:['NRS-Pain','PHQ-9'] },
  'CON-018': { name: 'Neuropathic Pain',               cat: 'Pain',
    baseline:['NRS-Pain','PHQ-9','GAD-7','SF-12'], pre_session:['NRS-Pain'],
    post_session:['NRS-Pain','NRS-SE'], weekly:['NRS-Pain','PHQ-9'], discharge:['NRS-Pain','PHQ-9','SF-12'] },
  'CON-019': { name: 'Eating Disorders',               cat: 'Eating',
    baseline:['PHQ-9','GAD-7','ISI','SF-12'], pre_session:['PHQ-9'],
    post_session:['NRS-SE'], weekly:['PHQ-9','GAD-7'], discharge:['PHQ-9','GAD-7','SF-12'] },
  'CON-020': { name: 'Substance Use Disorder',         cat: 'Substance',
    baseline:['AUDIT','PHQ-9','GAD-7','SF-12'], pre_session:['AUDIT'],
    post_session:['NRS-SE'], weekly:['PHQ-9','GAD-7'], discharge:['AUDIT','PHQ-9','GAD-7','SF-12'] },
};

export async function pgAssess(setTopbar) {
  setTopbar('Assessments Hub', `<button class="btn btn-primary btn-sm" onclick="window._ahTab('run')">+ Run Assessment</button>`);
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let items = [];
  try { const res = await api.listAssessments(); items = res?.items || []; } catch {}

  const registry = ASSESS_REGISTRY;
  const condIds = Object.keys(CONDITION_BUNDLES);
  const phases = ['baseline','pre_session','post_session','weekly','discharge'];
  const phaseNames = { baseline:'Baseline', pre_session:'Pre-Session', post_session:'Post-Session', weekly:'Weekly', discharge:'Discharge' };
  const measureMap = { baseline:'baseline', pre_session:'pre', post_session:'post', weekly:'mid', discharge:'follow_up' };
  const categories = [...new Set(condIds.map(id => CONDITION_BUNDLES[id].cat))].sort();

  function scaleChip(id, clickable) {
    const s = registry.find(r => r.id === id);
    if (!s) return `<span class="ah-chip">${id}</span>`;
    const attrs = clickable ? `onclick="window._ahQuickRunScale('${id}')" title="${s.sub}"` : `title="${s.sub}"`;
    const impl = getAssessmentImplementationStatus(id, ASSESS_REGISTRY);
    const inlineMark = impl.status === 'implemented_item_checklist' ? ' ◉' : '';
    return `<span class="ah-chip${clickable?' ah-chip-btn':''}" ${attrs}>${s.abbr||s.id}${inlineMark}</span>`;
  }

  function bundlePhaseRows(condId) {
    const b = CONDITION_BUNDLES[condId];
    return phases.map(ph => `
      <div class="ah-phase-row">
        <span class="ah-phase-label">${phaseNames[ph]}</span>
        <div class="ah-chip-row">${(b[ph]||[]).map(id => scaleChip(id,false)).join('')}</div>
        <button class="btn btn-sm ah-run-bundle-btn" onclick="window._ahSelectBundle('${condId}','${ph}')">Run →</button>
      </div>`).join('');
  }

  function condCard(condId) {
    const b = CONDITION_BUNDLES[condId];
    const total = [...new Set(phases.flatMap(ph => b[ph]||[]))].length;
    return `<div class="ah-cond-card" id="ah-cond-${condId}">
      <div class="ah-cond-hd" onclick="window._ahToggleCond('${condId}')">
        <span class="ah-cond-name">${b.name}</span>
        <span class="ah-cond-meta">${total} scales · 5 phases</span>
        <span class="ah-cond-cat">${b.cat}</span>
        <span class="ah-cond-chevron">▾</span>
      </div>
      <div class="ah-cond-body" style="display:none" id="ah-condbody-${condId}">
        ${bundlePhaseRows(condId)}
      </div>
    </div>`;
  }

  function recentRows() {
    if (!items.length) return `<div class="ah-empty">No assessments yet.</div>`;
    return `<table class="ds-table"><thead><tr><th>Scale</th><th>Patient</th><th>Score</th><th>Interpretation</th><th>Date</th></tr></thead>
      <tbody>${items.slice(0,8).map(a => {
        const tpl = registry.find(r => r.id === a.template_id);
        const sn = parseFloat(a.score);
        const interp = (tpl?.interpret && !isNaN(sn)) ? tpl.interpret(sn) : null;
        return `<tr>
          <td style="font-weight:500">${a.template_title||a.template_id}</td>
          <td style="color:var(--text-tertiary)">${a.patient_id||'—'}</td>
          <td class="mono" style="color:${interp?.color||'var(--teal)'}">${a.score||'—'}</td>
          <td style="font-size:11px;color:${interp?.color||'var(--text-secondary)'}">${interp?.label||'—'}</td>
          <td style="color:var(--text-tertiary)">${a.created_at?.split('T')[0]||'—'}</td>
        </tr>`;
      }).join('')}</tbody></table>`;
  }

  el.innerHTML = `
  <div id="ah-root">
    <div class="ah-tabbar">
      <button class="ah-tab active" id="ah-tab-overview"  onclick="window._ahTab('overview')">Overview</button>
      <button class="ah-tab"        id="ah-tab-bundles"   onclick="window._ahTab('bundles')">Bundles</button>
      <button class="ah-tab"        id="ah-tab-run"       onclick="window._ahTab('run')">Run Assessment</button>
      <button class="ah-tab"        id="ah-tab-results"   onclick="window._ahTab('results')">Results <span class="ah-count">${items.length}</span></button>
    </div>
    <div id="ah-overview" class="ah-view">
      <div class="g2" style="margin-bottom:20px">
        <div class="card"><div class="card-body">
          <div class="ah-section-title">Quick-Assign Bundle</div>
          <div class="form-group" style="margin-bottom:10px"><label class="form-label">Patient ID</label>
            <input id="ah-ov-patient" class="form-control" placeholder="Enter patient ID…"></div>
          <div class="form-group" style="margin-bottom:10px"><label class="form-label">Condition</label>
            <select id="ah-ov-cond" class="form-control" onchange="window._ahOvPreview()">
              <option value="">— Select condition —</option>
              ${condIds.map(id=>`<option value="${id}">${CONDITION_BUNDLES[id].name}</option>`).join('')}
            </select></div>
          <div class="form-group" style="margin-bottom:12px"><label class="form-label">Phase</label>
            <select id="ah-ov-phase" class="form-control" onchange="window._ahOvPreview()">
              ${phases.map(ph=>`<option value="${ph}">${phaseNames[ph]}</option>`).join('')}
            </select></div>
          <div id="ah-ov-preview" class="ah-ov-preview"></div>
          <button class="btn btn-primary" style="margin-top:10px" onclick="window._ahOvRun()">Run This Bundle →</button>
        </div></div>
        <div class="card"><div class="card-body">
          <div class="ah-section-title">Scale Library <span style="font-size:10px;color:var(--text-tertiary);font-weight:400">(${registry.length} scales)</span></div>
          <div style="display:flex;flex-direction:column;gap:4px;max-height:270px;overflow-y:auto;margin-top:8px">
            ${registry.map(s => {
              const impl = getAssessmentImplementationStatus(s.id, ASSESS_REGISTRY);
              const implBadge = formatLegacyRunImplementationBadgeHtml(impl.status);
              return `
              <div class="ah-lib-row" onclick="window._ahQuickRunScale('${s.id}')">
                <span class="ah-lib-abbr">${s.abbr||s.id}</span>
                <span class="ah-lib-name">${s.t}</span>
                ${implBadge ? `<span style="margin-left:6px">${implBadge}</span>` : ''}
                <span class="ah-lib-cat">${s.cat}</span>
              </div>`;
            }).join('')}
          </div>
        </div></div>
      </div>
      <div class="card"><div class="card-body">
        <div class="ah-section-title">Recent Assessments</div>${recentRows()}
      </div></div>
    </div>
    <div id="ah-bundles" class="ah-view" style="display:none">
      <div class="ah-cat-bar">
        <button class="ah-cat-btn active" id="ah-cat-all" onclick="window._ahFilterCat('all')">All</button>
        ${categories.map(c=>`<button class="ah-cat-btn" id="ah-cat-${c.replace(/[\s']/g,'-')}" onclick="window._ahFilterCat('${c}')">${c}</button>`).join('')}
      </div>
      <div id="ah-cond-list" style="margin-top:16px">${condIds.map(id => condCard(id)).join('')}</div>
    </div>
    <div id="ah-run" class="ah-view" style="display:none">
      <div class="card" style="margin-bottom:16px"><div class="card-body">
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
          <div class="form-group" style="margin:0;flex:1;min-width:180px"><label class="form-label">Patient ID</label>
            <input id="ah-run-patient" class="form-control" placeholder="Patient ID (optional)"></div>
          <div class="form-group" style="margin:0;flex:1;min-width:160px"><label class="form-label">Condition</label>
            <select id="ah-run-cond" class="form-control" onchange="window._ahRunFilter()">
              <option value="">All scales</option>
              ${condIds.map(id=>`<option value="${id}">${CONDITION_BUNDLES[id].name}</option>`).join('')}
            </select></div>
          <div class="form-group" style="margin:0;flex:1;min-width:160px"><label class="form-label">Phase</label>
            <select id="ah-run-phase" class="form-control" onchange="window._ahRunFilter()">
              ${phases.map(ph=>`<option value="${ph}">${phaseNames[ph]}</option>`).join('')}
            </select></div>
        </div>
      </div></div>
      <div id="ah-run-scale-list" class="g3">
        ${registry.map(s => {
          const impl = getAssessmentImplementationStatus(s.id, ASSESS_REGISTRY);
          const implBadge = formatLegacyRunImplementationBadgeHtml(impl.status);
          const runPrimary =
            impl.status === 'implemented_item_checklist'
              ? `<button class="btn btn-primary btn-sm" onclick="window._ahRunScale('${s.id}')">Run Inline ◉</button>`
              : impl.status === 'declared_item_checklist_but_missing_form'
                ? `<button class="btn btn-sm" style="border-color:var(--amber, #f59e0b);color:var(--amber, #f59e0b)" onclick="window._ahRunScale('${s.id}')" title="In-app checklist not wired yet">Enter total (checklist pending)</button>`
                : '';
          return `
          <div class="card ah-scale-card" style="margin-bottom:0" id="ahsc-${s.id.replace(/[^a-z0-9]/gi,'_')}">
            <div class="card-body">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:3px">
                <div style="font-family:var(--font-display);font-size:13px;font-weight:600;flex:1;min-width:220px">${s.t}</div>
                ${implBadge || ''}
              </div>
              <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px">${s.sub} · max ${s.max}</div>
              <div style="margin-bottom:10px">${s.tags.slice(0,3).map(t=>tag(t)).join('')}</div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${runPrimary}
                <button class="btn btn-sm" onclick="window._ahScoreEntry('${s.id}')">Enter Score</button>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div id="ah-inline-panel" style="display:none;max-width:680px;margin-top:16px">
        <div class="card"><div class="card-body">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
            <button class="btn btn-sm" onclick="window._ahCloseInline()">← Back</button>
            <div id="ah-inline-title" style="font-family:var(--font-display);font-size:15px;font-weight:600;flex:1"></div>
            <div id="ah-inline-badge" style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:var(--teal)">0</div>
          </div>
          <div id="ah-inline-interp" style="font-size:12px;font-weight:600;padding:6px 10px;border-radius:var(--radius-sm);margin-bottom:18px;display:inline-block"></div>
          <div id="ah-inline-questions"></div>
          <div class="form-group" style="margin-top:14px"><label class="form-label">Clinician Notes</label>
            <textarea id="ah-inline-notes" class="form-control" rows="2" placeholder="Optional notes…"></textarea></div>
          <div id="ah-inline-err" role="alert" aria-live="polite" style="color:var(--red);font-size:12px;display:none;margin-bottom:8px"></div>
          <button class="btn btn-primary" onclick="window._ahSaveInline()">Save Assessment →</button>
        </div></div>
      </div>
      <div id="ah-score-panel" style="display:none;max-width:440px;margin-top:16px">
        <div class="card"><div class="card-body">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <button class="btn btn-sm" onclick="window._ahCloseScore()">← Back</button>
            <div id="ah-score-title" style="font-family:var(--font-display);font-size:14px;font-weight:600;flex:1"></div>
          </div>
          <div id="ah-score-notice"></div>
          <div class="form-group"><label class="form-label">Score</label>
            <input id="ah-score-val" class="form-control" type="number" placeholder="e.g. 14" oninput="window._ahScorePreview()"></div>
          <div id="ah-score-interp" style="font-size:12px;font-weight:600;padding:6px 10px;border-radius:var(--radius-sm);margin-bottom:10px;display:none"></div>
          <div class="form-group"><label class="form-label">Clinician Notes</label>
            <textarea id="ah-score-notes" class="form-control" rows="2" placeholder="Notes…"></textarea></div>
          <div id="ah-score-err" role="alert" aria-live="polite" style="color:var(--red);font-size:12px;display:none;margin-bottom:8px"></div>
          <button class="btn btn-primary" onclick="window._ahSaveScore()">Save →</button>
        </div></div>
      </div>
    </div>
    <div id="ah-results" class="ah-view" style="display:none">
      ${items.length === 0 ? emptyState('◧', 'No assessments recorded yet', 'Go to a patient profile to run their first assessment.') : `<div class="card"><div class="card-body">
          <div class="ah-section-title">All Assessment Records</div>
          <table class="ds-table">
            <thead><tr><th>Scale</th><th>Patient</th><th>Score</th><th>Interpretation</th><th>Phase</th><th>Date</th><th>Notes</th></tr></thead>
            <tbody>${items.map(a => {
              const tpl = registry.find(r => r.id === a.template_id);
              const sn = parseFloat(a.score);
              const interp = (tpl?.interpret && !isNaN(sn)) ? tpl.interpret(sn) : null;
              return `<tr>
                <td style="font-weight:500">${a.template_title||a.template_id}</td>
                <td style="color:var(--text-tertiary)">${a.patient_id||'—'}</td>
                <td class="mono" style="color:${interp?.color||'var(--teal)'}">${a.score||'—'}</td>
                <td style="font-size:11px;color:${interp?.color||'var(--text-secondary)'}">${interp?.label||'—'}</td>
                <td style="font-size:11px;color:var(--text-tertiary)">${a.measurement_point||'—'}</td>
                <td style="color:var(--text-tertiary)">${a.created_at?.split('T')[0]||'—'}</td>
                <td style="font-size:11.5px;color:var(--text-secondary);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.clinician_notes||'—'}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div></div>`}
    </div>
  </div>`;

  let _ahInlineTpl = null, _ahInlineAnswers = [], _ahScoreTpl = null;

  window._ahTab = function(tab) {
    ['overview','bundles','run','results'].forEach(t => {
      document.getElementById(`ah-${t}`).style.display = (t===tab)?'':'none';
      document.getElementById(`ah-tab-${t}`).classList.toggle('active', t===tab);
    });
  };
  window._ahOvPreview = function() {
    const condId = document.getElementById('ah-ov-cond').value;
    const phase  = document.getElementById('ah-ov-phase').value;
    const prev   = document.getElementById('ah-ov-preview');
    if (!condId) { prev.innerHTML = ''; return; }
    const scales = CONDITION_BUNDLES[condId]?.[phase] || [];
    prev.innerHTML = `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px">${scales.length} scale${scales.length!==1?'s':''}:</div><div class="ah-chip-row">${scales.map(id=>scaleChip(id,false)).join('')}</div>`;
  };
  window._ahOvRun = function() {
    const condId = document.getElementById('ah-ov-cond').value; if (!condId) return;
    document.getElementById('ah-run-patient').value = document.getElementById('ah-ov-patient').value;
    document.getElementById('ah-run-cond').value = condId;
    document.getElementById('ah-run-phase').value = document.getElementById('ah-ov-phase').value;
    window._ahRunFilter(); window._ahTab('run');
  };
  window._ahToggleCond = function(condId) {
    const card = document.getElementById(`ah-cond-${condId}`);
    const body = document.getElementById(`ah-condbody-${condId}`);
    const open = card.classList.toggle('ah-cond-open');
    body.style.display = open ? '' : 'none';
  };
  window._ahFilterCat = function(cat) {
    document.querySelectorAll('.ah-cat-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(cat==='all'?'ah-cat-all':`ah-cat-${cat.replace(/[\s']/g,'-')}`)?.classList.add('active');
    condIds.forEach(id => { const c = document.getElementById(`ah-cond-${id}`); if(c) c.style.display = (cat==='all'||CONDITION_BUNDLES[id].cat===cat)?'':'none'; });
  };
  window._ahSelectBundle = function(condId, phase) {
    document.getElementById('ah-run-cond').value = condId;
    document.getElementById('ah-run-phase').value = phase;
    window._ahRunFilter(); window._ahTab('run');
  };
  window._ahRunFilter = function() {
    const condId = document.getElementById('ah-run-cond').value;
    const phase  = document.getElementById('ah-run-phase').value;
    const scales = condId ? (CONDITION_BUNDLES[condId]?.[phase] || []) : null;
    registry.forEach(s => { const c = document.getElementById(`ahsc-${s.id.replace(/[^a-z0-9]/gi,'_')}`); if(c) c.style.display = (!scales||scales.includes(s.id))?'':'none'; });
    window._ahCloseInline(); window._ahCloseScore();
  };
  window._ahRunScale = function(id) {
    const routed = routeLegacyRunAssessment(id, ASSESS_REGISTRY);
    if (routed.route !== 'inline_panel') {
      window._ahScoreEntry(id, routed.status);
      return;
    }
    const tpl = routed.instrument || findAssessInstrumentRow(id, ASSESS_REGISTRY) || registry.find(r => r.id === id);
    if (!tpl || !Array.isArray(tpl.questions) || tpl.questions.length === 0) {
      window._ahScoreEntry(id, 'declared_item_checklist_but_missing_form');
      return;
    }
    _ahInlineTpl = tpl; _ahInlineAnswers = new Array(tpl.questions.length).fill(0);
    document.getElementById('ah-score-panel').style.display = 'none';
    document.getElementById('ah-run-scale-list').style.display = 'none';
    document.getElementById('ah-inline-panel').style.display = '';
    document.getElementById('ah-inline-title').textContent = tpl.t;
    document.getElementById('ah-inline-err').style.display = 'none';
    document.getElementById('ah-inline-notes').value = '';
    document.getElementById('ah-inline-questions').innerHTML = tpl.questions.map((q,qi) => `
      <div style="margin-bottom:14px;padding:12px;background:rgba(0,0,0,0.2);border-radius:var(--radius-md);border:1px solid var(--border)">
        <div style="font-size:12.5px;color:var(--text-primary);margin-bottom:8px;line-height:1.5"><span style="color:var(--teal);font-weight:600;font-family:var(--font-mono)">${qi+1}.</span> ${q}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${tpl.options.map((opt,vi)=>`
          <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11.5px;padding:4px 8px;border-radius:var(--radius-sm);border:1px solid var(--border);background:rgba(0,0,0,0.15)">
            <input type="radio" name="ahq${qi}" value="${vi}" onchange="window._ahInlineChange(${qi},${vi})" ${vi===0?'checked':''}> ${opt}</label>`).join('')}</div>
      </div>`).join('');
    window._ahUpdateInline();
    _ahA11yAttach(document.getElementById('ah-inline-panel'), window._ahCloseInline);
  };
  window._ahInlineChange = function(qi, val) { _ahInlineAnswers[qi] = val; window._ahUpdateInline(); };
  window._ahUpdateInline = function() {
    if (!_ahInlineTpl) return;
    const total = _ahInlineAnswers.reduce((a,b)=>a+b,0);
    const badge = document.getElementById('ah-inline-badge'); if (badge) badge.textContent = total;
    const interp = _ahInlineTpl.interpret(total);
    const el = document.getElementById('ah-inline-interp');
    if (el) { el.textContent=interp.label; el.style.color=interp.color; el.style.borderLeft=`3px solid ${interp.color}`; el.style.background=`${interp.color}15`; }
  };
  // ── A11y helper for the inline + score entry panels: ESC to close, auto-focus
  //    first interactive element on open, Tab-cycle focus trap. Only one panel
  //    is open at a time, so a shared detach slot is enough. ───────────────
  let _ahPanelDetach = null;
  function _ahA11yAttach(panelEl, onEscape) {
    if (!panelEl) return;
    if (_ahPanelDetach) { _ahPanelDetach(); _ahPanelDetach = null; }
    const focusables = () => Array.from(panelEl.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(e => e.offsetParent !== null);
    const first = focusables()[0];
    if (first) first.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onEscape(); return; }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (!list.length) return;
      const firstEl = list[0], lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener('keydown', onKey);
    _ahPanelDetach = () => { document.removeEventListener('keydown', onKey); };
  }
  function _ahA11yDetach() {
    if (_ahPanelDetach) { _ahPanelDetach(); _ahPanelDetach = null; }
  }
  window._ahCloseInline = function() {
    _ahA11yDetach();
    const p=document.getElementById('ah-inline-panel'); if(p) p.style.display='none';
    const l=document.getElementById('ah-run-scale-list'); if(l) l.style.display=''; _ahInlineTpl=null;
  };
  window._ahScoreEntry = function(id, implStatusOpt) {
    _ahScoreTpl = registry.find(r => r.id === id); if (!_ahScoreTpl) return;
    const status =
      implStatusOpt != null
        ? implStatusOpt
        : getAssessmentImplementationStatus(id, ASSESS_REGISTRY).status;
    const noticeEl = document.getElementById('ah-score-notice');
    if (noticeEl) noticeEl.innerHTML = getLegacyRunScoreEntryNoticeHtml(status);
    document.getElementById('ah-inline-panel').style.display='none';
    document.getElementById('ah-run-scale-list').style.display='none';
    document.getElementById('ah-score-panel').style.display='';
    document.getElementById('ah-score-title').textContent = `${_ahScoreTpl.t} (max ${_ahScoreTpl.max})`;
    document.getElementById('ah-score-val').value=''; document.getElementById('ah-score-notes').value='';
    document.getElementById('ah-score-interp').style.display='none'; document.getElementById('ah-score-err').style.display='none';
    _ahA11yAttach(document.getElementById('ah-score-panel'), window._ahCloseScore);
  };
  window._ahScorePreview = function() {
    if (!_ahScoreTpl?.interpret) return;
    const val = parseFloat(document.getElementById('ah-score-val').value);
    const el  = document.getElementById('ah-score-interp');
    if (isNaN(val)) { el.style.display='none'; return; }
    const interp = _ahScoreTpl.interpret(val);
    el.textContent=interp.label; el.style.color=interp.color; el.style.borderLeft=`3px solid ${interp.color}`; el.style.background=`${interp.color}15`; el.style.display='inline-block';
  };
  window._ahCloseScore = function() {
    _ahA11yDetach();
    const p=document.getElementById('ah-score-panel'); if(p) p.style.display='none';
    const l=document.getElementById('ah-run-scale-list'); if(l) l.style.display='';
    const n=document.getElementById('ah-score-notice'); if(n) n.innerHTML='';
    _ahScoreTpl=null;
  };
  async function _doSave(tpl, score, patientId, notes, phase) {
    const interp = tpl.interpret ? tpl.interpret(score) : null;
    const noteStr = interp ? (notes ? `${interp.label} (${score}/${tpl.max}). ${notes}` : `${interp.label} (${score}/${tpl.max})`) : notes;
    const result = await api.createAssessment({ template_id:tpl.id, template_title:tpl.t, patient_id:patientId||null, data:{}, clinician_notes:noteStr||null, score:String(score), status:'completed' });
    if (patientId) {
      try {
        const cr = await api.listCourses({ patient_id: patientId, status: 'active' });
        const active = cr?.items || [];
        if (active.length) await api.recordOutcome({ patient_id:patientId, course_id:active[0].id, template_id:tpl.id, template_title:tpl.t, score:String(score), score_numeric:score, measurement_point:measureMap[phase]||'mid', assessment_id:result?.id||null });
      } catch (_) {}
    }
  }
  window._ahSaveInline = async function() {
    const errEl = document.getElementById('ah-inline-err'); errEl.style.display='none';
    if (!_ahInlineTpl) return;
    try { await _doSave(_ahInlineTpl, _ahInlineAnswers.reduce((a,b)=>a+b,0), document.getElementById('ah-run-patient').value.trim(), document.getElementById('ah-inline-notes').value.trim(), document.getElementById('ah-run-phase')?.value||'weekly'); window._nav('assessments'); }
    catch(e) { errEl.textContent=e.message; errEl.style.display=''; }
  };
  window._ahSaveScore = async function() {
    const errEl = document.getElementById('ah-score-err'); errEl.style.display='none';
    if (!_ahScoreTpl) return;
    const val = parseFloat(document.getElementById('ah-score-val').value);
    if (isNaN(val)) { errEl.textContent='Enter a valid score.'; errEl.style.display=''; return; }
    try { await _doSave(_ahScoreTpl, val, document.getElementById('ah-run-patient').value.trim(), document.getElementById('ah-score-notes').value.trim(), document.getElementById('ah-run-phase')?.value||'weekly'); window._nav('assessments'); }
    catch(e) { errEl.textContent=e.message; errEl.style.display=''; }
  };
  window._ahQuickRunScale = function(id) { window._ahTab('run'); setTimeout(() => window._ahRunScale(id), 50); };
  window.runInline       = (id) => window._ahRunScale(id);
  window.switchAssessTab = (t) => { if(t==='templates') window._ahTab('overview'); else if(t==='records') window._ahTab('results'); else window._ahTab('run'); };
  window.showAssessModal = () => window._ahTab('run');
  window.runTemplate     = (id) => window._ahScoreEntry(id);

  // Auto-launch if navigated from patient profile
  if (window._assessPreFillTemplate && window._assessPreFillPatient) {
    const tplId = window._assessPreFillTemplate;
    const patId  = window._assessPreFillPatient;
    window._assessPreFillTemplate = null;
    window._assessPreFillPatient  = null;
    setTimeout(() => {
      window._ahTab("run");
      const pi = document.getElementById("ah-run-patient");
      if (pi) pi.value = patId;
      window._ahRunScale && window._ahRunScale(tplId);
    }, 50);
  }
}

// ── AI Charting ───────────────────────────────────────────────────────────────
export function pgChart(setTopbar) {
  setTopbar('AI Charting', `<button class="btn btn-primary btn-sm" onclick="(function(){const el=document.getElementById('chart-input');const pt=document.getElementById('chart-patient');if(pt)pt.focus();else if(el)el.focus();})()">+ New Session Note</button>`);
  let chatHistory = [
    { role: 'assistant', content: 'Hello! I am your AI charting assistant. Select a patient and session type, then describe what happened and I will generate a clinical note.' }
  ];
  setTimeout(() => bindChat(chatHistory), 50);
  return `<div class="g2">
    ${cardWrap('AI Charting Assistant ✦', `
      <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
        <input id="chart-patient" class="form-control" style="flex:1" placeholder="Patient name or ID">
        <select id="chart-type" class="form-control" style="flex:1">
          <option>tDCS Session Note</option><option>TPS Session Note</option><option>taVNS Session Note</option>
          <option>Neurofeedback Note</option><option>Progress Note</option><option>Intake Note</option>
        </select>
      </div>
      <div style="border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;background:rgba(0,0,0,0.2)">
        <div id="chart-messages" style="height:300px;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:4px">
          <div class="bubble bubble-in">${chatHistory[0].content}</div>
        </div>
        <div style="padding:10px 12px;border-top:1px solid var(--border);display:flex;gap:8px;background:rgba(0,0,0,0.15)">
          <input id="chart-input" class="form-control" placeholder="Describe the session…" style="flex:1" onkeydown="if(event.key==='Enter')window.sendChart()">
          <button class="btn btn-primary btn-sm" onclick="window.sendChart()">Send →</button>
        </div>
      </div>
    `)}
    ${cardWrap('Note Preview', `
      <div id="chart-preview" style="background:rgba(0,0,0,0.25);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px;min-height:200px;font-size:12.5px;color:var(--text-primary);line-height:1.7">
        <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.7px;color:var(--teal);font-weight:600;margin-bottom:10px">Generated Note</div>
        <div id="chart-note-content" style="color:var(--text-secondary)">Your AI-generated note will appear here after the conversation.</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-primary btn-sm" onclick="window.signNote()">Save & Sign ✓</button>
        <button class="btn btn-sm" onclick="window.copyNote()">Copy Note</button>
      </div>
    `)}
  </div>`;
}

function bindChat(chatHistory) {
  window.sendChart = async function() {
    const input = document.getElementById('chart-input');
    const msgs = document.getElementById('chart-messages');
    if (!input || !msgs) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    chatHistory.push({ role: 'user', content: text });
    msgs.innerHTML += `<div class="bubble bubble-out">${text}</div>`;
    msgs.scrollTop = msgs.scrollHeight;
    try {
      const patient = document.getElementById('chart-patient')?.value || '';
      const type = document.getElementById('chart-type')?.value || 'Session Note';
      const res = await api.chatClinician(chatHistory, { patient_name: patient, note_type: type });
      const reply = res?.reply || 'No response received.';
      chatHistory.push({ role: 'assistant', content: reply });
      msgs.innerHTML += `<div class="bubble bubble-in">${reply}</div>`;
      msgs.scrollTop = msgs.scrollHeight;
      const noteEl = document.getElementById('chart-note-content');
      if (noteEl) noteEl.textContent = reply;
    } catch (e) {
      msgs.innerHTML += `<div class="bubble bubble-in" style="color:var(--red)">Error: ${e.message}</div>`;
    }
  };
  window.signNote = function() {
    const btn = document.querySelector('[onclick="window.signNote()"]');
    if (btn) { btn.textContent = '✓ Signed'; btn.disabled = true; btn.style.opacity = '0.7'; }
  };
  window.copyNote = function() {
    const note = document.getElementById('chart-note-content')?.textContent;
    if (!note) return;
    navigator.clipboard.writeText(note).then(() => {
      const btn = document.querySelector('[onclick="window.copyNote()"]');
      if (btn) { const orig = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = orig, 1500); }
    });
  };
}

// ── Brain Data Vault ───────────────────────────────────────────────────────────

// ── EEG Topographic Map ────────────────────────────────────────────────────────
const ELECTRODE_POSITIONS = [
  { id: 'Fp1', x: 68,  y: 28  }, { id: 'Fp2', x: 132, y: 28  },
  { id: 'F7',  x: 32,  y: 68  }, { id: 'F3',  x: 72,  y: 62  }, { id: 'Fz',  x: 100, y: 58  }, { id: 'F4',  x: 128, y: 62  }, { id: 'F8',  x: 168, y: 68  },
  { id: 'T3',  x: 18,  y: 120 }, { id: 'C3',  x: 60,  y: 112 }, { id: 'Cz',  x: 100, y: 108 }, { id: 'C4',  x: 140, y: 112 }, { id: 'T4',  x: 182, y: 120 },
  { id: 'T5',  x: 32,  y: 172 }, { id: 'P3',  x: 72,  y: 162 }, { id: 'Pz',  x: 100, y: 166 }, { id: 'P4',  x: 128, y: 162 }, { id: 'T6',  x: 168, y: 172 },
  { id: 'O1',  x: 72,  y: 208 }, { id: 'O2',  x: 128, y: 208 },
];

function eegTopoMap(bandValues = {}, selectedBand = 'alpha') {
  function valueToColor(val) {
    if (val === undefined) return 'rgba(255,255,255,0.1)';
    const h = 240 - Math.round(val * 240);
    return `hsl(${h},80%,50%)`;
  }
  const allVals = ELECTRODE_POSITIONS.map(e => bandValues[e.id]?.[selectedBand]).filter(v => v !== undefined);
  const minV = Math.min(...allVals, 0);
  const maxV = Math.max(...allVals, 1);

  const electrodes = ELECTRODE_POSITIONS.map(e => {
    const raw  = bandValues[e.id]?.[selectedBand];
    const norm = raw !== undefined ? (raw - minV) / (maxV - minV || 1) : undefined;
    const color   = valueToColor(norm);
    const hasData = raw !== undefined;
    return `
      <g>
        <circle cx="${e.x}" cy="${e.y}" r="12" fill="${color}" opacity="${hasData ? 0.85 : 0.2}" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
        <text x="${e.x}" y="${e.y + 4}" text-anchor="middle" font-size="7" fill="rgba(255,255,255,0.9)" font-family="monospace">${e.id}</text>
        ${hasData ? `<title>${e.id}: ${raw?.toFixed(2)} \u03bcV\u00b2/Hz</title>` : ''}
      </g>`;
  }).join('');

  const bands      = ['delta', 'theta', 'alpha', 'beta', 'gamma'];
  const bandColors = { delta: '#6366f1', theta: '#8b5cf6', alpha: '#00d4bc', beta: '#3b82f6', gamma: '#f59e0b' };
  const bandSelector = bands.map(b =>
    `<button onclick="window._topoSelectBand('${b}')" style="padding:4px 10px;border-radius:6px;border:1px solid ${b === selectedBand ? bandColors[b] : 'var(--border)'};background:${b === selectedBand ? bandColors[b] + '22' : 'transparent'};color:${b === selectedBand ? bandColors[b] : 'var(--text-secondary)'};cursor:pointer;font-size:0.75rem">${b.charAt(0).toUpperCase() + b.slice(1)}</button>`
  ).join('');

  return `<div style="text-align:center">
    <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-bottom:12px">${bandSelector}</div>
    <svg viewBox="0 0 200 240" width="240" height="288" style="display:inline-block">
      <ellipse cx="100" cy="120" rx="88" ry="100" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/>
      <path d="M94,18 Q100,8 106,18" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/>
      <path d="M12,108 Q6,120 12,132" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/>
      <path d="M188,108 Q194,120 188,132" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/>
      <line x1="100" y1="20" x2="100" y2="218" stroke="rgba(255,255,255,0.08)" stroke-width="1" stroke-dasharray="3,4"/>
      <line x1="12" y1="120" x2="188" y2="120" stroke="rgba(255,255,255,0.08)" stroke-width="1" stroke-dasharray="3,4"/>
      ${electrodes}
    </svg>
    <div style="display:flex;align-items:center;gap:6px;justify-content:center;margin-top:8px">
      <span style="font-size:0.7rem;color:var(--text-secondary)">Low</span>
      <div style="width:80px;height:8px;border-radius:4px;background:linear-gradient(90deg,hsl(240,80%,50%),hsl(120,80%,50%),hsl(0,80%,50%))"></div>
      <span style="font-size:0.7rem;color:var(--text-secondary)">High</span>
    </div>
    ${allVals.length === 0 ? '<div style="font-size:0.75rem;color:var(--text-secondary);margin-top:8px">Upload qEEG data to see topographic map</div>' : ''}
  </div>`;
}

// ── Live Biofeedback Panel ────────────────────────────────────────────────────
function renderBiofeedbackPanel() {
  return `<div class="ds-card" id="biofeedback-panel">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <h4>Live Biofeedback Demo</h4>
      <div style="display:flex;gap:8px;align-items:center">
        <span id="bfb-status" style="display:flex;align-items:center;gap:6px;font-size:0.78rem;color:var(--text-secondary)">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--border);display:inline-block"></span> Offline
        </span>
        <button id="bfb-toggle" class="btn-secondary" onclick="window._toggleBiofeedback()" style="font-size:0.78rem">\u25b6 Start Simulation</button>
      </div>
    </div>
    <div style="background:var(--navy-900);border-radius:8px;padding:12px;margin-bottom:12px;position:relative;overflow:hidden;height:80px">
      <svg id="bfb-wave" width="100%" height="56" style="display:block">
        <path id="bfb-wave-path" d="M0,28" fill="none" stroke="var(--teal-400)" stroke-width="1.5"/>
      </svg>
      <div style="position:absolute;top:6px;right:8px;font-family:monospace;font-size:0.7rem;color:var(--teal-400)" id="bfb-hz">-- Hz</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px" id="bfb-bands">
      ${['Delta','Theta','Alpha','Beta','Gamma'].map((b, i) => `
        <div style="text-align:center">
          <div style="font-size:0.7rem;color:var(--text-secondary);margin-bottom:4px">${b}</div>
          <div style="height:60px;background:var(--surface-2);border-radius:4px;position:relative;overflow:hidden">
            <div id="bfb-bar-${b.toLowerCase()}" style="position:absolute;bottom:0;left:0;right:0;background:${'var(--violet-500) var(--blue-500) var(--teal-400) var(--blue-500) var(--amber-500)'.split(' ')[i]};transition:height 0.3s ease;height:40%"></div>
          </div>
          <div id="bfb-val-${b.toLowerCase()}" style="font-size:0.7rem;font-family:monospace;margin-top:3px">-</div>
        </div>`).join('')}
    </div>
    <div style="margin-top:12px;padding:10px;border-radius:8px;background:var(--surface-2);display:flex;align-items:center;gap:10px" id="bfb-feedback">
      <div id="bfb-feedback-dot" style="width:16px;height:16px;border-radius:50%;background:var(--border);flex-shrink:0"></div>
      <div id="bfb-feedback-text" style="font-size:0.82rem;color:var(--text-secondary)">Start simulation to see feedback</div>
    </div>
  </div>`;
}

let _bfbRunning = false;
let _bfbFrame   = 0;
let _bfbInterval = null;

window._toggleBiofeedback = function() {
  _bfbRunning = !_bfbRunning;
  const btn    = document.getElementById('bfb-toggle');
  const status = document.getElementById('bfb-status');
  if (_bfbRunning) {
    if (btn)    btn.textContent = '\u23f9 Stop';
    if (status) status.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block;animation:pulse 1s infinite"></span> Live`;
    _bfbInterval = setInterval(_bfbTick, 100);
  } else {
    if (btn)    btn.textContent = '\u25b6 Start Simulation';
    if (status) status.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:var(--border);display:inline-block"></span> Offline`;
    clearInterval(_bfbInterval);
    _bfbInterval = null;
  }
};

function _bfbTick() {
  _bfbFrame++;
  const t = _bfbFrame * 0.1;
  const bands = {
    delta: 15 + Math.sin(t * 0.3) * 5 + Math.random() * 3,
    theta: 12 + Math.sin(t * 0.5) * 4 + Math.random() * 3,
    alpha: 20 + Math.sin(t * 0.7) * 8 + Math.random() * 4,
    beta:  10 + Math.sin(t * 1.1) * 3 + Math.random() * 2,
    gamma:  5 + Math.sin(t * 1.7) * 2 + Math.random() * 1.5,
  };
  const total = Object.values(bands).reduce((a, b) => a + b, 0);

  Object.entries(bands).forEach(([band, val]) => {
    const pct   = Math.round((val / total) * 100);
    const bar   = document.getElementById(`bfb-bar-${band}`);
    const valEl = document.getElementById(`bfb-val-${band}`);
    if (bar)   bar.style.height   = `${Math.max(5, pct * 2)}%`;
    if (valEl) valEl.textContent  = `${val.toFixed(1)}`;
  });

  const hz = document.getElementById('bfb-hz');
  if (hz) hz.textContent = `${(9 + Math.sin(t * 0.3) * 2).toFixed(1)} Hz`;

  const svg  = document.getElementById('bfb-wave');
  const path = document.getElementById('bfb-wave-path');
  if (svg && path) {
    const W  = svg.clientWidth || 400;
    const pts = [];
    for (let i = 0; i <= W; i += 3) {
      const y = 28 + Math.sin((i + _bfbFrame * 3) * 0.05) * 12
                   + Math.sin((i + _bfbFrame * 5) * 0.02) * 6
                   + (Math.random() - 0.5) * 3;
      pts.push(`${i},${y}`);
    }
    path.setAttribute('d', 'M' + pts.join(' L'));
  }

  const alphaRatio = bands.alpha / total;
  const fbDot  = document.getElementById('bfb-feedback-dot');
  const fbText = document.getElementById('bfb-feedback-text');
  if (fbDot && fbText) {
    if (alphaRatio > 0.32) {
      fbDot.style.background  = '#22c55e';
      fbText.textContent      = '\u2713 Alpha in target range \u2014 positive feedback active';
      fbText.style.color      = '#22c55e';
    } else if (alphaRatio > 0.25) {
      fbDot.style.background  = 'var(--amber-500)';
      fbText.textContent      = '\u26a1 Alpha approaching target \u2014 keep relaxing';
      fbText.style.color      = 'var(--amber-500)';
    } else {
      fbDot.style.background  = 'var(--rose-500)';
      fbText.textContent      = '\u2193 Alpha below target \u2014 encourage relaxation';
      fbText.style.color      = 'var(--rose-500)';
    }
  }

  if (!document.getElementById('biofeedback-panel')) {
    clearInterval(_bfbInterval);
    _bfbRunning = false;
  }
}

// Band power bar chart — pure CSS, no external library
function bandPowerChart(rec) {
  const bands = [
    { key: 'delta_power',  label: 'Delta', range: '0.5–4 Hz',  color: '#8b5cf6' },
    { key: 'theta_power',  label: 'Theta', range: '4–8 Hz',    color: '#3b82f6' },
    { key: 'alpha_power',  label: 'Alpha', range: '8–13 Hz',   color: '#14b8a6' },
    { key: 'beta_power',   label: 'Beta',  range: '13–30 Hz',  color: '#f59e0b' },
    { key: 'gamma_power',  label: 'Gamma', range: '30–100 Hz', color: '#f43f5e' },
  ];
  const values = bands.map(b => parseFloat(rec[b.key]) || 0);
  const maxVal  = Math.max(...values, 1);
  return `
    <div style="display:flex;flex-direction:column;gap:10px">
      ${bands.map((b, i) => {
        const val = values[i];
        const pct = Math.round((val / maxVal) * 100);
        return `<div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:11.5px;font-weight:600;color:var(--text-primary)">${b.label} <span style="font-weight:400;color:var(--text-tertiary);font-size:10.5px">${b.range}</span></span>
            <span style="font-size:11.5px;font-weight:600;color:${b.color};font-family:var(--font-mono)">${val.toFixed(2)} µV²</span>
          </div>
          <div style="background:rgba(255,255,255,0.06);border-radius:3px;height:20px;overflow:hidden">
            <div style="height:20px;border-radius:3px;background:${b.color};width:${pct}%;transition:width 0.4s;opacity:0.85"></div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

// Compute biomarker flags from band power values
function qeegFlags(rec) {
  const alpha = parseFloat(rec.alpha_power) || 0;
  const theta = parseFloat(rec.theta_power) || 0;
  const beta  = parseFloat(rec.beta_power)  || 0;
  const flags = [];
  if (theta > 0 && alpha / theta > 2)
    flags.push({ color: '#14b8a6', bg: 'rgba(20,184,166,0.1)',  text: 'Alpha dominance — potential hyper-relaxed state' });
  if (beta > 0 && theta / beta > 3)
    flags.push({ color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  text: 'Theta excess — associated with attention deficits (ADHD pattern)' });
  if (beta > 20)
    flags.push({ color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  text: 'Elevated beta — stress/anxiety pattern' });
  if (alpha > 0 && alpha < 5)
    flags.push({ color: '#f43f5e', bg: 'rgba(244,63,94,0.1)',   text: 'Alpha suppression — common in depression/trauma' });
  return flags;
}

export async function pgBrainData(setTopbar) {
  setTopbar('qEEG / Brain Data', `
    <button class="btn btn-primary btn-sm" onclick="window._showQEEGForm()">+ Upload qEEG Record</button>
    <button class="btn btn-sm" onclick="window._nav('qeegmaps')" style="margin-left:6px">Reference Maps →</button>
    <select id="qeeg-pat-filter" class="form-control" style="margin-left:8px;width:170px;display:inline-block" onchange="window._filterQEEGRecords(this.value)">
      <option value="">All Patients</option>
    </select>
  `);
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let records = [], patients = [];
  try {
    [records, patients] = await Promise.all([
      api.listQEEGRecords().then(r => r?.items || []).catch(() => []),
      api.listPatients().then(r => r?.items || []).catch(() => []),
    ]);
  } catch {}

  const patMap = {};
  patients.forEach(p => { patMap[p.id] = `${p.first_name} ${p.last_name}`; });

  // Populate patient filter in topbar (rendered asynchronously)
  setTimeout(() => {
    const pf = document.getElementById('qeeg-pat-filter');
    if (pf && patients.length) {
      patients.forEach(p => {
        const o = document.createElement('option');
        o.value = p.id; o.textContent = `${p.first_name} ${p.last_name}`;
        pf.appendChild(o);
      });
    }
  }, 0);

  function renderRecordList(recs) {
    if (!recs.length) return emptyState('◈', 'No qEEG records yet', 'Upload baseline and follow-up recordings to track neural changes.', '+ Upload qEEG Record', 'window._openQeegUpload?.()');
    return `<div style="display:flex;flex-direction:column;gap:6px" id="qeeg-record-list">
      ${recs.map(r => {
        const alpha = parseFloat(r.alpha_power) || 0;
        const theta = parseFloat(r.theta_power) || 0;
        const dots = [
          { label: 'α', val: alpha, color: '#14b8a6' },
          { label: 'θ', val: theta, color: '#3b82f6' },
          { label: 'β', val: parseFloat(r.beta_power) || 0, color: '#f59e0b' },
        ].map(d => `<span title="${d.label}: ${d.val.toFixed(1)} µV²" style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${d.color}22;color:${d.color};font-size:10px;font-weight:700;cursor:default">${d.label}</span>`).join('');
        return `<div id="qrec-row-${r.id}" class="qeeg-row" style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;transition:border-color var(--transition)" onclick="window._selectQEEGRecord('${r.id}')">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span style="font-size:13px;font-weight:600;color:var(--text-primary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${patMap[r.patient_id] || 'Unknown Patient'}</span>
            <span style="font-size:11px;color:var(--text-tertiary)">${r.recorded_at ? r.recorded_at.slice(0,10) : (r.recording_date || '—')}</span>
            <span style="font-size:11px;padding:2px 7px;border-radius:4px;background:var(--teal-ghost);color:var(--teal)">${r.eyes_condition?.replace(/_/g,' ') || '—'}</span>
            <div style="display:flex;gap:4px">${dots}</div>
          </div>
          ${r.eeg_device || r.equipment ? `<div style="margin-top:4px;font-size:11px;color:var(--text-tertiary)">${r.eeg_device || r.equipment}</div>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }

  el.innerHTML = `
  <div style="display:grid;grid-template-columns:340px 1fr;gap:16px;align-items:start">
    <!-- Left panel -->
    <div>
      <div id="qeeg-form-panel" style="display:none;margin-bottom:14px">
        ${cardWrap('Upload qEEG Record', `
          <div class="form-group"><label class="form-label">Patient</label>
            <select id="qr-patient" class="form-control">
              <option value="">Select patient…</option>
              ${patients.map(p => `<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Recording Date</label>
            <input id="qr-date" class="form-control" type="date">
          </div>
          <div class="form-group"><label class="form-label">EEG Device / System</label>
            <input id="qr-device" class="form-control" placeholder="e.g. NeuroGuide, Emotiv EPOC, Mitsar">
          </div>
          <div class="g2">
            <div class="form-group"><label class="form-label">Channels</label>
              <input id="qr-channels" class="form-control" type="number" min="1" placeholder="19">
            </div>
            <div class="form-group"><label class="form-label">Duration (min)</label>
              <input id="qr-duration" class="form-control" type="number" min="1" placeholder="5">
            </div>
          </div>

          <!-- Band power tab switcher -->
          <div style="display:flex;gap:0;border:1px solid var(--border);border-radius:6px;overflow:hidden;margin:12px 0 10px;width:fit-content">
            <button id="qr-tab-manual" onclick="window._switchQEEGTab('manual')" style="padding:5px 14px;font-size:11.5px;font-weight:600;border:none;background:var(--teal);color:#fff;cursor:pointer;transition:background 0.15s">Manual Entry</button>
            <button id="qr-tab-upload" onclick="window._switchQEEGTab('upload')" style="padding:5px 14px;font-size:11.5px;font-weight:600;border:none;background:transparent;color:var(--text-secondary);cursor:pointer;transition:background 0.15s">Upload File</button>
          </div>

          <!-- Upload File tab -->
          <div id="qr-upload-tab" style="display:none;margin-bottom:10px">
            <div id="qr-drop-zone" style="border:2px dashed var(--border);border-radius:8px;padding:32px;text-align:center;cursor:pointer;transition:border-color 0.2s;color:var(--text-tertiary);font-size:13px" onclick="document.getElementById('qr-file-input').click()">
              <div style="font-size:22px;margin-bottom:8px;opacity:.5">◈</div>
              Drag &amp; drop CSV / TXT / EDF file here or <strong style="color:var(--teal)">click to browse</strong>
              <div style="font-size:11px;margin-top:6px;color:var(--text-tertiary)">Supported: .csv, .txt (band values), .edf (server-parsed)</div>
            </div>
            <input type="file" id="qr-file-input" accept=".csv,.txt,.edf" style="display:none">
            ${!!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
              ? `<button class="btn-secondary" onclick="window._startQEEGCamera()" style="margin-top:8px;width:100%">
                  📷 Capture from Camera
                </button>`
              : ''}
            <div id="qr-file-notice" style="display:none;margin-top:10px"></div>
            <div id="qr-file-preview" style="display:none;margin-top:10px">
              <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Parsed Values</div>
              <table style="width:100%;border-collapse:collapse;font-size:12px" id="qr-preview-table"></table>
              <button class="btn btn-primary btn-sm" style="margin-top:10px;width:100%" onclick="window._useQEEGParsed()">Use These Values →</button>
            </div>
            <div id="qeeg-file-preview"></div>
          </div>

          <!-- Manual Entry tab -->
          <div id="qr-manual-tab">
            <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Band Power (µV²)</div>
            <div class="g2" style="gap:8px">
              <div class="form-group" style="margin-bottom:8px"><label class="form-label" style="font-size:11px">Delta (0.5–4 Hz)</label>
                <input id="qr-delta" class="form-control" type="number" step="0.01" placeholder="0.00">
              </div>
              <div class="form-group" style="margin-bottom:8px"><label class="form-label" style="font-size:11px">Theta (4–8 Hz)</label>
                <input id="qr-theta" class="form-control" type="number" step="0.01" placeholder="0.00">
              </div>
              <div class="form-group" style="margin-bottom:8px"><label class="form-label" style="font-size:11px">Alpha (8–13 Hz)</label>
                <input id="qr-alpha" class="form-control" type="number" step="0.01" placeholder="0.00">
              </div>
              <div class="form-group" style="margin-bottom:8px"><label class="form-label" style="font-size:11px">Beta (13–30 Hz)</label>
                <input id="qr-beta" class="form-control" type="number" step="0.01" placeholder="0.00">
              </div>
              <div class="form-group" style="margin-bottom:8px"><label class="form-label" style="font-size:11px">Gamma (30–100 Hz)</label>
                <input id="qr-gamma" class="form-control" type="number" step="0.01" placeholder="0.00">
              </div>
              <div class="form-group" style="margin-bottom:8px"><label class="form-label" style="font-size:11px">Artifact Rejection (%)</label>
                <input id="qr-artifact" class="form-control" type="number" min="0" max="100" placeholder="0">
              </div>
            </div>
          </div>

          <div class="form-group"><label class="form-label">Eyes Open/Closed</label>
            <select id="qr-eyes" class="form-control">
              <option value="eyes_closed">Eyes closed</option>
              <option value="eyes_open">Eyes open</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Notes</label>
            <textarea id="qr-notes" class="form-control" rows="2" placeholder="Key findings, LORETA summary…"></textarea>
          </div>
          <div id="qr-error" style="display:none;color:var(--red);font-size:12px;margin-bottom:8px"></div>
          <div style="display:flex;gap:8px">
            <button class="btn" onclick="document.getElementById('qeeg-form-panel').style.display='none'">Cancel</button>
            <button class="btn btn-primary" onclick="window._saveQEEGRecord()">Save Record</button>
          </div>
        `)}
      </div>
      ${cardWrap('qEEG Records', `
        <div id="qeeg-list-container">${renderRecordList(records)}</div>
      `, `<span style="font-size:11px;color:var(--text-tertiary)">${records.length} total</span>`)}
    </div>

    <!-- Right panel -->
    <div id="qeeg-detail-panel">
      <div style="display:flex;align-items:center;justify-content:center;min-height:300px;color:var(--text-tertiary);font-size:13px;flex-direction:column;gap:12px">
        <div style="font-size:32px;opacity:.3">◈</div>
        <div>Select a record to view band power analysis</div>
      </div>
    </div>
  </div>
  <!-- Topo map + biofeedback (always visible below the grid) -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
    <div class="ds-card">
      <h4 style="margin-bottom:14px">Topographic Map</h4>
      <div id="topo-map-container">${eegTopoMap({}, 'alpha')}</div>
    </div>
    ${renderBiofeedbackPanel()}
  </div>`;

  window._topoSelectedBand = 'alpha';
  window._topoData = {};
  window._topoSelectBand = function(band) {
    window._topoSelectedBand = band;
    const container = document.getElementById('topo-map-container');
    if (container) container.innerHTML = eegTopoMap(window._topoData || {}, band);
  };
  window._updateTopoFromRecord = function(rec) {
    // Distribute single-channel band values across all electrodes with small noise for visual demo
    const bandKeys = ['delta', 'theta', 'alpha', 'beta', 'gamma'];
    const base = {
      delta: parseFloat(rec.delta_power) || 0,
      theta: parseFloat(rec.theta_power) || 0,
      alpha: parseFloat(rec.alpha_power) || 0,
      beta:  parseFloat(rec.beta_power)  || 0,
      gamma: parseFloat(rec.gamma_power) || 0,
    };
    window._topoData = {};
    ELECTRODE_POSITIONS.forEach(e => {
      window._topoData[e.id] = {};
      bandKeys.forEach(b => {
        window._topoData[e.id][b] = Math.max(0, base[b] * (0.7 + Math.random() * 0.6));
      });
    });
    const container = document.getElementById('topo-map-container');
    if (container) container.innerHTML = eegTopoMap(window._topoData, window._topoSelectedBand || 'alpha');
  };

  bindBrainData(records, patMap, patients, setTopbar);
}

// ── qEEG file parsing helpers ──────────────────────────────────────────────

function parseQEEGFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
      const result = { delta: null, theta: null, alpha: null, beta: null, gamma: null };

      const hasBandCol = lines[0] && lines[0].toLowerCase().includes('band');
      if (hasBandCol) {
        lines.slice(1).forEach(line => {
          const [band, power] = line.split(/[,\t ]+/);
          const key = band?.trim().toLowerCase();
          const val = parseFloat(power);
          if (key && !isNaN(val)) result[key] = val;
        });
      } else {
        const headers = lines[0].split(/[,\t ]+/).map(h => h.trim().toLowerCase());
        if (lines[1]) {
          const values = lines[1].split(/[,\t ]+/).map(v => parseFloat(v.trim()));
          headers.forEach((h, i) => {
            if (!isNaN(values[i])) result[h] = values[i];
          });
        }
      }

      // Normalize common header variations
      if (result['delta (0.5-4 hz)'] != null) result.delta = result['delta (0.5-4 hz)'];
      if (result['theta (4-8 hz)']   != null) result.theta = result['theta (4-8 hz)'];
      if (result['alpha (8-13 hz)']  != null) result.alpha = result['alpha (8-13 hz)'];
      if (result['beta (13-30 hz)']  != null) result.beta  = result['beta (13-30 hz)'];
      if (result['gamma (30-100 hz)']!= null) result.gamma = result['gamma (30-100 hz)'];

      const parsed = Object.values(result).filter(v => v !== null).length;
      if (parsed === 0) reject(new Error('No band power values found in file. Check CSV format.'));
      else resolve(result);
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsText(file);
  });
}

async function handleQEEGFile(file) {
  const notice = document.getElementById('qr-file-notice');
  const preview = document.getElementById('qr-file-preview');
  const table = document.getElementById('qr-preview-table');
  if (!notice || !preview || !table) return;

  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'edf') {
    notice.style.display = '';
    notice.innerHTML = `<div class="notice" style="background:rgba(74,158,255,0.08);border:1px solid rgba(74,158,255,0.25);border-radius:6px;padding:10px 12px;font-size:12px;color:var(--blue)">
      <strong>EDF binary file detected:</strong> ${file.name}<br>
      EDF binary parsing requires server processing. Pre-filling band values with 0 — please complete manually after saving.
    </div>`;
    preview.style.display = 'none';
    // Pre-fill zeros
    ['delta','theta','alpha','beta','gamma'].forEach(b => {
      const el = document.getElementById(`qr-${b}`);
      if (el) el.value = '0';
    });
    return;
  }

  notice.style.display = '';
  notice.innerHTML = `<div style="font-size:12px;color:var(--text-tertiary)">Parsing ${file.name}…</div>`;
  preview.style.display = 'none';

  try {
    const parsed = await parseQEEGFile(file);
    window._qeegParsedValues = parsed;

    const bands = ['delta','theta','alpha','beta','gamma'];
    const rows = bands.map(b => {
      const val = parsed[b];
      const present = val !== null && val !== undefined;
      return `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:5px 8px;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:capitalize">${b}</td>
        <td style="padding:5px 8px;font-size:12px;font-family:var(--font-mono);color:${present ? 'var(--teal)' : 'var(--text-tertiary)'}">${present ? val.toFixed(2) : '—'}</td>
        <td style="padding:5px 8px;font-size:11px;color:${present ? 'var(--green)' : 'var(--amber)'}">${present ? '✓' : 'Not found'}</td>
      </tr>`;
    }).join('');
    table.innerHTML = `<thead><tr style="border-bottom:1px solid var(--border)">
      <th style="padding:4px 8px;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;text-align:left">Band</th>
      <th style="padding:4px 8px;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;text-align:left">µV²</th>
      <th style="padding:4px 8px;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;text-align:left">Status</th>
    </tr></thead><tbody>${rows}</tbody>`;

    notice.innerHTML = `<div style="font-size:12px;color:var(--green)">✓ Parsed ${file.name}</div>`;
    preview.style.display = '';
  } catch (err) {
    notice.innerHTML = `<div style="font-size:12px;color:var(--red)">Error: ${err.message}</div>`;
    preview.style.display = 'none';
  }
}

export function bindBrainData(records, patMap, patients, setTopbar) {
  let allRecords = records || [];

  window._switchQEEGTab = function(tab) {
    const manualTab = document.getElementById('qr-manual-tab');
    const uploadTab = document.getElementById('qr-upload-tab');
    const btnManual = document.getElementById('qr-tab-manual');
    const btnUpload = document.getElementById('qr-tab-upload');
    if (!manualTab || !uploadTab) return;
    if (tab === 'manual') {
      manualTab.style.display = '';
      uploadTab.style.display = 'none';
      if (btnManual) { btnManual.style.background = 'var(--teal)'; btnManual.style.color = '#fff'; }
      if (btnUpload) { btnUpload.style.background = 'transparent'; btnUpload.style.color = 'var(--text-secondary)'; }
    } else {
      manualTab.style.display = 'none';
      uploadTab.style.display = '';
      if (btnUpload) { btnUpload.style.background = 'var(--teal)'; btnUpload.style.color = '#fff'; }
      if (btnManual) { btnManual.style.background = 'transparent'; btnManual.style.color = 'var(--text-secondary)'; }
    }
  };

  window._useQEEGParsed = function() {
    const p = window._qeegParsedValues;
    if (!p) return;
    ['delta','theta','alpha','beta','gamma'].forEach(b => {
      const el = document.getElementById(`qr-${b}`);
      if (el && p[b] != null) el.value = p[b].toFixed(2);
    });
    window._switchQEEGTab('manual');
  };

  // Bind drop zone after a tick (DOM may not be ready yet)
  setTimeout(() => {
    const zone = document.getElementById('qr-drop-zone');
    const fileInput = document.getElementById('qr-file-input');
    if (zone) {
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--teal)'; zone.style.borderStyle = 'solid'; });
      zone.addEventListener('dragleave', () => { zone.style.borderColor = 'var(--border)'; zone.style.borderStyle = 'dashed'; });
      zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        zone.style.borderColor = 'var(--border)'; zone.style.borderStyle = 'dashed';
        const file = e.dataTransfer.files[0];
        if (file) await handleQEEGFile(file);
      });
    }
    if (fileInput) {
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (file) await handleQEEGFile(file);
        fileInput.value = '';
      });
    }
  }, 50);

  window._showQEEGForm = () => {
    document.getElementById('qeeg-form-panel').style.display = '';
    // Reset to manual tab each time form is opened
    window._switchQEEGTab('manual');
  };

  window._filterQEEGRecords = async function(patientId) {
    const container = document.getElementById('qeeg-list-container');
    if (!container) return;
    container.innerHTML = spinner();
    try {
      const params = patientId ? { patient_id: patientId } : {};
      const res = await api.listQEEGRecords(params);
      allRecords = res?.items || [];
      container.innerHTML = _renderRecordRows(allRecords, patMap || {});
    } catch (e) {
      container.innerHTML = `<div style="color:var(--red);font-size:12px">Load failed: ${e.message}</div>`;
    }
  };

  function _renderRecordRows(recs, pm) {
    if (!recs.length) return emptyState('◈', 'No records found.');
    return `<div style="display:flex;flex-direction:column;gap:6px" id="qeeg-record-list">
      ${recs.map(r => {
        const dots = [
          { label: 'α', val: parseFloat(r.alpha_power) || 0, color: '#14b8a6' },
          { label: 'θ', val: parseFloat(r.theta_power) || 0, color: '#3b82f6' },
          { label: 'β', val: parseFloat(r.beta_power)  || 0, color: '#f59e0b' },
        ].map(d => `<span title="${d.label}: ${d.val.toFixed(1)} µV²" style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${d.color}22;color:${d.color};font-size:10px;font-weight:700;cursor:default">${d.label}</span>`).join('');
        return `<div id="qrec-row-${r.id}" class="qeeg-row" style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;transition:border-color var(--transition)" onclick="window._selectQEEGRecord('${r.id}')">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span style="font-size:13px;font-weight:600;color:var(--text-primary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${pm[r.patient_id] || 'Unknown Patient'}</span>
            <span style="font-size:11px;color:var(--text-tertiary)">${r.recorded_at ? r.recorded_at.slice(0,10) : (r.recording_date || '—')}</span>
            <span style="font-size:11px;padding:2px 7px;border-radius:4px;background:var(--teal-ghost);color:var(--teal)">${r.eyes_condition?.replace(/_/g,' ') || '—'}</span>
            <div style="display:flex;gap:4px">${dots}</div>
          </div>
          ${r.eeg_device || r.equipment ? `<div style="margin-top:4px;font-size:11px;color:var(--text-tertiary)">${r.eeg_device || r.equipment}</div>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }

  window._selectQEEGRecord = function(id) {
    document.querySelectorAll('.qeeg-row').forEach(row => {
      row.style.borderColor = 'var(--border)';
      row.style.background = '';
    });
    const selRow = document.getElementById(`qrec-row-${id}`);
    if (selRow) { selRow.style.borderColor = 'var(--border-teal)'; selRow.style.background = 'rgba(0,212,188,0.03)'; }

    const rec = allRecords.find(r => r.id === id);
    if (!rec) return;

    // Update topographic map with record band data
    if (window._updateTopoFromRecord) window._updateTopoFromRecord(rec);

    const flags = qeegFlags(rec);
    const pm2 = patMap || {};
    const recPatName = pm2[rec.patient_id] || 'Unknown Patient';
    const recordDate = rec.recorded_at ? rec.recorded_at.slice(0,10) : (rec.recording_date || '—');

    const detail = document.getElementById('qeeg-detail-panel');
    if (!detail) return;
    detail.innerHTML = `
      <div class="card" style="margin-bottom:14px">
        <div class="card-header">
          <h3>Band Power Analysis</h3>
          <span style="font-size:11px;color:var(--text-tertiary)">${recPatName} · ${recordDate}</span>
        </div>
        <div class="card-body">
          ${bandPowerChart(rec)}
        </div>
      </div>
      ${flags.length ? `<div class="card" style="margin-bottom:14px">
        <div class="card-header"><h3>Biomarker Flags</h3></div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:8px">
          ${flags.map(f => `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:6px;background:${f.bg};border:1px solid ${f.color}33">
            <span style="color:${f.color};font-size:13px;flex-shrink:0">◉</span>
            <span style="font-size:12px;color:${f.color};line-height:1.5">${f.text}</span>
          </div>`).join('')}
        </div>
      </div>` : ''}
      <div class="card">
        <div class="card-header"><h3>Record Metadata</h3></div>
        <div class="card-body">
          ${fr('Patient', recPatName)}
          ${fr('Recording Date', recordDate)}
          ${fr('EEG Device', rec.eeg_device || rec.equipment || '—')}
          ${fr('Channels', rec.channels != null ? String(rec.channels) : '—')}
          ${fr('Duration', rec.duration_minutes != null ? rec.duration_minutes + ' min' : '—')}
          ${fr('Eyes Condition', rec.eyes_condition?.replace(/_/g,' ') || '—')}
          ${fr('Artifact Rejection', rec.artifact_rejection_pct != null ? rec.artifact_rejection_pct + '%' : '—')}
          ${fr('Record ID', (rec.id?.slice(0,8) || '') + '…')}
          <div style="margin-top:14px">
            <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px;font-weight:600">Notes</label>
            <textarea id="qrec-detail-notes-${id}" class="form-control" rows="3" style="font-size:12px">${rec.notes || rec.summary_notes || ''}</textarea>
          </div>
          <div id="qrec-detail-err-${id}" style="display:none;color:var(--red);font-size:12px;margin:6px 0"></div>
          <button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="window._saveQEEGNotes('${id}')">Save Notes</button>
        </div>
      </div>`;
  };

  window._saveQEEGNotes = async function(id) {
    const errEl = document.getElementById(`qrec-detail-err-${id}`);
    if (errEl) errEl.style.display = 'none';
    const notes = document.getElementById(`qrec-detail-notes-${id}`)?.value || null;
    try {
      await api.updateQEEGRecord(id, { notes, summary_notes: notes });
      const btn = document.querySelector(`[onclick="window._saveQEEGNotes('${id}')"]`);
      if (btn) { const orig = btn.textContent; btn.textContent = '✓ Saved'; btn.disabled = true; setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1800); }
    } catch (e) {
      if (errEl) { errEl.textContent = e.message || 'Save failed.'; errEl.style.display = ''; }
    }
  };

  window._saveQEEGRecord = async function() {
    const errEl = document.getElementById('qr-error');
    if (errEl) errEl.style.display = 'none';
    const patientId = document.getElementById('qr-patient')?.value;
    if (!patientId) { if (errEl) { errEl.textContent = 'Select a patient.'; errEl.style.display = 'block'; } return; }
    const payload = {
      patient_id:             patientId,
      recorded_at:            document.getElementById('qr-date')?.value || null,
      eeg_device:             document.getElementById('qr-device')?.value || null,
      channels:               parseInt(document.getElementById('qr-channels')?.value) || null,
      duration_minutes:       parseFloat(document.getElementById('qr-duration')?.value) || null,
      delta_power:            parseFloat(document.getElementById('qr-delta')?.value) || null,
      theta_power:            parseFloat(document.getElementById('qr-theta')?.value) || null,
      alpha_power:            parseFloat(document.getElementById('qr-alpha')?.value) || null,
      beta_power:             parseFloat(document.getElementById('qr-beta')?.value) || null,
      gamma_power:            parseFloat(document.getElementById('qr-gamma')?.value) || null,
      artifact_rejection_pct: parseFloat(document.getElementById('qr-artifact')?.value) || null,
      eyes_condition:         document.getElementById('qr-eyes')?.value || null,
      notes:                  document.getElementById('qr-notes')?.value || null,
    };
    try {
      await api.createQEEGRecord(payload);
      await pgBrainData(setTopbar);
    } catch (e) {
      if (errEl) { errEl.textContent = e.message || 'Save failed.'; errEl.style.display = 'block'; }
    }
  };

  // ── Camera capture for qEEG upload ────────────────────────────────────────
  window._startQEEGCamera = async function() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const overlay = document.createElement('div');
      overlay.id = 'camera-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:600;display:flex;flex-direction:column;align-items:center;justify-content:center';
      overlay.innerHTML = `
        <video id="camera-preview" autoplay playsinline style="max-width:100%;max-height:70vh;border-radius:8px"></video>
        <div style="display:flex;gap:12px;margin-top:16px">
          <button onclick="window._captureQEEGPhoto()" style="background:white;border:none;border-radius:50%;width:64px;height:64px;font-size:1.8rem;cursor:pointer">📸</button>
          <button onclick="window._stopCamera()" style="background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);border-radius:8px;color:white;padding:12px 20px;cursor:pointer">Cancel</button>
        </div>
        <p style="color:rgba(255,255,255,0.6);font-size:0.8rem;margin-top:12px">Point camera at EEG printout or report</p>`;
      document.body.appendChild(overlay);
      const video = document.getElementById('camera-preview');
      video.srcObject = stream;
      window._cameraStream = stream;
    } catch (err) {
      _dsToast('Camera access denied. Please allow camera permissions in your browser settings.', 'error');
    }
  };

  window._captureQEEGPhoto = function() {
    const video = document.getElementById('camera-preview');
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      window._stopCamera();
      const imgUrl = URL.createObjectURL(blob);
      const preview = document.getElementById('qeeg-file-preview');
      if (preview) {
        preview.innerHTML = `<img src="${imgUrl}" style="max-width:100%;border-radius:8px;margin-top:8px">
          <p style="color:var(--text-secondary);font-size:0.8rem;margin-top:8px">📸 Photo captured — manual entry recommended for accuracy</p>`;
      }
      window._announce?.('Photo captured. Please verify values manually.');
    }, 'image/jpeg', 0.8);
  };

  window._stopCamera = function() {
    window._cameraStream?.getTracks().forEach(t => t.stop());
    document.getElementById('camera-overlay')?.remove();
  };

  window.runCaseSummary = async function() {
    const res = document.getElementById('case-summary-result');
    if (res) res.innerHTML = spinner();
    try {
      const result = await api.caseSummary({ uploads: [] });
      if (res) res.innerHTML = cardWrap('Case Summary', `
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.7;margin-bottom:12px">
          ${result?.presenting_symptoms?.length ? `<strong>Symptoms:</strong> ${result.presenting_symptoms.join(', ')}<br>` : ''}
          ${result?.possible_targets?.length ? `<strong>Possible Targets:</strong> ${result.possible_targets.join(', ')}<br>` : ''}
          ${result?.suggested_modalities?.length ? `<strong>Suggested Modalities:</strong> ${result.suggested_modalities.join(', ')}` : 'Upload documents to generate a case summary.'}
        </div>
        ${result?.red_flags?.length ? `<div class="notice notice-warn">⚠ Red flags: ${result.red_flags.join(', ')}</div>` : ''}
      `);
    } catch (e) {
      if (res) res.innerHTML = `<div class="notice notice-warn">${e.message}</div>`;
    }
  };

  // legacy band-switch stub for external callers
  window.switchBand = function(b2) {
    eegBand = b2;
    const svgEl = document.getElementById('eeg-svg');
    if (svgEl) svgEl.innerHTML = brainMapSVG(b2);
    document.querySelectorAll('#content .btn-sm').forEach(btn => {
      if (['Alpha', 'Theta', 'Beta'].includes(btn.textContent)) {
        btn.className = 'btn btn-sm' + (btn.textContent.toLowerCase() === b2 ? ' btn-primary' : '');
      }
    });
  };

}

// ── Messaging Hub ────────────────────────────────────────────────────────────

const MESSAGE_TEMPLATES = [
  {
    id: 'session-reminder',
    name: 'Session Reminder',
    icon: '📅',
    subject: 'Session Reminder',
    body: `Hi {{patient_name}},\n\nThis is a reminder that your next session is scheduled for {{date}} at {{time}}.\n\nPlease arrive 5 minutes early and ensure you've had adequate sleep.\n\nSee you soon!\n{{clinician_name}}`,
  },
  {
    id: 'homework-nudge',
    name: 'Homework Nudge',
    icon: '📝',
    subject: 'Your Homework Exercises',
    body: `Hi {{patient_name}},\n\nJust checking in — have you had a chance to complete your daily exercises this week?\n\nRemember: consistent practice between sessions significantly improves outcomes.\n\nLet me know if you have any questions!\n{{clinician_name}}`,
  },
  {
    id: 'progress-update',
    name: 'Progress Update',
    icon: '📊',
    subject: 'Your Treatment Progress',
    body: `Hi {{patient_name}},\n\nI wanted to share a progress update. You've completed {{session_count}} sessions and we're seeing positive indicators.\n\nKeep up the great work!\n{{clinician_name}}`,
  },
  {
    id: 'appointment-confirm',
    name: 'Appointment Confirmation',
    icon: '✅',
    subject: 'Appointment Confirmed',
    body: `Hi {{patient_name}},\n\nYour appointment on {{date}} at {{time}} has been confirmed.\n\nLocation: {{clinic_name}}\n\nPlease contact us if you need to reschedule.\n\n{{clinician_name}}`,
  },
  {
    id: 'safety-checkin',
    name: 'Safety Check-in',
    icon: '🛡️',
    subject: 'How are you feeling?',
    body: `Hi {{patient_name}},\n\nWe noticed you missed your last session. We just wanted to check in and make sure you're doing well.\n\nPlease reply to this message or call us if you have any concerns.\n\n{{clinician_name}}`,
  },
  {
    id: 'course-complete',
    name: 'Course Completion',
    icon: '🎉',
    subject: 'Congratulations on Completing Your Treatment!',
    body: `Hi {{patient_name}},\n\nCongratulations on completing your treatment course! You've achieved a significant milestone.\n\nWe'll be scheduling a follow-up assessment in 4 weeks to track your continued progress.\n\nThank you for your commitment to your health.\n{{clinician_name}}`,
  },
];

// ─── Virtual Care ────────────────────────────────────────────────────────────

function _vcEsc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

function _vcRelTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000)    return 'Just now';
  if (diff < 3600000)  return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  return new Date(iso).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
}

function _vcStatusBadge(status) {
  const MAP = {
    'scheduled':       ['vc-status--scheduled',  'Scheduled'],
    'in-progress':     ['vc-status--inprog',      'In Progress'],
    'completed':       ['vc-status--done',        'Completed'],
    'missed':          ['vc-status--missed',      'Missed'],
    'follow-up-needed':['vc-status--followup',    'Follow-up Needed'],
    'awaiting-signoff':['vc-status--signoff',     'Awaiting Sign-off'],
    'awaiting-review': ['vc-status--review',      'Awaiting Review'],
    'signed':          ['vc-status--done',        'Signed'],
    'transcribing':    ['vc-status--inprog',      'Transcribing\u2026'],
  };
  const [cls, lbl] = MAP[status] || ['vc-status--scheduled', status];
  return `<span class="vc-status-badge ${cls}">${lbl}</span>`;
}

function _vcUrgencyBadge(urgency) {
  if (urgency === 'urgent')   return '<span class="vc-urg vc-urg--urgent">Urgent</span>';
  if (urgency === 'moderate') return '<span class="vc-urg vc-urg--moderate">Moderate</span>';
  return '<span class="vc-urg vc-urg--routine">Routine</span>';
}

const VC_MOCK = {
  callRequests: [
    { id:'cr1', patientId:'p_demo',  patientName:'Emma Larson',    initials:'EL',
      condition:'Treatment-Resistant Depression', modality:'TMS',
      requestedAt:'2026-04-12T08:45:00Z', preferredTime:'Morning (9\u201311 am)',
      type:'video', reason:'Headache after session 9, feels worse than usual',
      urgency:'urgent',   courseRef:'TMS \u2014 Week 5', sessionRef:'Session 9' },
    { id:'cr2', patientId:'p_demo2', patientName:'James Okafor',   initials:'JO',
      condition:'Generalised Anxiety Disorder',   modality:'Neurofeedback',
      requestedAt:'2026-04-12T07:30:00Z', preferredTime:'Afternoon (2\u20134 pm)',
      type:'voice', reason:'Question about homework protocol and schedule change',
      urgency:'routine',  courseRef:'NF \u2014 Week 3',  sessionRef:'Session 6' },
    { id:'cr3', patientId:'p_demo3', patientName:'Ana Reyes',      initials:'AR',
      condition:'PTSD',   modality:'tDCS',
      requestedAt:'2026-04-11T15:00:00Z', preferredTime:'Flexible',
      type:'voice', reason:'Consent question for upcoming protocol change',
      urgency:'routine',  courseRef:'tDCS \u2014 Week 2',sessionRef:'Session 4' },
  ],
  videoVisits: [
    { id:'vv1', patientId:'p_demo',  patientName:'Emma Larson',    initials:'EL',
      condition:'TRD', modality:'TMS',
      scheduledAt:'2026-04-12T14:00:00Z', duration:30,
      purpose:'Mid-course check-in and side effect review',
      status:'scheduled', notesStatus:'pending' },
    { id:'vv2', patientId:'p_demo4', patientName:'David Chen',     initials:'DC',
      condition:'OCD', modality:'TMS',
      scheduledAt:'2026-04-12T10:30:00Z', duration:20,
      purpose:'Post-intensive follow-up',
      status:'completed', notesStatus:'draft' },
    { id:'vv3', patientId:'p_demo5', patientName:'Priya Nair',     initials:'PN',
      condition:'MDD', modality:'CES',
      scheduledAt:'2026-04-11T16:00:00Z', duration:30,
      purpose:'Initial virtual assessment',
      status:'missed', notesStatus:'pending' },
  ],
  voiceCalls: [
    { id:'vcl1', patientId:'p_demo2', patientName:'James Okafor',  initials:'JO',
      condition:'GAD', modality:'Neurofeedback',
      scheduledAt:'2026-04-12T11:00:00Z', duration:20,
      purpose:'Weekly check-in', status:'scheduled', notesStatus:'pending' },
    { id:'vcl2', patientId:'p_demo3', patientName:'Ana Reyes',     initials:'AR',
      condition:'PTSD', modality:'tDCS',
      scheduledAt:'2026-04-11T14:00:00Z', duration:15,
      purpose:'Adverse event follow-up', status:'completed', notesStatus:'signed' },
    { id:'vcl3', patientId:'p_demo',  patientName:'Emma Larson',   initials:'EL',
      condition:'TRD', modality:'TMS',
      scheduledAt:'2026-04-10T15:30:00Z', duration:20,
      purpose:'Session 8 feedback', status:'follow-up-needed', notesStatus:'draft' },
  ],
  sharedMedia: [
    { id:'sm1', patientId:'p_demo',  patientName:'Emma Larson',    initials:'EL',
      condition:'TRD', modality:'TMS',
      type:'voice-note',   submittedAt:'2026-04-12T07:15:00Z',
      subject:'Post-session headache \u2014 Session 9',
      reason:'Side effect concern', severity:'Moderate (6/10)', trend:'Worse',
      sessionRef:'Session 9', duration:'1:42', urgency:'urgent', reviewed:false,
      aiSummary:'Patient describes throbbing headache (6/10) starting 2 hours post-session. Worse than sessions 7\u20138. No nausea. Resting helped slightly. Duration approx. 3 hours. Recommend follow-up before session 10.' },
    { id:'sm2', patientId:'p_demo2', patientName:'James Okafor',   initials:'JO',
      condition:'GAD', modality:'Neurofeedback',
      type:'text-update',  submittedAt:'2026-04-11T21:30:00Z',
      subject:'Feeling calmer \u2014 tracking homework',
      reason:'Progress update', severity:'None', trend:'Better',
      sessionRef:'Session 6', urgency:'routine', reviewed:false,
      aiSummary:'Patient reports reduced anxiety in social situations. Completed 5/7 homework sessions. Sleep slightly improved. No adverse events reported.' },
    { id:'sm3', patientId:'p_demo4', patientName:'David Chen',     initials:'DC',
      condition:'OCD', modality:'TMS',
      type:'video-update', submittedAt:'2026-04-11T18:00:00Z',
      subject:'Compulsion frequency self-report',
      reason:'Weekly self-report', severity:'Mild', trend:'Same',
      sessionRef:'Session 7', duration:'2:15', urgency:'routine', reviewed:true,
      aiSummary:'Checking behaviour: ~15\u2192~10 times/day. Work stress cited as maintaining factor. Good homework compliance. No new adverse events reported.' },
  ],
  aiNotes: [
    { id:'an1', patientId:'p_demo',  patientName:'Emma Larson',    initials:'EL',
      condition:'TRD', modality:'TMS',
      type:'voice-note',   recordedAt:'2026-04-11T17:00:00Z',
      subject:'Session 9 \u2014 Clinical observation',
      transcription:'Patient reported increased fatigue during session. Tolerated 120% MT but noted mild scalp discomfort at the coil site. Plan to review intensity for session 10. PHQ-9 showed improvement from 18 to 14 since baseline.',
      aiSummary:'Session 9 TMS: 120% MT, mild scalp discomfort noted. Patient fatigue reported. PHQ-9: 18\u219214 (improvement). Recommend intensity review for session 10.',
      status:'awaiting-signoff' },
    { id:'an2', patientId:'p_demo4', patientName:'David Chen',     initials:'DC',
      condition:'OCD', modality:'TMS',
      type:'text-note',    recordedAt:'2026-04-12T10:45:00Z',
      subject:'Post-visit note \u2014 Video consult',
      transcription:'Virtual visit completed. Patient engaged and motivated. Y-BOCS trending down since week 2. Recommended adding one additional ERP homework task. No adverse events to report.',
      aiSummary:'Virtual visit: patient engaged, motivated. Y-BOCS improving (down since week 2). ERP: add 1 additional task. No adverse events.',
      status:'awaiting-review' },
    { id:'an3', patientId:'p_demo2', patientName:'James Okafor',   initials:'JO',
      condition:'GAD', modality:'Neurofeedback',
      type:'transcription', recordedAt:'2026-04-10T15:30:00Z',
      subject:'Phone consultation note',
      transcription:'Called to review homework protocol. Patient consistent with NF sessions. GAD-7 down from 15 to 11. Discussed diaphragmatic breathing as a supplement between sessions.',
      aiSummary:'Phone consult: consistent NF sessions. GAD-7: 15\u219211. Breathing exercises added as supplement. No concerns raised.',
      status:'signed' },
  ],
};

// Module-level VC state (reset per pgVirtualCare call)
let _vcTab = 'inbox';
let _vcInboxPid = null;
let _vcInboxMsgs = [];
let _vcPatients = [];
let _vcSelCR = null;
let _vcSelVisit = null;
let _vcSelCall = null;
let _vcSelMedia = null;
let _vcSelNote = null;

export async function pgVirtualCare(setTopbar) {
  setTopbar('Virtual Care', 'Video visits · Voice calls · Secure messaging · AI notes');
  const el = document.getElementById('content');
  if (!el) return;
  el.innerHTML = '<div class="page-loading"></div>';

  _vcTab = 'inbox'; _vcSelCR = null; _vcSelVisit = null;
  _vcSelCall = null; _vcSelMedia = null; _vcSelNote = null;

  try { const r = await api.listPatients(); _vcPatients = r?.items || (Array.isArray(r) ? r : []); } catch { _vcPatients = []; }

  if (!_vcInboxPid && _vcPatients.length) _vcInboxPid = _vcPatients[0]?.id || null;
  if (_vcInboxPid) {
    try { const r = await api.getPatientMessages(_vcInboxPid); _vcInboxMsgs = Array.isArray(r) ? r : (r?.items || []); } catch { _vcInboxMsgs = []; }
  }

  _vcRender();
}

function _vcRender() {
  const el = document.getElementById('content');
  if (!el) return;
  const e = _vcEsc;

  const todayVisits = VC_MOCK.videoVisits.filter(v => v.status === 'scheduled').length;
  const callReqs    = VC_MOCK.callRequests.length;
  const urgMedia    = VC_MOCK.sharedMedia.filter(m => m.urgency === 'urgent' && !m.reviewed).length;
  const awMedia     = VC_MOCK.sharedMedia.filter(m => !m.reviewed).length;
  const pendNotes   = VC_MOCK.aiNotes.filter(n => n.status !== 'signed').length;
  const threads     = _vcPatients.length;

  const TABS = [
    { id:'inbox',         label:'Inbox',        count:threads },
    { id:'call-requests', label:'Call Requests', count:callReqs,   attn:callReqs > 0 },
    { id:'video-visits',  label:'Video Visits',  count:todayVisits },
    { id:'voice-calls',   label:'Voice Calls',   count:null },
    { id:'shared-media',  label:'Shared Media',  count:awMedia,    attn:urgMedia > 0 },
    { id:'ai-notes',      label:'AI Notes',      count:pendNotes,  ai:true },
  ];

  let body = '';
  if      (_vcTab === 'inbox')         body = _vcInboxHTML();
  else if (_vcTab === 'call-requests') body = _vcCallReqHTML();
  else if (_vcTab === 'video-visits')  body = _vcConsultHTML('video');
  else if (_vcTab === 'voice-calls')   body = _vcConsultHTML('voice');
  else if (_vcTab === 'shared-media')  body = _vcMediaHTML();
  else if (_vcTab === 'ai-notes')      body = _vcAiNotesHTML();

  el.innerHTML = `
<div class="vc-wrap">
  <div class="vc-summary-strip">
    <button class="vc-chip vc-chip--video" onclick="window._vcSetTab('video-visits')">
      <span class="vc-chip-n">${todayVisits}</span>
      <span class="vc-chip-lbl">&#9654; Scheduled Visits</span>
    </button>
    <button class="vc-chip${callReqs ? ' vc-chip--attn' : ' vc-chip--voice'}" onclick="window._vcSetTab('call-requests')">
      <span class="vc-chip-n">${callReqs}</span>
      <span class="vc-chip-lbl">&#9742; Call Requests</span>
    </button>
    <button class="vc-chip vc-chip--threads" onclick="window._vcSetTab('inbox')">
      <span class="vc-chip-n">${threads}</span>
      <span class="vc-chip-lbl">&#9993; Patient Threads</span>
    </button>
    <button class="vc-chip${urgMedia ? ' vc-chip--urgent' : ' vc-chip--media'}" onclick="window._vcSetTab('shared-media')">
      <span class="vc-chip-n">${awMedia}</span>
      <span class="vc-chip-lbl">&#9650; Awaiting Review</span>
    </button>
    <button class="vc-chip vc-chip--ai" onclick="window._vcSetTab('ai-notes')">
      <span class="vc-chip-n">${pendNotes}</span>
      <span class="vc-chip-lbl">&#9210; AI Notes Pending</span>
    </button>
  </div>

  <div class="vc-action-bar">
    <span class="vc-action-bar-label">Quick Actions</span>
    <button class="vc-act vc-act--video"   onclick="window._vcStartVideoVisit(null)">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>
      Start Video Visit
    </button>
    <button class="vc-act vc-act--voice"   onclick="window._vcStartVoiceCall(null)">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
      Start Voice Call
    </button>
    <button class="vc-act vc-act--msg"     onclick="window._vcSendMessage(null)">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
      New Message
    </button>
    <button class="vc-act vc-act--note"    onclick="window._vcRecordNote()">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>
      Record Note
    </button>
  </div>

  <div class="vc-tabs" role="tablist">
    ${TABS.map(t => `<button class="vc-tab${_vcTab===t.id?' active':''}${t.attn?' vc-tab--attn':''}${t.ai?' vc-tab--ai':''}"
        role="tab" aria-selected="${_vcTab===t.id}" onclick="window._vcSetTab('${e(t.id)}')"
        >${e(t.label)}${t.count!=null?`<span class="vc-tab-badge">${t.count}</span>`:''}</button>`).join('')}
  </div>

  <div class="vc-content" id="vc-tab-content">${body}</div>
</div>`;

  if (_vcTab === 'inbox') setTimeout(() => {
    const t = document.getElementById('vc-thread'); if (t) t.scrollTop = t.scrollHeight;
  }, 50);
}

// ── Patient context header (reused across tabs) ───────────────────────────────
function _vcCtxHdr(item) {
  const e = _vcEsc;
  const isUrgent = item.urgency === 'urgent';
  return `
<div class="vc-ctx-hdr">
  <div class="vc-ctx-av${isUrgent?' vc-ctx-av--urgent':''}">${e(item.initials||'?')}</div>
  <div class="vc-ctx-info">
    <div class="vc-ctx-name">${e(item.patientName||'')}</div>
    <div class="vc-ctx-meta">${e(item.condition||'')}${item.modality?` &middot; ${e(item.modality)}`:''}${item.courseRef?` &middot; ${e(item.courseRef)}`:''}</div>
    ${item.sessionRef?`<div class="vc-ctx-meta">${e(item.sessionRef)}</div>`:''}
  </div>
  <div class="vc-ctx-acts">
    <button class="vc-ctx-btn" onclick="window._nav('patients')">Open Chart</button>
    <button class="vc-ctx-btn vc-ctx-btn--vid" onclick="window._vcStartVideoVisit('${e(item.patientId)}')">&#9654; Video</button>
  </div>
</div>`;
}

// ── INBOX TAB ─────────────────────────────────────────────────────────────────
function _vcInboxHTML() {
  const e = _vcEsc;
  const selPt = _vcPatients.find(p => p.id === _vcInboxPid);

  const listHTML = `
    <div class="vc-list-filter">
      <input id="vc-inbox-q" type="text" class="vc-search" placeholder="Search patients\u2026"
             oninput="window._vcFilterInbox(this.value)">
    </div>
    <div id="vc-inbox-list">
      ${_vcPatients.length === 0
        ? '<div class="vc-list-empty">No patients found</div>'
        : _vcPatients.map(p => {
            const name = (`${p.first_name||''} ${p.last_name||''}`).trim() || 'Unknown';
            const av   = name.split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
            const isSel = p.id === _vcInboxPid;
            return `<div class="vc-list-item${isSel?' selected':''}" onclick="window._vcInboxSel('${e(p.id)}')">
              <div class="vc-av">${av}</div>
              <div class="vc-li-body">
                <div class="vc-li-name">${e(name)}</div>
                <div class="vc-li-sub">${e(p.primary_condition||'Patient')}</div>
              </div>
            </div>`;
          }).join('')}
    </div>`;

  let detail = '';
  if (!selPt) {
    detail = '<div class="vc-detail-ph">Select a patient to view their thread</div>';
  } else {
    const name = (`${selPt.first_name||''} ${selPt.last_name||''}`).trim();
    const av   = name.split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
    detail = `
      <div class="vc-ctx-hdr">
        <div class="vc-ctx-av">${av}</div>
        <div class="vc-ctx-info">
          <div class="vc-ctx-name">${e(name)}</div>
          <div class="vc-ctx-meta">${e(selPt.primary_condition||'Patient')}</div>
        </div>
        <div class="vc-ctx-acts">
          <button class="vc-ctx-btn" onclick="window._nav('patients')">Open Chart</button>
          <button class="vc-ctx-btn vc-ctx-btn--vid" onclick="window._vcStartVideoVisit('${e(selPt.id)}')">&#9654; Video</button>
          <button class="vc-ctx-btn" onclick="window._vcStartVoiceCall('${e(selPt.id)}')">&#9742; Call</button>
        </div>
      </div>
      <div class="vc-thread" id="vc-thread">
        ${_vcInboxMsgs.length === 0
          ? '<div class="vc-thread-ph">No messages yet. Start the conversation below.</div>'
          : _vcInboxMsgs.map(m => {
              const out = m.sender_role !== 'patient';
              const ts  = m.created_at ? new Date(m.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : '';
              return `<div class="vc-msg${out?' vc-msg--out':''}">
                <div class="vc-msg-bub">${e(m.body||m.message||m.content||'')}</div>
                <div class="vc-msg-meta">${ts}${out?' &middot; Sent \u2713':''}</div>
              </div>`;
            }).join('')}
      </div>
      <div class="vc-reply-bar">
        <textarea id="vc-reply-ta" class="vc-reply-ta" rows="2"
          placeholder="Reply to ${e(name)}\u2026"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window._vcSendReply('${e(selPt.id)}')}"></textarea>
        <div class="vc-reply-acts">
          <button class="vc-reply-send" onclick="window._vcSendReply('${e(selPt.id)}')">Send &#9658;</button>
          <button class="vc-reply-act" onclick="window._vcStartVideoVisit('${e(selPt.id)}')">&#9654;</button>
          <button class="vc-reply-act" onclick="window._vcStartVoiceCall('${e(selPt.id)}')">&#9742;</button>
          <button class="vc-reply-act" onclick="window._vcRecordNote()">&#9210;</button>
        </div>
      </div>`;
  }

  return `<div class="vc-split"><div class="vc-list">${listHTML}</div><div class="vc-detail">${detail}</div></div>`;
}

// ── CALL REQUESTS TAB ─────────────────────────────────────────────────────────
function _vcCallReqHTML() {
  const e = _vcEsc;
  const reqs = VC_MOCK.callRequests;
  if (!_vcSelCR && reqs.length) _vcSelCR = reqs[0].id;
  const sel = reqs.find(r => r.id === _vcSelCR);

  const list = reqs.map(r => {
    const urg = r.urgency === 'urgent';
    return `<div class="vc-list-item${r.id===_vcSelCR?' selected':''}${urg?' vc-li--urgent':''}"
              onclick="window._vcSelCR('${e(r.id)}')">
      <div class="vc-av${urg?' vc-av--urgent':''}">${e(r.initials)}</div>
      <div class="vc-li-body">
        <div class="vc-li-name">${e(r.patientName)}</div>
        <div class="vc-li-sub">${r.type==='video'?'&#9654;':'&#9742;'} ${r.type==='video'?'Video':'Voice'} &middot; ${e(r.preferredTime)}</div>
        <div class="vc-li-preview">${e(r.reason)}</div>
      </div>
      ${urg?'<span class="vc-dot-urgent"></span>':''}
    </div>`;
  }).join('') || '<div class="vc-list-empty">No pending call requests</div>';

  let detail = sel ? `
    ${_vcCtxHdr(sel)}
    <div class="vc-detail-section">
      <div class="vc-ds-title">Call Request Details</div>
      <div class="vc-field-grid">
        <div class="vc-field"><span class="vc-fl">Type</span><span class="vc-fv">${sel.type==='video'?'&#9654; Video visit':'&#9742; Voice call'}</span></div>
        <div class="vc-field"><span class="vc-fl">Preferred time</span><span class="vc-fv">${e(sel.preferredTime)}</span></div>
        <div class="vc-field"><span class="vc-fl">Requested</span><span class="vc-fv">${_vcRelTime(sel.requestedAt)}</span></div>
        <div class="vc-field"><span class="vc-fl">Urgency</span><span class="vc-fv">${_vcUrgencyBadge(sel.urgency)}</span></div>
      </div>
      <div class="vc-reason-block">
        <div class="vc-fl">Reason for call</div>
        <div class="vc-reason-text">${e(sel.reason)}</div>
      </div>
    </div>
    <div class="vc-action-row">
      <button class="vc-ar-primary" onclick="window._vcStartCall('${e(sel.id)}','${e(sel.type)}')">${sel.type==='video'?'&#9654; Start Video Visit':'&#9742; Start Voice Call'}</button>
      <button class="vc-ar-sec" onclick="window._vcScheduleReq('${e(sel.id)}')">&#128197;&ensp;Schedule</button>
      <button class="vc-ar-sec" onclick="window._vcReplyReq('${e(sel.patientId)}')">&#9993;&ensp;Reply</button>
      <button class="vc-ar-ghost" onclick="window._vcDismissCR('${e(sel.id)}')">Mark Reviewed</button>
    </div>` : '<div class="vc-detail-ph">No call requests at this time</div>';

  return `<div class="vc-split"><div class="vc-list">${list}</div><div class="vc-detail">${detail}</div></div>`;
}

// ── VIDEO VISITS + VOICE CALLS TAB ────────────────────────────────────────────
function _vcConsultHTML(type) {
  const e = _vcEsc;
  const items = type === 'video' ? VC_MOCK.videoVisits : VC_MOCK.voiceCalls;
  // Use module-level state variables (not window[stateKey] — ES module vars ≠ window properties)
  if (type === 'video') { if (!_vcSelVisit && items.length) _vcSelVisit = items[0].id; }
  else                  { if (!_vcSelCall  && items.length) _vcSelCall  = items[0].id; }
  const selId = type === 'video' ? _vcSelVisit : _vcSelCall;
  const sel = items.find(v => v.id === selId);

  const list = items.map(v => {
    const timeStr = v.scheduledAt ? new Date(v.scheduledAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : '';
    const dateStr = v.scheduledAt ? new Date(v.scheduledAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '';
    return `<div class="vc-list-item${v.id===selId?' selected':''}"
              onclick="window._vcSelConsult('${e(type)}','${e(v.id)}')">
      <div class="vc-av">${e(v.initials)}</div>
      <div class="vc-li-body">
        <div class="vc-li-name">${e(v.patientName)}</div>
        <div class="vc-li-sub">${dateStr} ${timeStr} &middot; ${v.duration}min</div>
        <div class="vc-li-preview">${e(v.purpose)}</div>
      </div>
      ${_vcStatusBadge(v.status)}
    </div>`;
  }).join('') || `<div class="vc-list-empty">No ${type === 'video' ? 'video visits' : 'voice calls'} on record</div>`;

  let detail = '<div class="vc-detail-ph">Select a consultation to view details</div>';
  if (sel) {
    const timeStr = sel.scheduledAt ? new Date(sel.scheduledAt).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
    const canStart = sel.status === 'scheduled' || sel.status === 'in-progress';
    detail = `
      ${_vcCtxHdr(sel)}
      <div class="vc-detail-section">
        <div class="vc-ds-title">${type==='video'?'Video Visit':'Voice Call'} Details</div>
        <div class="vc-field-grid">
          <div class="vc-field"><span class="vc-fl">Status</span><span class="vc-fv">${_vcStatusBadge(sel.status)}</span></div>
          <div class="vc-field"><span class="vc-fl">Scheduled</span><span class="vc-fv">${e(timeStr)}</span></div>
          <div class="vc-field"><span class="vc-fl">Duration</span><span class="vc-fv">${sel.duration} min</span></div>
          <div class="vc-field"><span class="vc-fl">Notes</span><span class="vc-fv">${_vcStatusBadge(sel.notesStatus||'pending')}</span></div>
        </div>
        <div class="vc-reason-block">
          <div class="vc-fl">Purpose</div>
          <div class="vc-reason-text">${e(sel.purpose)}</div>
        </div>
      </div>
      <div class="vc-action-row">
        ${canStart
          ? `<button class="vc-ar-primary" onclick="window._vcLaunchConsult('${e(type)}','${e(sel.id)}')">${type==='video'?'&#9654; Join Video Visit':'&#9742; Join Voice Call'}</button>`
          : `<button class="vc-ar-primary" onclick="window._vcRecordNote()">&#9210;&ensp;Add Visit Note</button>`}
        <button class="vc-ar-sec" onclick="window._vcRecordNote()">&#9210;&ensp;Record Note</button>
        <button class="vc-ar-sec" onclick="window._vcScheduleFollowUp('${e(sel.patientId)}')">&#128197;&ensp;Schedule Follow-up</button>
        ${sel.status === 'missed' ? `<button class="vc-ar-sec" onclick="window._vcReplyReq('${e(sel.patientId)}')">&#9993;&ensp;Contact Patient</button>` : ''}
        <button class="vc-ar-ghost" onclick="window._vcMarkFollowUpDone('${e(sel.id)}')">Mark Reviewed</button>
      </div>`;
  }

  return `<div class="vc-split"><div class="vc-list">${list}</div><div class="vc-detail">${detail}</div></div>`;
}

// ── SHARED MEDIA TAB ──────────────────────────────────────────────────────────
function _vcMediaHTML() {
  const e = _vcEsc;
  const items = VC_MOCK.sharedMedia;
  if (!_vcSelMedia && items.length) _vcSelMedia = items[0].id;
  const sel = items.find(m => m.id === _vcSelMedia);

  const TYPE_ICON = { 'voice-note':'&#9654;', 'video-update':'&#9654;', 'text-update':'&#9993;', 'symptom-update':'&#9650;', 'device-issue':'&#9670;' };
  const TYPE_LABEL = { 'voice-note':'Voice note', 'video-update':'Video update', 'text-update':'Text update', 'symptom-update':'Symptom update', 'device-issue':'Device issue' };

  const list = items.map(m => {
    const urg = m.urgency === 'urgent';
    const icon = TYPE_ICON[m.type] || '&#9643;';
    return `<div class="vc-list-item${m.id===_vcSelMedia?' selected':''}${urg?' vc-li--urgent':''}"
              onclick="window._vcSelMedia('${e(m.id)}')">
      <div class="vc-av${urg?' vc-av--urgent':''}${m.reviewed?' vc-av--muted':''}">${e(m.initials)}</div>
      <div class="vc-li-body">
        <div class="vc-li-name">${e(m.patientName)} ${m.reviewed?'<span class="vc-reviewed-tag">Reviewed</span>':''}</div>
        <div class="vc-li-sub">${icon} ${TYPE_LABEL[m.type]||m.type} &middot; ${_vcRelTime(m.submittedAt)}</div>
        <div class="vc-li-preview">${e(m.subject)}</div>
      </div>
      ${urg&&!m.reviewed?'<span class="vc-dot-urgent"></span>':''}
    </div>`;
  }).join('') || '<div class="vc-list-empty">No shared media to review</div>';

  let detail = '<div class="vc-detail-ph">Select an item to review it</div>';
  if (sel) {
    const hasAudio = sel.type === 'voice-note';
    const hasVideo = sel.type === 'video-update';
    detail = `
      ${_vcCtxHdr(sel)}
      <div class="vc-detail-section">
        <div class="vc-ds-title">Patient Update <span style="font-weight:400;font-size:.8rem">&middot; ${e(TYPE_LABEL[sel.type]||sel.type)}</span></div>
        <div class="vc-field-grid">
          <div class="vc-field"><span class="vc-fl">Reason</span><span class="vc-fv">${e(sel.reason)}</span></div>
          <div class="vc-field"><span class="vc-fl">Severity</span><span class="vc-fv">${e(sel.severity)}</span></div>
          <div class="vc-field"><span class="vc-fl">Trend</span><span class="vc-fv">${e(sel.trend)}</span></div>
          <div class="vc-field"><span class="vc-fl">Session</span><span class="vc-fv">${e(sel.sessionRef||'\u2014')}</span></div>
          <div class="vc-field"><span class="vc-fl">Submitted</span><span class="vc-fv">${_vcRelTime(sel.submittedAt)}</span></div>
          <div class="vc-field"><span class="vc-fl">Urgency</span><span class="vc-fv">${_vcUrgencyBadge(sel.urgency)}</span></div>
        </div>
        ${hasAudio||hasVideo ? `<div class="vc-media-player">
          <div class="vc-mp-icon">${hasVideo?'&#9654;':'&#9654;'}</div>
          <div class="vc-mp-info">
            <div class="vc-mp-label">${e(sel.subject)}</div>
            <div class="vc-mp-sub">${e(sel.duration||'')} &middot; Patient-recorded</div>
          </div>
          <button class="vc-mp-play" onclick="window._showNotifToast&&window._showNotifToast({title:'Media Player',body:'Media playback will be available when patient media upload is enabled.',severity:'info'})">&#9654; Play</button>
        </div>` : `<div class="vc-text-update-body">${e(sel.subject)}</div>`}
      </div>
      ${sel.aiSummary ? `<div class="vc-ai-panel">
        <div class="vc-ai-header"><span class="vc-ai-label">AI Summary</span><span class="vc-ai-note">Review before acting &middot; Not a clinical recommendation</span></div>
        <div class="vc-ai-body">${e(sel.aiSummary)}</div>
      </div>` : ''}
      <div class="vc-action-row">
        <button class="vc-ar-primary" onclick="window._vcStartVideoVisit('${e(sel.patientId)}')">&#9654; Video Visit</button>
        <button class="vc-ar-sec" onclick="window._vcSendMessage('${e(sel.patientId)}')">&#9993;&ensp;Reply</button>
        <button class="vc-ar-sec" onclick="window._vcConvertToNote('${e(sel.id)}')">&#9210;&ensp;Create Note</button>
        <button class="vc-ar-sec" onclick="window._vcFlagAdverse('${e(sel.id)}')">&#9650;&ensp;Flag Adverse Event</button>
        <button class="vc-ar-ghost" onclick="window._vcMarkMediaReviewed('${e(sel.id)}')">${sel.reviewed?'Reviewed \u2713':'Mark Reviewed'}</button>
      </div>`;
  }

  return `<div class="vc-split"><div class="vc-list">${list}</div><div class="vc-detail">${detail}</div></div>`;
}

// ── AI NOTES TAB ──────────────────────────────────────────────────────────────
function _vcAiNotesHTML() {
  const e = _vcEsc;
  const notes = VC_MOCK.aiNotes;
  if (!_vcSelNote && notes.length) _vcSelNote = notes[0].id;
  const sel = notes.find(n => n.id === _vcSelNote);

  const TYPE_ICON  = { 'voice-note':'&#9654;', 'video-note':'&#9654;', 'text-note':'&#9210;', 'transcription':'&#9210;' };
  const TYPE_LABEL = { 'voice-note':'Voice note', 'video-note':'Video note', 'text-note':'Text note', 'transcription':'Transcription' };

  const list = notes.map(n => {
    const pending = n.status !== 'signed';
    return `<div class="vc-list-item${n.id===_vcSelNote?' selected':''}${pending?' vc-li--pending':''}"
              onclick="window._vcSelNote('${e(n.id)}')">
      <div class="vc-av vc-av--ai">${e(n.initials)}</div>
      <div class="vc-li-body">
        <div class="vc-li-name">${e(n.patientName)}</div>
        <div class="vc-li-sub">${TYPE_ICON[n.type]||'&#9210;'} ${TYPE_LABEL[n.type]||n.type} &middot; ${_vcRelTime(n.recordedAt)}</div>
        <div class="vc-li-preview">${e(n.subject)}</div>
      </div>
      ${_vcStatusBadge(n.status)}
    </div>`;
  }).join('') || '<div class="vc-list-empty">No AI notes on record</div>';

  let detail = '<div class="vc-detail-ph">Select a note to review it</div>';
  if (sel) {
    detail = `
      ${_vcCtxHdr(sel)}
      <div class="vc-detail-section">
        <div class="vc-ds-title">${e(sel.subject)} ${_vcStatusBadge(sel.status)}</div>
        <div class="vc-field-grid">
          <div class="vc-field"><span class="vc-fl">Type</span><span class="vc-fv">${e(TYPE_LABEL[sel.type]||sel.type)}</span></div>
          <div class="vc-field"><span class="vc-fl">Recorded</span><span class="vc-fv">${_vcRelTime(sel.recordedAt)}</span></div>
        </div>
        <div class="vc-note-block">
          <div class="vc-fl" style="margin-bottom:6px">Transcription</div>
          <div class="vc-note-text" id="vc-note-trans-${e(sel.id)}" contenteditable="${sel.status!=='signed'}" spellcheck="true">${e(sel.transcription)}</div>
        </div>
      </div>
      <div class="vc-ai-panel">
        <div class="vc-ai-header"><span class="vc-ai-label">AI Draft Summary</span><span class="vc-ai-note">Review before saving &middot; Clinician sign-off required</span></div>
        <div class="vc-ai-body" id="vc-note-ai-${e(sel.id)}" contenteditable="${sel.status!=='signed'}" spellcheck="true">${e(sel.aiSummary)}</div>
      </div>
      <div class="vc-action-row">
        ${sel.status !== 'signed' ? `
          <button class="vc-ar-primary" onclick="window._vcSignOff('${e(sel.id)}')">&#10003;&ensp;Sign Off Note</button>
          <button class="vc-ar-sec" onclick="window._vcSaveNoteDraft('${e(sel.id)}')">Save Draft</button>
        ` : '<span class="vc-signed-tag">&#10003; Signed &amp; saved</span>'}
        <button class="vc-ar-sec" onclick="window._vcConvertNoteAction('${e(sel.id)}')">Convert to Follow-up</button>
        <button class="vc-ar-sec" onclick="window._vcStartVideoVisit('${e(sel.patientId)}')">&#9654; Video Visit</button>
        ${sel.status !== 'signed' ? `<button class="vc-ar-ghost" onclick="window._vcDiscardNote('${e(sel.id)}')">Discard Draft</button>` : ''}
      </div>`;
  }

  return `<div class="vc-split"><div class="vc-list">${list}</div><div class="vc-detail">${detail}</div></div>`;
}

// ── HANDLERS ──────────────────────────────────────────────────────────────────
window._vcSetTab = function(tab) { _vcTab = tab; _vcRender(); };

window._vcFilterInbox = function(q) {
  document.querySelectorAll('#vc-inbox-list .vc-list-item').forEach(el => {
    el.style.display = el.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
  });
};

window._vcInboxSel = async function(pid) {
  _vcInboxPid = pid;
  try { const r = await api.getPatientMessages(pid); _vcInboxMsgs = Array.isArray(r) ? r : (r?.items||[]); } catch { _vcInboxMsgs = []; }
  _vcRender();
};

window._vcSendReply = async function(pid) {
  const ta  = document.getElementById('vc-reply-ta');
  const msg = ta?.value?.trim();
  if (!msg || !pid) return;
  ta.value = '';
  ta.disabled = true;
  try {
    await api.sendPatientMessage(pid, msg);
    const t = document.getElementById('vc-thread');
    if (t) {
      const d = document.createElement('div');
      d.className = 'vc-msg vc-msg--out';
      d.innerHTML = `<div class="vc-msg-bub">${_vcEsc(msg)}</div><div class="vc-msg-meta">${new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})} &middot; Sending\u2026</div>`;
      t.appendChild(d); t.scrollTop = t.scrollHeight;
    }
  } catch {
    ta.value = msg;
    window._showNotifToast?.({title:'Send failed',body:'Message could not be sent. Please try again.',severity:'error'});
  } finally { ta.disabled = false; if (ta) ta.focus(); }
};

window._vcSelCR = function(id) { _vcSelCR = id; _vcRender(); };

window._vcSelConsult = function(type, id) {
  if (type === 'video') _vcSelVisit = id; else _vcSelCall = id;
  _vcRender();
};

window._vcSelMedia = function(id) { _vcSelMedia = id; _vcRender(); };
window._vcSelNote  = function(id) { _vcSelNote  = id; _vcRender(); };

function _vcToast(title, body, severity) {
  window._showNotifToast?.({ title, body, severity: severity||'info' });
}

window._vcStartVideoVisit = function(pid) {
  _vcToast('Start Video Visit', 'Connect your video provider (Zoom, Teams, or telehealth platform) to launch visits directly from this page.', 'info');
};
window._vcStartVoiceCall = function(pid) {
  _vcToast('Start Voice Call', 'Connect your telephony provider to launch calls directly from this page.', 'info');
};
window._vcSendMessage = function(pid) {
  _vcTab = 'inbox';
  if (pid) _vcInboxPid = pid;
  _vcRender();
  setTimeout(() => { document.getElementById('vc-reply-ta')?.focus(); }, 80);
};
window._vcRecordNote = function() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `<div class="modal-card" style="max-width:560px;width:100%">
    <h3 style="margin-bottom:4px">Record Note</h3>
    <p style="font-size:.82rem;color:var(--text-secondary);margin-bottom:16px">AI will transcribe and draft a summary. Review before saving.</p>
    <label class="form-label">Note type</label>
    <select id="vc-note-type" class="form-control" style="margin-bottom:12px">
      <option value="text-note">Text note</option>
      <option value="voice-note">Voice note (transcription)</option>
      <option value="video-note">Video note (transcription)</option>
    </select>
    <label class="form-label">Subject</label>
    <input id="vc-note-subj" class="form-control" type="text" placeholder="e.g. Session 10 observation" style="margin-bottom:12px">
    <label class="form-label">Note content</label>
    <textarea id="vc-note-body" class="form-control" rows="5" placeholder="Dictate or type your observation here\u2026" style="margin-bottom:12px"></textarea>
    <div class="vc-ai-panel" style="margin-bottom:16px">
      <div class="vc-ai-header"><span class="vc-ai-label">AI Draft</span><span class="vc-ai-note">Will be generated on save &middot; Review before signing off</span></div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      <button class="btn-primary" onclick="window._vcSaveRecordedNote()">Save Note</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
};
window._vcSaveRecordedNote = function() {
  const subj = document.getElementById('vc-note-subj')?.value?.trim();
  const body = document.getElementById('vc-note-body')?.value?.trim();
  if (!body) { _dsToast('Please enter note content before saving.', 'warn'); return; }
  document.querySelector('.modal-overlay')?.remove();
  _vcToast('Note Saved', `"${subj||'Note'}" saved as draft. AI summary will be generated shortly.`, 'success');
};
window._vcStartCall = function(reqId, type) {
  _vcToast(`Start ${type==='video'?'Video Visit':'Voice Call'}`, 'Connect your video/telephony provider to launch calls from this page.', 'info');
};
window._vcScheduleReq = function(reqId) {
  _vcToast('Schedule Call', 'Open the Scheduling page to book a time slot for this patient.', 'info');
};
window._vcReplyReq = function(pid) { window._vcSendMessage(pid); };
window._vcDismissCR = function(id) {
  const idx = VC_MOCK.callRequests.findIndex(r => r.id === id);
  if (idx >= 0) VC_MOCK.callRequests.splice(idx, 1);
  _vcSelCR = null; _vcRender();
};
window._vcLaunchConsult = function(type, id) {
  _vcToast(`Join ${type==='video'?'Video Visit':'Voice Call'}`, 'Connect your telehealth provider to launch consultations from this page.', 'info');
};
window._vcScheduleFollowUp = function(pid) {
  _vcToast('Schedule Follow-up', 'Open the Scheduling page to book a follow-up session for this patient.', 'info');
};
window._vcMarkFollowUpDone = function(id) { _vcRender(); _vcToast('Marked', 'Item marked as reviewed.', 'success'); };
window._vcMarkMediaReviewed = function(id) {
  const item = VC_MOCK.sharedMedia.find(m => m.id === id);
  if (item) item.reviewed = true;
  _vcRender();
};
window._vcConvertToNote = function(id) {
  _vcToast('Note Created', 'A draft note has been created from this update. Open AI Notes to review and sign off.', 'success');
};
window._vcFlagAdverse = function(id) {
  _vcToast('Adverse Event Flagged', 'This update has been flagged for adverse event review. Add it to the patient\'s clinical record.', 'warning');
};
window._vcSignOff = function(id) {
  const note = VC_MOCK.aiNotes.find(n => n.id === id);
  if (note) note.status = 'signed';
  _vcRender(); _vcToast('Note Signed', 'Note signed off and saved to the clinical record.', 'success');
};
window._vcSaveNoteDraft = function(id) { _vcToast('Draft Saved', 'Note draft saved. You can return to sign off later.', 'success'); };
window._vcConvertNoteAction = function(id) { _vcToast('Follow-up Created', 'A follow-up task has been added to the patient\'s care plan.', 'success'); };
window._vcDiscardNote = function(id) {
  const idx = VC_MOCK.aiNotes.findIndex(n => n.id === id);
  if (idx >= 0) VC_MOCK.aiNotes.splice(idx, 1);
  _vcSelNote = null; _vcRender();
};

// Keep bulk message + template helpers from old messaging page
window._msgSelectPatient  = async function(pid) { _vcInboxPid = pid; await window._vcInboxSel(pid); };
window._filterMsgPatients = window._vcFilterInbox;


// Protocol Builder
// ─────────────────────────────────────────────────────────────────────────────

const BLOCK_PALETTE = {
  modality: [
    { type: 'neurofeedback', label: 'Neurofeedback', icon: '🧠', color: '#00d4bc',
      params: { protocol: 'Alpha/Theta', frequency_band: 'Alpha (8-12Hz)', sites: 'Cz', session_duration: 30 } },
    { type: 'tms', label: 'rTMS', icon: '⚡', color: '#3b82f6',
      params: { frequency_hz: 10, intensity_pct_mt: 110, pulses: 3000, coil_position: 'DLPFC Left' } },
    { type: 'tdcs', label: 'tDCS', icon: '🔋', color: '#8b5cf6',
      params: { current_ma: 2.0, duration_min: 20, anode: 'F3', cathode: 'Fp2' } },
    { type: 'tavns', label: 'taVNS', icon: '🌊', color: '#f59e0b',
      params: { frequency_hz: 25, pulse_width_us: 250, current_ma: 0.5, duration_min: 30 } },
    { type: 'ces', label: 'CES', icon: '💫', color: '#ec4899',
      params: { frequency_hz: 0.5, current_ma: 1.0, duration_min: 20 } },
  ],
  parameter: [
    { type: 'frequency', label: 'Frequency',    icon: '〰️', color: '#64748b', params: { value_hz: 10, waveform: 'sine' } },
    { type: 'amplitude', label: 'Amplitude',    icon: '📶', color: '#64748b', params: { value: 1.0, unit: 'mA' } },
    { type: 'duration',  label: 'Duration',     icon: '⏱️', color: '#64748b', params: { value_min: 20 } },
    { type: 'rest',      label: 'Rest Period',  icon: '⏸️', color: '#64748b', params: { duration_min: 5 } },
    { type: 'repeat',    label: 'Repeat Block', icon: '🔄', color: '#64748b', params: { times: 3, interval_days: 2 } },
  ],
};

// Module-level builder state (reset on each pgProtocolBuilder call)
let _builderNodes = [];
let _builderEdges = [];
let _selectedNode = null;
let _draggingNode = null;
let _dragOffset = { x: 0, y: 0 };

function _rerenderSVG() {
  const svg = document.getElementById('builder-svg');
  if (!svg) return;
  const paths = _builderEdges.map(edge => {
    const fn = _builderNodes.find(n => n.id === edge.from);
    const tn = _builderNodes.find(n => n.id === edge.to);
    if (!fn || !tn) return '';
    const x1 = fn.x + 160, y1 = fn.y + 40, x2 = tn.x, y2 = tn.y + 40, mx = (x1 + x2) / 2;
    return `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" stroke="var(--teal,#00d4bc)" stroke-width="2" fill="none" marker-end="url(#arrowhead)"/>`;
  }).join('');
  svg.innerHTML = `<defs><marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="var(--teal,#00d4bc)"/></marker></defs>${paths}`;
}

function _renderBuilderCanvas() {
  const svgPaths = _builderEdges.map(edge => {
    const fn = _builderNodes.find(n => n.id === edge.from);
    const tn = _builderNodes.find(n => n.id === edge.to);
    if (!fn || !tn) return '';
    const x1 = fn.x + 160, y1 = fn.y + 40, x2 = tn.x, y2 = tn.y + 40, mx = (x1 + x2) / 2;
    return `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" stroke="var(--teal,#00d4bc)" stroke-width="2" fill="none" marker-end="url(#arrowhead)"/>`;
  }).join('');
  const nodesHtml = _builderNodes.map(node => {
    const isSel = _selectedNode?.id === node.id;
    const pe = Object.entries(node.params).slice(0, 3)
      .map(([k, v]) => `<div style="font-size:0.7rem;color:var(--text-secondary)">${k.replace(/_/g, ' ')}: <strong>${v}</strong></div>`)
      .join('');
    return `<div class="builder-node${isSel ? ' selected' : ''}" data-node-id="${node.id}"
        style="left:${node.x}px;top:${node.y}px;border-color:${node.color}"
        onclick="window._builderSelectNode('${node.id}')"
        onmousedown="window._builderStartDrag(event,'${node.id}')">
      <div class="builder-node-header" style="background:${node.color}20;border-bottom:1px solid ${node.color}40">
        <span>${node.icon}</span>
        <span style="font-size:0.8rem;font-weight:600">${node.label}</span>
        <button onclick="event.stopPropagation();window._builderDeleteNode('${node.id}')"
          style="margin-left:auto;background:none;border:none;color:rgba(255,255,255,0.5);cursor:pointer;font-size:0.7rem">✕</button>
      </div>
      <div class="builder-node-params">${pe}</div>
      <div class="builder-node-connectors">
        <div class="connector-in" onclick="event.stopPropagation();window._builderConnectTo('${node.id}')" title="Connect here (in)"></div>
        <div class="connector-out" onclick="event.stopPropagation();window._builderStartConnect('${node.id}')" title="Start connection (out)"></div>
      </div>
    </div>`;
  }).join('');
  const empty = _builderNodes.length === 0
    ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);font-size:0.9rem;pointer-events:none">Drag blocks from the palette to start building your protocol</div>`
    : '';
  return `<div id="builder-canvas"
      style="position:relative;width:100%;height:520px;background:var(--navy-900,#080d1a);border:1px solid var(--border);border-radius:12px;overflow:hidden"
      ondragover="event.preventDefault()" ondrop="window._builderDropOnCanvas(event)"
      onmousemove="window._builderOnMouseMove(event)" onmouseup="window._builderEndDrag()">
    <svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none" id="builder-svg">
      <defs><marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
        <polygon points="0 0, 8 3, 0 6" fill="var(--teal,#00d4bc)"/></marker></defs>
      ${svgPaths}
    </svg>
    ${nodesHtml}${empty}
  </div>`;
}

function _renderBuilderProps() {
  if (!_selectedNode) {
    return `<div class="ds-card" style="margin-top:12px">
      <p style="color:var(--text-secondary);text-align:center;padding:12px">Click a block to edit its properties</p>
    </div>`;
  }
  const node = _builderNodes.find(n => n.id === _selectedNode.id);
  if (!node) return `<div class="ds-card" style="margin-top:12px">
    <p style="color:var(--text-secondary);text-align:center;padding:12px">Click a block to edit its properties</p>
  </div>`;
  const inputs = Object.entries(node.params).map(([key, val]) => `
    <div>
      <label style="font-size:0.78rem;color:var(--text-secondary);display:block;margin-bottom:4px">${key.replace(/_/g, ' ')}</label>
      <input type="${typeof val === 'number' ? 'number' : 'text'}" value="${val}"
        onchange="window._builderUpdateParam('${node.id}','${key}',this.value)"
        style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input,rgba(255,255,255,0.04));color:var(--text-primary);font-size:0.85rem">
    </div>`).join('');
  return `<div class="ds-card" style="margin-top:12px">
    <h4 style="margin-bottom:14px">${node.icon} ${node.label} Properties</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px">${inputs}</div>
  </div>`;
}

function _renderBuilder() {
  const el = document.getElementById('builder-main');
  if (!el) return;
  el.innerHTML = _renderBuilderCanvas() + _renderBuilderProps();
}

function _renderBuilderPalette() {
  return Object.entries(BLOCK_PALETTE).map(([cat, items]) => {
    const title = cat === 'modality' ? 'Modality Blocks' : 'Parameter Blocks';
    const itemsHtml = items.map(b =>
      `<div class="builder-palette-item" draggable="true" style="border-color:${b.color}40"
          ondragstart="window._builderPaletteDragStart(event,'${b.type}','${cat}')">
        <span>${b.icon}</span><span>${b.label}</span>
      </div>`).join('');
    return `<div style="margin-bottom:16px">
      <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-secondary);margin-bottom:8px">${title}</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">${itemsHtml}</div>
    </div>`;
  }).join('');
}

function _builderGetJSON() {
  return {
    version: '1.0',
    created_at: new Date().toISOString(),
    stages: _builderNodes.map(node => ({
      id: node.id, type: node.type, label: node.label, category: node.category,
      icon: node.icon, color: node.color, params: node.params, x: node.x, y: node.y,
      next: _builderEdges.find(e => e.from === node.id)?.to || null,
    })),
  };
}

export async function pgProtocolBuilder(setTopbar) {
  // Reset module-level state on each page entry
  _builderNodes = [];
  _builderEdges = [];
  _selectedNode = null;
  _draggingNode = null;
  _dragOffset = { x: 0, y: 0 };
  window._connectingFrom = null;

  setTopbar('Visual Protocol Builder',
    `<button class="btn btn-sm" onclick="window._nav('protocols')" style="border-color:var(--teal,#00d4bc);color:var(--teal,#00d4bc)">← Protocol Generator</button>`
  );

  const el = document.getElementById('content');
  el.innerHTML = `
    <div style="padding:20px 24px;max-width:1400px;margin:0 auto">
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
        <button class="btn btn-primary btn-sm" onclick="window._builderSave()">💾 Save</button>
        <button class="btn btn-sm" onclick="window._builderExportJSON()">⬇ Export JSON</button>
        <button class="btn btn-sm" onclick="window._builderImportJSON()">⬆ Import JSON</button>
        <button class="btn btn-sm" style="border-color:var(--teal,#00d4bc);color:var(--teal,#00d4bc)"
          onclick="window._builderUseInWizard()">⚡ Use in Wizard</button>
        <button class="btn btn-ghost btn-sm" onclick="window._builderClear()">✕ Clear</button>
        <button class="btn btn-sm" style="border-color:var(--violet,#9b7fff);color:var(--violet,#9b7fff);margin-left:auto"
          onclick="window._pbAISuggest()">🤖 AI Suggest</button>
        <span style="font-size:0.78rem;color:var(--text-secondary);margin-left:8px" id="builder-status"></span>
      </div>
      <div style="display:grid;grid-template-columns:220px 1fr;gap:16px">
        <div style="background:var(--bg-card,#0e1628);border:1px solid var(--border);border-radius:12px;padding:16px;overflow-y:auto;max-height:540px">
          ${_renderBuilderPalette()}
        </div>
        <div id="builder-main">
          ${_renderBuilderCanvas()}
          ${_renderBuilderProps()}
          <div id="pb-ai-suggest-panel" style="display:none"></div>
        </div>
      </div>
    </div>`;

  // ── AI Suggest ─────────────────────────────────────────────────────────────
  window._pbAISuggest = function() {
    const panel = document.getElementById('pb-ai-suggest-panel');
    if (!panel) return;

    const nodes = _builderNodes;

    if (nodes.length === 0) {
      panel.style.display = '';
      panel.innerHTML = `<div id="pb-ai-suggest-panel" style="">
        <h4>🤖 AI Protocol Suggestion</h4>
        <p style="font-size:12.5px;color:var(--text-secondary)">Add some blocks to the canvas first, then run AI Suggest to get evidence-based recommendations.</p>
      </div>`;
      panel.style.display = '';
      return;
    }

    // Detect modalities present on canvas
    const types = nodes.map(n => n.type);
    const hasTMS = types.some(t => ['tms', 'theta-burst', 'deep-tms'].includes(t));
    const hasNFB = types.some(t => ['neurofeedback', 'eeg-neurofeedback', 'alpha-theta', 'smr-training'].includes(t));
    const hasTDCS = types.some(t => ['tdcs', 'tacs', 'trns'].includes(t));
    const hasHRV = types.some(t => ['hrv-biofeedback', 'biofeedback'].includes(t));
    const hasRest = types.some(t => t === 'rest');
    const hasRepeat = types.some(t => t === 'repeat');

    // Session count recommendation
    let sessionRec = '20–30 sessions recommended for most neuromodulation courses.';
    if (hasTMS) sessionRec = 'TMS: 20–36 sessions standard. Depression protocols typically 5×/week for 4–6 weeks.';
    else if (hasNFB) sessionRec = 'Neurofeedback: 20–40 sessions for durable effect. 2–3×/week is optimal pacing.';
    else if (hasTDCS) sessionRec = 'tDCS: 10–20 sessions typical. 5 consecutive sessions followed by a break period.';
    else if (hasHRV) sessionRec = 'HRV Biofeedback: 8–12 sessions with home practice. 1–2×/week in-clinic.';

    // Evidence-based parameter adjustments
    const paramTips = [];
    if (hasTMS) {
      paramTips.push('Set intensity to 120% motor threshold for left DLPFC protocols. Consider 80–90% MT for anxious patients.');
      paramTips.push('Inter-train interval of ≥2 seconds reduces seizure risk. Verify device default settings match protocol.');
    }
    if (hasNFB) {
      paramTips.push('For ADHD: SMR reward (12–15 Hz) at Cz + theta inhibit (4–8 Hz). Threshold should auto-adjust to keep reward rate 60–70%.');
      paramTips.push('Electrode placement: always use EEG-grade gel for impedance <5 kΩ. Check before each session.');
    }
    if (hasTDCS) {
      paramTips.push('tDCS: ramp current up over 30 seconds to reduce skin sensation. Current density should not exceed 0.06 mA/cm².');
    }
    if (!hasRest && (hasTMS || hasTDCS)) {
      paramTips.push('Consider adding Rest Period blocks between stimulation blocks to reduce fatigue and support consolidation.');
    }
    if (paramTips.length === 0) {
      paramTips.push('No specific parameters flagged. Review your block settings against the protocol specification.');
    }

    // Contraindication warnings
    const warnings = [];
    if (hasTMS && hasNFB) {
      warnings.push('Combining TMS + Neurofeedback in same session: ensure TMS is completed first. EEG cap must be removed during TMS stimulation.');
    }
    if (hasTMS && hasTDCS) {
      warnings.push('Simultaneous TMS + tDCS is experimental. If sequential, allow ≥30 min between modalities. Document patient tolerance carefully.');
    }
    if (hasRepeat && hasTMS) {
      warnings.push('Repeat blocks with TMS: ensure cumulative pulse count per day does not exceed safety limits (typically ≤3000 standard, ≤6000 in published iTBS protocols).');
    }

    // Literature links (rule-based)
    const links = [];
    if (hasTMS) links.push({ text: 'George et al. (2010) — TMS for depression, d=0.55', page: 'evidence' });
    if (hasNFB) links.push({ text: 'Arns et al. (2009) — Neurofeedback for ADHD, d=0.59', page: 'evidence' });
    if (hasTDCS) links.push({ text: 'Brunoni et al. (2017) — tDCS meta-analysis, d=0.37', page: 'evidence' });
    links.push({ text: 'Browse full evidence library →', page: 'evidence' });

    panel.style.display = '';
    panel.innerHTML = `
      <h4>🤖 AI Protocol Suggestion <span style="font-size:11px;font-weight:400;color:var(--text-secondary)">(${nodes.length} block${nodes.length !== 1 ? 's' : ''} analysed)</span></h4>

      <div class="ai-suggest-section">
        <div class="ai-suggest-section-title">Recommended Session Count</div>
        <div class="ai-suggest-item">${sessionRec}</div>
      </div>

      <div class="ai-suggest-section">
        <div class="ai-suggest-section-title">Evidence-Based Parameter Adjustments</div>
        ${paramTips.map(t => `<div class="ai-suggest-item">• ${t}</div>`).join('')}
      </div>

      ${warnings.length > 0 ? `
      <div class="ai-suggest-section">
        <div class="ai-suggest-section-title">Contraindication Warnings</div>
        ${warnings.map(w => `<div class="ai-suggest-warn">⚠ <span>${w}</span></div>`).join('')}
      </div>` : ''}

      <div class="ai-suggest-section">
        <div class="ai-suggest-section-title">Relevant Literature</div>
        ${links.map(l => `<div style="margin-bottom:4px"><span class="ai-suggest-link" onclick="window._nav('${l.page}')">${l.text}</span></div>`).join('')}
      </div>

      <div style="margin-top:12px;display:flex;gap:10px;align-items:center">
        <button class="btn btn-sm" style="border-color:var(--teal,#00d4bc);color:var(--teal,#00d4bc)"
          onclick="window._aiQuick?.('TMS parameters');window._aiToggle?.()">Ask AI Co-pilot</button>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('pb-ai-suggest-panel').style.display='none'">Dismiss</button>
      </div>`;
  };

  // ── Drag from palette ──────────────────────────────────────────────────────
  window._builderPaletteDragStart = function(e, blockType, category) {
    e.dataTransfer.setData('block-type', blockType);
    e.dataTransfer.setData('block-category', category);
    e.dataTransfer.effectAllowed = 'copy';
  };

  window._builderDropOnCanvas = function(e) {
    e.preventDefault();
    const type = e.dataTransfer.getData('block-type');
    const category = e.dataTransfer.getData('block-category');
    if (!type) return;
    const canvas = document.getElementById('builder-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, e.clientX - rect.left - 90);
    const y = Math.max(0, e.clientY - rect.top - 40);
    const tpl = Object.values(BLOCK_PALETTE).flat().find(b => b.type === type);
    if (!tpl) return;
    _builderNodes.push({
      id: `node-${Date.now()}`, type: tpl.type, category,
      label: tpl.label, icon: tpl.icon, color: tpl.color,
      params: { ...tpl.params }, x, y,
    });
    _renderBuilder();
  };

  // ── Node drag on canvas ────────────────────────────────────────────────────
  window._builderStartDrag = function(e, nodeId) {
    if (e.target.classList.contains('connector-in') || e.target.classList.contains('connector-out')) return;
    e.preventDefault();
    _draggingNode = nodeId;
    const node = _builderNodes.find(n => n.id === nodeId);
    if (node) _dragOffset = { x: e.clientX - node.x, y: e.clientY - node.y };
  };

  window._builderOnMouseMove = function(e) {
    if (!_draggingNode) return;
    const canvas = document.getElementById('builder-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const node = _builderNodes.find(n => n.id === _draggingNode);
    if (node) {
      node.x = Math.max(0, Math.min(e.clientX - rect.left - _dragOffset.x, rect.width - 190));
      node.y = Math.max(0, Math.min(e.clientY - rect.top - _dragOffset.y, rect.height - 100));
      const nodeEl = document.querySelector(`[data-node-id="${_draggingNode}"]`);
      if (nodeEl) { nodeEl.style.left = node.x + 'px'; nodeEl.style.top = node.y + 'px'; }
      _rerenderSVG();
    }
  };

  window._builderEndDrag = function() { _draggingNode = null; };

  // ── Node selection / deletion ──────────────────────────────────────────────
  window._builderSelectNode = function(nodeId) {
    _selectedNode = _builderNodes.find(n => n.id === nodeId) || null;
    const mainEl = document.getElementById('builder-main');
    if (mainEl) mainEl.innerHTML = _renderBuilderCanvas() + _renderBuilderProps();
  };

  window._builderDeleteNode = function(nodeId) {
    _builderNodes = _builderNodes.filter(n => n.id !== nodeId);
    _builderEdges = _builderEdges.filter(e => e.from !== nodeId && e.to !== nodeId);
    if (_selectedNode?.id === nodeId) _selectedNode = null;
    _renderBuilder();
  };

  // ── Connections ────────────────────────────────────────────────────────────
  window._builderStartConnect = function(nodeId) {
    window._connectingFrom = nodeId;
    const canvas = document.getElementById('builder-canvas');
    if (canvas) canvas.style.cursor = 'crosshair';
    const status = document.getElementById('builder-status');
    if (status) status.textContent = 'Now click the left connector of another block to connect';
  };

  window._builderConnectTo = function(nodeId) {
    if (!window._connectingFrom || window._connectingFrom === nodeId) return;
    _builderEdges = _builderEdges.filter(e => e.from !== window._connectingFrom);
    _builderEdges.push({ from: window._connectingFrom, to: nodeId });
    window._connectingFrom = null;
    const canvas = document.getElementById('builder-canvas');
    if (canvas) canvas.style.cursor = 'default';
    const status = document.getElementById('builder-status');
    if (status) status.textContent = '';
    _renderBuilder();
  };

  // ── Param editing ──────────────────────────────────────────────────────────
  window._builderUpdateParam = function(nodeId, key, val) {
    const node = _builderNodes.find(n => n.id === nodeId);
    if (!node) return;
    node.params[key] = typeof node.params[key] === 'number' ? parseFloat(val) : val;
    const nodeEl = document.querySelector(`[data-node-id="${nodeId}"] .builder-node-params`);
    if (nodeEl) {
      nodeEl.innerHTML = Object.entries(node.params).slice(0, 3)
        .map(([k, v]) => `<div style="font-size:0.7rem;color:var(--text-secondary)">${k.replace(/_/g, ' ')}: <strong>${v}</strong></div>`)
        .join('');
    }
  };

  // ── Toolbar actions ────────────────────────────────────────────────────────
  window._builderSave = function() {
    try {
      localStorage.setItem('ds_builder_protocol', JSON.stringify(_builderGetJSON()));
      const status = document.getElementById('builder-status');
      if (status) { status.textContent = '✓ Saved'; setTimeout(() => { if (status) status.textContent = ''; }, 2500); }
      window._announce?.('Protocol saved');
    } catch { window._announce?.('Save failed', true); }
  };

  window._builderExportJSON = function() {
    const json = JSON.stringify(_builderGetJSON(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'protocol.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  window._builderImportJSON = function() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = function(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(ev) {
        try {
          const data = JSON.parse(ev.target.result);
          if (!data.stages) { _dsToast('Invalid protocol JSON: missing stages array.', 'error'); return; }
          _builderNodes = data.stages.map(s => {
            const tpl = Object.values(BLOCK_PALETTE).flat().find(b => b.type === s.type);
            return {
              id: s.id || `node-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              type: s.type, category: s.category || 'modality', label: s.label,
              icon: tpl?.icon || '◈', color: tpl?.color || '#64748b',
              params: s.params || {}, x: s.x || 40, y: s.y || 40,
            };
          });
          _builderEdges = data.stages.filter(s => s.next).map(s => ({ from: s.id, to: s.next }));
          _selectedNode = null;
          _renderBuilder();
          window._announce?.('Protocol imported');
        } catch { _dsToast('Failed to parse JSON file. Please check the format.', 'error'); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  window._builderUseInWizard = function() {
    window._wizState = window._wizState || {};
    window._wizState.visualProtocol = JSON.stringify({
      stages: _builderNodes.map(n => ({ type: n.type, params: n.params })),
    });
    window._nav('protocols');
    window._announce?.('Visual protocol loaded into wizard');
  };

  window._builderClear = function() {
    if (_builderNodes.length > 0 && !confirm('Clear all blocks and connections?')) return;
    _builderNodes = []; _builderEdges = []; _selectedNode = null;
    _renderBuilder();
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── AI Clinical Decision Support ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ── Knowledge Base ────────────────────────────────────────────────────────────
const MODALITY_INDICATIONS = {
  neurofeedback: {
    conditions: ['adhd', 'anxiety', 'ptsd', 'depression', 'insomnia', 'tbi'],
    contraindications: ['active psychosis', 'uncontrolled seizures'],
  },
  tms: {
    conditions: ['depression', 'ocd', 'ptsd', 'anxiety', 'chronic pain'],
    contraindications: ['cochlear implants', 'metal in skull', 'pacemaker', 'pregnancy'],
  },
  tdcs: {
    conditions: ['depression', 'stroke rehab', 'chronic pain', 'cognitive enhancement'],
    contraindications: ['implanted devices', 'skull defects', 'pregnancy'],
  },
  tavns: {
    conditions: ['epilepsy', 'depression', 'anxiety', 'inflammation'],
    contraindications: ['bilateral vagotomy', 'active infection'],
  },
  ces: {
    conditions: ['anxiety', 'insomnia', 'depression', 'ptsd'],
    contraindications: ['pregnancy', 'implanted devices'],
  },
};

const EVIDENCE_LEVELS = {
  neurofeedback_adhd:       { level: 'A', label: 'Strong',   refs: 42,  interpretation: 'Multiple RCTs support efficacy for attention and hyperactivity.' },
  neurofeedback_anxiety:    { level: 'B', label: 'Moderate', refs: 28,  interpretation: 'Promising controlled studies; replication needed.' },
  neurofeedback_ptsd:       { level: 'B', label: 'Moderate', refs: 19,  interpretation: 'Emerging evidence; alpha-theta protocols show benefit.' },
  neurofeedback_depression: { level: 'B', label: 'Moderate', refs: 23,  interpretation: 'QEEG-guided protocols demonstrate symptom reduction.' },
  neurofeedback_tbi:        { level: 'C', label: 'Limited',  refs: 11,  interpretation: 'Small studies; further research warranted.' },
  tms_depression:           { level: 'A', label: 'Strong',   refs: 156, interpretation: 'FDA-cleared; robust multi-site RCT evidence base.' },
  tms_ocd:                  { level: 'A', label: 'Strong',   refs: 67,  interpretation: 'FDA-cleared deep TMS; dACC target well-validated.' },
  tms_ptsd:                 { level: 'B', label: 'Moderate', refs: 38,  interpretation: 'Right DLPFC inhibition shows clinically meaningful response.' },
  tms_anxiety:              { level: 'B', label: 'Moderate', refs: 31,  interpretation: 'Bilateral protocols demonstrate anxiolytic effects.' },
  tms_chronic_pain:         { level: 'B', label: 'Moderate', refs: 44,  interpretation: 'M1 targeting provides analgesic benefit in several pain types.' },
  tdcs_depression:          { level: 'B', label: 'Moderate', refs: 52,  interpretation: 'F3 anode protocol comparable to escitalopram in one large RCT.' },
  tdcs_stroke:              { level: 'B', label: 'Moderate', refs: 89,  interpretation: 'Paired with rehab; ipsilesional M1 anode is standard approach.' },
  tdcs_chronic_pain:        { level: 'B', label: 'Moderate', refs: 37,  interpretation: 'M1 and DLPFC targets reduce chronic pain intensity.' },
  tdcs_cognitive:           { level: 'C', label: 'Limited',  refs: 22,  interpretation: 'Cognitive enhancement evidence is mixed; individual variability high.' },
  tavns_epilepsy:           { level: 'B', label: 'Moderate', refs: 29,  interpretation: 'CE-marked in Europe; reduces seizure frequency in drug-resistant cases.' },
  tavns_depression:         { level: 'C', label: 'Limited',  refs: 14,  interpretation: 'Preliminary data promising; larger RCTs ongoing.' },
  ces_anxiety:              { level: 'B', label: 'Moderate', refs: 34,  interpretation: 'Meta-analysis supports anxiolytic effect; FDA-registered devices available.' },
  ces_insomnia:             { level: 'B', label: 'Moderate', refs: 21,  interpretation: 'Improved sleep onset and quality in controlled trials.' },
  ces_depression:           { level: 'C', label: 'Limited',  refs: 17,  interpretation: 'Adjunctive benefit reported; standalone evidence limited.' },
};

// ── Recommendation Engine ─────────────────────────────────────────────────────
function getModalityRecommendations(symptoms, contraindications) {
  const symLow = symptoms.map(s => s.toLowerCase().trim());
  const contraLow = contraindications.map(c => c.toLowerCase().trim());
  const results = [];

  for (const [modality, info] of Object.entries(MODALITY_INDICATIONS)) {
    const matched = info.conditions.filter(c =>
      symLow.some(s => s.includes(c) || c.includes(s))
    );
    const rawScore = symLow.length > 0 ? (matched.length / symLow.length) * 100 : 0;
    const warnings = getContraindicationWarnings(modality, contraLow);
    const penalty = warnings.length * 20;
    const matchScore = Math.max(0, Math.round(rawScore - penalty));

    // Best evidence for matched conditions in this modality
    let bestEvidence = null;
    for (const cond of matched) {
      const key = `${modality}_${cond.replace(/\s+/g, '_')}`;
      const ev = EVIDENCE_LEVELS[key];
      if (ev) {
        if (!bestEvidence || ['A', 'B', 'C', 'D'].indexOf(ev.level) < ['A', 'B', 'C', 'D'].indexOf(bestEvidence.level)) {
          bestEvidence = ev;
        }
      }
    }
    results.push({ modality, matchScore, evidenceLevel: bestEvidence, conditions: matched, warnings });
  }

  results.sort((a, b) => b.matchScore - a.matchScore);
  return results;
}

function getContraindicationWarnings(modality, patientFlags) {
  const info = MODALITY_INDICATIONS[modality];
  if (!info) return [];
  return info.contraindications
    .filter(c => patientFlags.some(f => f.includes(c) || c.includes(f)))
    .map(c => `⚠ ${modality.toUpperCase()} contraindicated: ${c}`);
}

function getEvidenceBadge(modality, condition) {
  const key = `${modality}_${condition.replace(/\s+/g, '_').toLowerCase()}`;
  return EVIDENCE_LEVELS[key] || null;
}

// ── Symptom / Contraindication Config ────────────────────────────────────────
const DS_SYMPTOM_LIST = [
  { id: 'adhd',                  label: 'ADHD' },
  { id: 'anxiety',               label: 'Anxiety' },
  { id: 'depression',            label: 'Depression' },
  { id: 'ptsd',                  label: 'PTSD' },
  { id: 'insomnia',              label: 'Insomnia' },
  { id: 'chronic pain',          label: 'Chronic Pain' },
  { id: 'tbi',                   label: 'TBI' },
  { id: 'ocd',                   label: 'OCD' },
  { id: 'stroke rehab',          label: 'Stroke Rehab' },
  { id: 'cognitive enhancement', label: 'Cognitive Decline' },
  { id: 'epilepsy',              label: 'Epilepsy' },
  { id: 'inflammation',          label: 'Inflammation' },
  { id: 'tinnitus',              label: 'Tinnitus' },
  { id: 'migraine',              label: 'Migraine' },
  { id: 'autism',                label: 'Autism' },
  { id: 'bipolar',               label: 'Bipolar' },
];

const DS_CONTRA_LIST = [
  { id: 'pacemaker',             label: 'Pacemaker' },
  { id: 'cochlear implants',     label: 'Cochlear Implants' },
  { id: 'metal in skull',        label: 'Metal in Skull' },
  { id: 'pregnancy',             label: 'Pregnancy' },
  { id: 'active psychosis',      label: 'Active Psychosis' },
  { id: 'uncontrolled seizures', label: 'Uncontrolled Seizures' },
  { id: 'implanted devices',     label: 'Implanted Devices' },
  { id: 'skull defects',         label: 'Skull Defects' },
  { id: 'bilateral vagotomy',    label: 'Vagotomy (bilateral)' },
  { id: 'active infection',      label: 'Active Infection' },
];

const DS_MODALITY_ICONS = {
  neurofeedback: '🧠',
  tms:           '⚡',
  tdcs:          '🔋',
  tavns:         '👂',
  ces:           '〰️',
};

// ── Render Helpers ────────────────────────────────────────────────────────────
function _dsCheckboxGroup(items, name) {
  let html = '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:4px 12px">';
  for (const item of items) {
    html += `<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-secondary);cursor:pointer;padding:3px 0">
      <input type="checkbox" value="${item.id}" data-ds="${name}" style="accent-color:var(--accent-teal,#00d4bc);width:14px;height:14px">
      ${item.label}
    </label>`;
  }
  html += '</div>';
  return html;
}

function _dsRecCard(rec) {
  const icon = DS_MODALITY_ICONS[rec.modality] || '◈';
  const name = rec.modality.charAt(0).toUpperCase() + rec.modality.slice(1);
  const hasWarnings = rec.warnings.length > 0;

  const condPills = rec.conditions.map(c =>
    `<span style="background:rgba(0,212,188,0.12);color:var(--accent-teal,#00d4bc);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500">${c}</span>`
  ).join('');

  const warnPills = rec.warnings.map(w =>
    `<span style="background:rgba(239,68,68,0.1);color:#ef4444;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500">${w}</span>`
  ).join('');

  const ev = rec.evidenceLevel;
  const evBadge = ev
    ? `<span class="evidence-badge-${ev.level}" style="margin-left:auto;white-space:nowrap">Level ${ev.level} — ${ev.label} (${ev.refs} studies)</span>`
    : '';

  return `<div class="rec-card" style="${hasWarnings ? 'border-color:rgba(239,68,68,0.4)' : ''}">
    <div class="rec-card-header">
      <span style="font-size:1.5rem">${icon}</span>
      <div style="flex:1">
        <div style="font-weight:700;font-size:14px;color:var(--text-primary)">${name}</div>
        <div style="font-size:11px;color:var(--text-tertiary)">${rec.conditions.length} condition${rec.conditions.length !== 1 ? 's' : ''} matched</div>
      </div>
      ${evBadge}
    </div>
    <div style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-tertiary);margin-bottom:3px">
        <span>Match Score</span>
        <span style="font-weight:600;color:var(--accent-teal,#00d4bc)">${rec.matchScore}%</span>
      </div>
      <div class="rec-match-bar"><div class="rec-match-fill" style="width:${rec.matchScore}%"></div></div>
    </div>
    ${rec.conditions.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">${condPills}</div>` : ''}
    ${warnPills ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">${warnPills}</div>` : ''}
    ${ev ? `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px;font-style:italic">${ev.interpretation || ''}</div>` : ''}
    <button class="btn btn-primary btn-sm" onclick="window._applyModalityRecommendation('${rec.modality}')"${rec.matchScore === 0 ? ' disabled' : ''}>
      Use This Modality &rarr;
    </button>
  </div>`;
}

function _dsEvidenceTable(filterModality, filterLevel) {
  const rows = Object.entries(EVIDENCE_LEVELS)
    .filter(([key, ev]) => {
      const mod = key.split('_')[0];
      if (filterModality && mod !== filterModality) return false;
      if (filterLevel && ev.level !== filterLevel) return false;
      return true;
    })
    .map(([key, ev]) => {
      const parts = key.split('_');
      const mod = parts[0];
      const cond = parts.slice(1).join(' ');
      return `<tr>
        <td style="font-weight:500;text-transform:capitalize">${DS_MODALITY_ICONS[mod] || ''} ${mod}</td>
        <td style="text-transform:capitalize">${cond}</td>
        <td><span class="evidence-badge-${ev.level}">Level ${ev.level} &mdash; ${ev.label}</span></td>
        <td class="mono">${ev.refs}</td>
        <td style="font-size:11px;color:var(--text-secondary)">${ev.interpretation || ''}</td>
      </tr>`;
    }).join('');

  if (!rows) {
    return '<div style="padding:16px;color:var(--text-secondary);font-size:13px">No entries match the selected filters.</div>';
  }
  return `<table class="ds-table" style="font-size:12px">
    <thead><tr><th>Modality</th><th>Condition</th><th>Evidence Level</th><th>Studies</th><th>Interpretation</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export async function pgDecisionSupport(setTopbar) {
  setTopbar('AI Clinical Decision Support',
    '<button class="btn btn-primary btn-sm" onclick="window._generateRecommendations()">Generate Recommendations</button>'
  );

  const content = document.getElementById('content');
  if (!content) return;

  const modOptions = Object.keys(MODALITY_INDICATIONS)
    .map(m => `<option value="${m}">${DS_MODALITY_ICONS[m] || ''} ${m.charAt(0).toUpperCase() + m.slice(1)}</option>`)
    .join('');

  content.innerHTML = `
<div style="max-width:1400px;margin:0 auto;padding:0 4px">

  <div class="clinical-disclaimer" role="note" style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.35);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:16px;display:flex;gap:10px;align-items:flex-start">
    <span style="font-size:16px;color:var(--amber);flex-shrink:0">&#9888;</span>
    <div style="font-size:12px;line-height:1.55;color:var(--text-secondary)">
      <strong style="color:var(--text-primary)">For qualified clinicians only.</strong>
      Rule-based recommendations derived from evidence mappings. <strong style="color:var(--text-primary)">This is not a clinical decision.</strong> Every output must be independently verified before informing care. Decision support only — not a substitute for clinical judgment. Always verify against the current device label and local protocols.
    </div>
  </div>

  <div style="margin-bottom:20px">
    <h2 style="font-size:1.1rem;font-weight:700;margin-bottom:4px">Clinical Decision Support</h2>
    <p style="font-size:12.5px;color:var(--text-secondary)">Rule-based protocol recommendations derived from modality-indication evidence mapping. All logic is deterministic &mdash; no external API calls.</p>
  </div>

  <div style="display:grid;grid-template-columns:40% 60%;gap:20px;align-items:start">

    <div>
      <div class="ds-card" style="padding:20px;margin-bottom:16px">
        <h3 style="font-size:13px;font-weight:700;margin-bottom:14px;color:var(--text-primary)">Patient Profile</h3>
        <div style="margin-bottom:16px">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;color:var(--text-tertiary);margin-bottom:8px">Symptoms / Conditions</div>
          ${_dsCheckboxGroup(DS_SYMPTOM_LIST, 'symptom')}
        </div>
        <div style="margin-bottom:16px">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;color:var(--text-tertiary);margin-bottom:8px">Contraindication Flags</div>
          <div style="background:rgba(239,68,68,0.06);border-left:4px solid var(--red);padding:10px 14px;margin-bottom:12px;font-size:12.5px;color:var(--text-secondary);border-radius:var(--radius-md)">
            <strong style="color:var(--text-primary)">Flags are NOT auto-populated from the patient chart.</strong> Verify each against the medical-history record before generating recommendations.
          </div>
          ${_dsCheckboxGroup(DS_CONTRA_LIST, 'contra')}
        </div>
        <button class="btn btn-primary" style="width:100%" onclick="window._generateRecommendations()">
          🧬 Generate Recommendations
        </button>
      </div>
    </div>

    <div>
      <div id="ds-rec-panel">
        <div class="ds-card" style="padding:32px;text-align:center">
          <div style="font-size:2rem;margin-bottom:10px">🧬</div>
          <div style="font-size:14px;font-weight:600;color:var(--text-secondary)">Select symptoms above to see protocol recommendations</div>
          <div style="font-size:12px;color:var(--text-tertiary);margin-top:6px">Check one or more conditions and click Generate Recommendations</div>
        </div>
      </div>
    </div>
  </div>

  <div class="ds-card" style="padding:20px;margin-top:20px">
    <h3 style="font-size:13px;font-weight:700;margin-bottom:14px">Contraindication Checker</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end">
      <div>
        <label style="font-size:11.5px;color:var(--text-secondary);display:block;margin-bottom:5px">Modality</label>
        <select id="ds-contra-modality" class="form-control">
          <option value="">Select modality&hellip;</option>
          ${modOptions}
        </select>
      </div>
      <div>
        <label style="font-size:11.5px;color:var(--text-secondary);display:block;margin-bottom:5px">Patient flags (free-text, comma-separated)</label>
        <input id="ds-contra-flags" class="form-control" placeholder="e.g. pacemaker, pregnancy" style="font-size:12.5px">
      </div>
      <button class="btn btn-primary btn-sm" onclick="window._checkContraindications()" style="white-space:nowrap">Check Now</button>
    </div>
    <div id="ds-contra-results" style="margin-top:12px"></div>
  </div>

  <div class="ds-card" style="padding:20px;margin-top:20px;margin-bottom:24px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">
      <h3 style="font-size:13px;font-weight:700;margin:0">Evidence Library</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <select id="ds-ev-mod" class="form-control" style="font-size:12px;padding:5px 8px;min-width:140px"
          onchange="window._filterEvidenceLibrary(this.value, document.getElementById('ds-ev-level').value)">
          <option value="">All Modalities</option>
          ${Object.keys(MODALITY_INDICATIONS).map(m => `<option value="${m}">${m.charAt(0).toUpperCase() + m.slice(1)}</option>`).join('')}
        </select>
        <select id="ds-ev-level" class="form-control" style="font-size:12px;padding:5px 8px;min-width:120px"
          onchange="window._filterEvidenceLibrary(document.getElementById('ds-ev-mod').value, this.value)">
          <option value="">All Levels</option>
          <option value="A">Level A &mdash; Strong</option>
          <option value="B">Level B &mdash; Moderate</option>
          <option value="C">Level C &mdash; Limited</option>
          <option value="D">Level D &mdash; Insufficient</option>
        </select>
      </div>
    </div>
    <div id="ds-ev-table">${_dsEvidenceTable('', '')}</div>
  </div>

</div>`;

  window._generateRecommendations = function() {
    const symptoms = Array.from(document.querySelectorAll('[data-ds="symptom"]:checked')).map(el => el.value);
    const contras  = Array.from(document.querySelectorAll('[data-ds="contra"]:checked')).map(el => el.value);
    const panel = document.getElementById('ds-rec-panel');
    if (!panel) return;

    if (symptoms.length === 0) {
      panel.innerHTML = `<div class="ds-card" style="padding:20px;text-align:center;color:var(--amber)">
        <div style="font-size:1.3rem;margin-bottom:8px">&#9888;</div>
        <div style="font-size:13px;font-weight:600">Please select at least one symptom or condition.</div>
      </div>`;
      return;
    }

    const recs = getModalityRecommendations(symptoms, contras);
    const scored    = recs.filter(r => r.matchScore > 0);
    const unmatched = recs.filter(r => r.matchScore === 0);

    let html = `<div style="margin-bottom:10px;font-size:12px;color:var(--text-tertiary)">
      Showing ${scored.length} recommendation${scored.length !== 1 ? 's' : ''} for:
      <strong style="color:var(--text-secondary)">${symptoms.join(', ')}</strong>
      ${contras.length > 0 ? `<br>Contraindication flags: <span style="color:#ef4444">${contras.join(', ')}</span>` : ''}
    </div>`;

    if (scored.length === 0) {
      html += `<div class="ds-card" style="padding:20px;text-align:center;color:var(--text-secondary);font-size:13px">
        No modalities match the selected symptoms &mdash; consider broadening your symptom selection.
      </div>`;
    } else {
      html += scored.map(_dsRecCard).join('');
    }

    if (unmatched.length > 0 && scored.length > 0) {
      html += `<details style="margin-top:4px">
        <summary style="font-size:11.5px;color:var(--text-tertiary);cursor:pointer;padding:4px 0">
          Show ${unmatched.length} modalities with no symptom match
        </summary>
        <div style="margin-top:8px">${unmatched.map(_dsRecCard).join('')}</div>
      </details>`;
    }

    panel.innerHTML = html;

    requestAnimationFrame(() => {
      document.querySelectorAll('.rec-match-fill').forEach(el => {
        const w = el.style.width;
        el.style.width = '0%';
        requestAnimationFrame(() => { el.style.width = w; });
      });
    });
  };

  window._applyModalityRecommendation = function(modality) {
    const info = MODALITY_INDICATIONS[modality];
    const icon = DS_MODALITY_ICONS[modality] || '&#9670;';
    const name = modality.charAt(0).toUpperCase() + modality.slice(1);
    window._showNotifToast?.({ title: `${icon} ${name} selected`, body: `Indicated for: ${info.conditions.slice(0,3).join(', ')}${info.conditions.length > 3 ? ' +more' : ''}. Opening Protocol Builder…`, severity: 'info' });
    window._nav?.('protocol-wizard');
  };

  window._checkContraindications = function() {
    const modality   = document.getElementById('ds-contra-modality')?.value || '';
    const freeText   = document.getElementById('ds-contra-flags')?.value || '';
    const checked    = Array.from(document.querySelectorAll('[data-ds="contra"]:checked')).map(el => el.value);
    const freeFlags  = freeText.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const allFlags   = [...checked, ...freeFlags];
    const resultsEl  = document.getElementById('ds-contra-results');
    if (!resultsEl) return;

    if (!modality) {
      resultsEl.innerHTML = '<div style="color:var(--amber);font-size:12.5px">Please select a modality first.</div>';
      return;
    }
    if (allFlags.length === 0) {
      resultsEl.innerHTML = '<div style="color:var(--amber);font-size:12.5px">Please enter or check at least one patient flag.</div>';
      return;
    }

    const warnings = getContraindicationWarnings(modality, allFlags);
    if (warnings.length === 0) {
      resultsEl.innerHTML = `<div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.3);border-radius:6px;padding:10px 14px;font-size:13px;color:#22c55e">
        &#10003; No contraindications detected for ${modality.toUpperCase()} with the provided patient flags.
      </div>`;
    } else {
      resultsEl.innerHTML = warnings.map(w => `<div class="contraindication-warning">${w}</div>`).join('');
    }
  };

  window._filterEvidenceLibrary = function(modality, level) {
    const el = document.getElementById('ds-ev-table');
    if (el) el.innerHTML = _dsEvidenceTable(modality || '', level || '');
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PATIENT PROFILE PAGE
// ─────────────────────────────────────────────────────────────────────────────

const _PP_STORE_KEY = 'ds_patient_profiles';

function getPatientProfiles() {
  try { return JSON.parse(localStorage.getItem(_PP_STORE_KEY) || '[]'); } catch { return []; }
}

function savePatientProfile(profile) {
  const profiles = getPatientProfiles();
  const idx = profiles.findIndex(p => p.id === profile.id);
  if (idx >= 0) profiles[idx] = profile;
  else profiles.push(profile);
  localStorage.setItem(_PP_STORE_KEY, JSON.stringify(profiles));
}

function getPatientProfile(id) {
  return getPatientProfiles().find(p => p.id === id) || null;
}

function _ppSeedProfiles() {
  const existing = getPatientProfiles();
  if (existing.length > 0) return;
  const seeds = [
    {
      id: 'pp-001', name: 'Sarah Mitchell', dob: '1985-03-14', gender: 'Female',
      phone: '+1 (555) 210-3847', email: 'sarah.mitchell@email.com',
      address: '42 Westbrook Lane\nPortland, OR 97201',
      emergencyContact: { name: 'James Mitchell', phone: '+1 (555) 210-9900', relationship: 'Spouse' },
      insurance: { payer: 'BlueCross BlueShield', memberId: 'BCB-884521', groupId: 'GRP-10042', copay: '25', scanDataUrl: null },
      medications: [
        { name: 'Sertraline', dose: '100mg', frequency: 'Once daily', startDate: '2023-01-15', notes: 'Well tolerated' },
        { name: 'Lorazepam', dose: '0.5mg', frequency: 'As needed', startDate: '2023-06-01', notes: 'PRN anxiety' },
      ],
      allergies: [
        { substance: 'Penicillin', reaction: 'Rash, hives', severity: 'Moderate' },
        { substance: 'Latex', reaction: 'Contact dermatitis', severity: 'Mild' },
      ],
      treatmentHistory: [
        { date: '2024-09-10', type: 'neurofeedback', provider: 'Dr. Reyes', notes: 'Initial 20-session protocol for anxiety.', outcome: 72 },
        { date: '2024-11-05', type: 'consultation', provider: 'Dr. Patel', notes: 'Medication review and protocol adjustment.', outcome: 65 },
        { date: '2025-02-18', type: 'tDCS', provider: 'Dr. Reyes', notes: 'Adjunct tDCS targeting dorsolateral PFC.', outcome: 81 },
      ],
      photoDataUrl: null,
      flags: ['vip'],
      notes: 'Patient shows strong motivation. Prefers morning appointments. History of treatment-resistant depression — monitor closely.',
    },
    {
      id: 'pp-002', name: 'Ethan Caldwell', dob: '1978-11-27', gender: 'Male',
      phone: '+1 (555) 334-7711', email: 'ethan.c@healthmail.net',
      address: '8 Ridgemont Ave\nBoston, MA 02101',
      emergencyContact: { name: 'Cora Caldwell', phone: '+1 (555) 334-5599', relationship: 'Partner' },
      insurance: { payer: 'Aetna', memberId: 'AET-332100', groupId: 'GRP-55081', copay: '40', scanDataUrl: null },
      medications: [
        { name: 'Methylphenidate', dose: '20mg', frequency: 'Twice daily', startDate: '2022-08-20', notes: 'ADHD management' },
      ],
      allergies: [
        { substance: 'Sulfa drugs', reaction: 'Anaphylaxis', severity: 'Life-threatening' },
      ],
      treatmentHistory: [
        { date: '2024-05-22', type: 'TMS', provider: 'Dr. Okafor', notes: 'rTMS for depression — 30 sessions completed.', outcome: 68 },
        { date: '2025-01-14', type: 'neurofeedback', provider: 'Dr. Okafor', notes: 'Theta-beta training for ADHD comorbidity.', outcome: 77 },
      ],
      photoDataUrl: null,
      flags: ['high-risk', 'research-participant'],
      notes: 'Enrolled in Theta-Beta NFB study. Informed consent on file. Requires supervision during TMS sessions.',
    },
    {
      id: 'pp-003', name: 'Priya Nair', dob: '1993-07-04', gender: 'Female',
      phone: '+1 (555) 678-2200', email: 'priya.nair@clinic.org',
      address: '17 Elmwood Court\nAustin, TX 78701',
      emergencyContact: { name: 'Rajan Nair', phone: '+1 (555) 678-4411', relationship: 'Father' },
      insurance: { payer: 'UnitedHealthcare', memberId: 'UHC-770093', groupId: 'GRP-22399', copay: '30', scanDataUrl: null },
      medications: [],
      allergies: [
        { substance: 'NSAIDs', reaction: 'GI distress', severity: 'Mild' },
      ],
      treatmentHistory: [
        { date: '2025-03-01', type: 'consultation', provider: 'Dr. Walsh', notes: 'Initial intake — chronic migraine & insomnia.', outcome: 55 },
        { date: '2025-03-28', type: 'neurofeedback', provider: 'Dr. Walsh', notes: 'SMR/alpha protocol for sleep quality.', outcome: 63 },
      ],
      photoDataUrl: null,
      flags: [],
      notes: 'New patient. Referred by Dr. Vasquez. Primary goals: reduce migraine frequency and improve sleep latency.',
    },
  ];
  seeds.forEach(s => savePatientProfile(s));
}

function _ppComputeAge(dob) {
  if (!dob) return '?';
  const born = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age--;
  return age;
}

function _ppFlagBadge(flag) {
  if (flag === 'high-risk')           return `<span class="profile-flag profile-flag-high-risk">High Risk</span>`;
  if (flag === 'vip')                 return `<span class="profile-flag profile-flag-vip">VIP</span>`;
  if (flag === 'research-participant') return `<span class="profile-flag profile-flag-research">Research</span>`;
  return `<span class="profile-flag" style="background:var(--hover-bg);color:var(--text-secondary)">${flag}</span>`;
}

function _ppSeverityBadge(severity) {
  const map = {
    'Mild': 'severity-mild',
    'Moderate': 'severity-moderate',
    'Severe': 'severity-severe',
    'Life-threatening': 'severity-lifethreatening',
  };
  return `<span class="${map[severity] || 'severity-mild'}">${severity}</span>`;
}

function _ppTypeBadge(type) {
  const colors = {
    neurofeedback: 'background:#dbeafe;color:#1e40af',
    TMS:           'background:#ede9fe;color:#5b21b6',
    tDCS:          'background:#d1fae5;color:#065f46',
    consultation:  'background:#fef3c7;color:#92400e',
  };
  const style = colors[type] || 'background:var(--hover-bg);color:var(--text-secondary)';
  return `<span style="${style};padding:2px 8px;border-radius:4px;font-size:.72rem;font-weight:600;text-transform:uppercase">${type}</span>`;
}

function _ppAvatarHTML(profile) {
  if (profile.photoDataUrl) {
    return `<img class="profile-avatar" src="${profile.photoDataUrl}" alt="${profile.name}" style="width:80px;height:80px;border-radius:50%;object-fit:cover">`;
  }
  const parts = (profile.name || '??').trim().split(/\s+/);
  const ini = (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  return `<div class="profile-avatar">${ini}</div>`;
}

function _ppRenderHeader(profile, editMode) {
  const age = _ppComputeAge(profile.dob);
  const flagsHTML = (profile.flags || []).map(_ppFlagBadge).join(' ');
  return `
    <div class="profile-header">
      <div style="position:relative;flex-shrink:0">
        <div id="pp-avatar-wrap">${_ppAvatarHTML(profile)}</div>
        <button class="btn btn-sm" style="position:absolute;bottom:-4px;right:-4px;padding:2px 6px;font-size:10px;border-radius:6px" onclick="window._profileUploadPhoto()" title="Upload photo">&#128247;</button>
        <input type="file" id="pp-photo-input" accept="image/*" style="display:none" onchange="window._profileHandlePhoto(this)">
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <h2 style="margin:0;font-size:1.35rem;font-weight:700" id="pp-name-display">${profile.name}</h2>
          <div style="display:flex;gap:6px;flex-wrap:wrap" id="pp-flags-display">${flagsHTML}</div>
        </div>
        <div style="color:var(--text-secondary);font-size:.88rem;margin-top:4px">
          ${age} yrs &nbsp;&bull;&nbsp; ${profile.gender || '—'} &nbsp;&bull;&nbsp;
          <span style="color:var(--text-tertiary)">${profile.dob || '—'}</span>
        </div>
        <div style="margin-top:8px;display:flex;gap:12px;flex-wrap:wrap;font-size:.8rem;color:var(--text-secondary)">
          ${profile.phone ? `<span>&#128222; ${profile.phone}</span>` : ''}
          ${profile.email ? `<span>&#9993; ${profile.email}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;flex-shrink:0">
        <!-- Primary clinical quick-actions — 1 click from patient profile -->
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="window._nav('session-execution')" title="Log a treatment session for this patient">&#9711; Start Session</button>
          <button class="btn btn-sm" onclick="window._ppAddNoteQuick('${profile.id}')" title="Add a quick clinical note">&#9998; Add Note</button>
          <button class="btn btn-sm" onclick="window._nav('report-builder')" title="Generate a clinical report">&#128440; Report</button>
        </div>
        <button class="btn btn-sm ${editMode ? 'btn-primary' : ''}" id="pp-edit-btn" onclick="window._profileToggleEdit()">
          ${editMode ? '&#10003; Editing' : '&#9998; Edit Profile'}
        </button>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-sm" style="font-size:.75rem" onclick="window._profileAddFlag('high-risk')">+HR</button>
          <button class="btn btn-sm" style="font-size:.75rem" onclick="window._profileAddFlag('vip')">+VIP</button>
          <button class="btn btn-sm" style="font-size:.75rem" onclick="window._profileAddFlag('research-participant')">+Research</button>
        </div>
        ${(profile.flags || []).length > 0 ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${(profile.flags || []).map(f => `<button class="btn btn-sm btn-danger" style="font-size:.7rem;padding:1px 6px" onclick="window._profileRemoveFlag('${f}')">&#10005; ${f}</button>`).join('')}</div>` : ''}
      </div>
    </div>`;
}

function _ppRenderTabs(activeTab) {
  const tabs = ['demographics', 'insurance', 'medications', 'allergies', 'history', 'notes', 'assessments'];
  const labels = { demographics: 'Demographics', insurance: 'Insurance', medications: 'Medications', allergies: 'Allergies', history: 'Treatment History', notes: 'Notes', assessments: 'Assessments' };
  return `<div style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:20px;overflow-x:auto" role="tablist">
    ${tabs.map(t => `<button role="tab" aria-selected="${t === activeTab}" class="btn" style="border-radius:0;border:none;border-bottom:${t === activeTab ? '2px solid var(--accent-teal)' : '2px solid transparent'};margin-bottom:-2px;padding:10px 18px;font-size:.875rem;font-weight:${t === activeTab ? '600' : '400'};color:${t === activeTab ? 'var(--accent-teal)' : 'var(--text-secondary)'};white-space:nowrap;background:none" onclick="window._profileTab('${t}')">${labels[t]}</button>`).join('')}
  </div>`;
}

function _ppRenderDemographics(profile, editMode) {
  const ro = !editMode ? 'readonly' : '';
  const dis = !editMode ? 'disabled' : '';
  return `
    <div style="max-width:700px">
      <h3 style="font-size:1rem;font-weight:600;margin-bottom:14px;color:var(--text-secondary)">Personal Information</h3>
      <div class="g2" style="gap:12px">
        <div class="form-group"><label class="form-label">Full Name</label><input id="pp-d-name" class="form-control" value="${profile.name || ''}" ${ro}></div>
        <div class="form-group"><label class="form-label">Date of Birth</label><input id="pp-d-dob" class="form-control" type="date" value="${profile.dob || ''}" ${ro}></div>
        <div class="form-group"><label class="form-label">Gender</label>
          <select id="pp-d-gender" class="form-control" ${dis}>
            <option value="">Select…</option>
            ${['Male','Female','Other','Prefer not to say'].map(g => `<option ${profile.gender === g ? 'selected' : ''}>${g}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Phone</label><input id="pp-d-phone" class="form-control" value="${profile.phone || ''}" ${ro}></div>
        <div class="form-group"><label class="form-label">Email</label><input id="pp-d-email" class="form-control" type="email" value="${profile.email || ''}" ${ro}></div>
      </div>
      <div class="form-group" style="margin-top:4px"><label class="form-label">Address</label><textarea id="pp-d-address" class="form-control" rows="3" ${ro}>${profile.address || ''}</textarea></div>
      <h3 style="font-size:1rem;font-weight:600;margin:20px 0 14px;color:var(--text-secondary)">Emergency Contact</h3>
      <div class="g2" style="gap:12px">
        <div class="form-group"><label class="form-label">Name</label><input id="pp-d-ec-name" class="form-control" value="${(profile.emergencyContact || {}).name || ''}" ${ro}></div>
        <div class="form-group"><label class="form-label">Phone</label><input id="pp-d-ec-phone" class="form-control" value="${(profile.emergencyContact || {}).phone || ''}" ${ro}></div>
        <div class="form-group"><label class="form-label">Relationship</label><input id="pp-d-ec-rel" class="form-control" value="${(profile.emergencyContact || {}).relationship || ''}" ${ro}></div>
      </div>
      ${editMode ? `<div style="margin-top:16px"><button class="btn btn-primary" onclick="window._profileSaveDemographics()">Save Demographics</button></div>` : ''}
    </div>`;
}

function _ppRenderInsurance(profile, editMode) {
  const ins = profile.insurance || {};
  const ro = !editMode ? 'readonly' : '';
  const dis = !editMode ? 'disabled' : '';
  return `
    <div style="max-width:700px">
      <div class="g2" style="gap:12px">
        <div class="form-group"><label class="form-label">Payer / Insurer</label><input id="pp-i-payer" class="form-control" value="${ins.payer || ''}" ${ro} placeholder="e.g. BlueCross BlueShield"></div>
        <div class="form-group"><label class="form-label">Member ID</label><input id="pp-i-member" class="form-control" value="${ins.memberId || ''}" ${ro}></div>
        <div class="form-group"><label class="form-label">Group ID</label><input id="pp-i-group" class="form-control" value="${ins.groupId || ''}" ${ro}></div>
        <div class="form-group"><label class="form-label">Copay ($)</label><input id="pp-i-copay" class="form-control" type="number" min="0" value="${ins.copay || ''}" ${ro}></div>
      </div>
      <div style="margin-top:16px">
        <label class="form-label">Insurance Card Scan</label>
        <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
          <div class="insurance-card-preview" id="pp-card-preview">
            ${ins.scanDataUrl
              ? `<img src="${ins.scanDataUrl}" alt="Insurance card">`
              : `<div style="text-align:center;color:var(--text-tertiary);font-size:.8rem"><div style="font-size:1.5rem;margin-bottom:6px;opacity:.4">&#128184;</div>No scan uploaded</div>`}
          </div>
          ${editMode ? `<div>
            <input type="file" id="pp-card-input" accept="image/*" style="display:none" onchange="window._profileHandleCardScan(this)">
            <button class="btn btn-sm" onclick="document.getElementById('pp-card-input').click()">&#128247; Upload Scan</button>
          </div>` : ''}
        </div>
      </div>
      ${editMode ? `<div style="margin-top:16px"><button class="btn btn-primary" onclick="window._profileSaveInsurance()">Save Insurance</button></div>` : ''}
    </div>`;
}

function _ppRenderMedications(profile, editMode) {
  const meds = profile.medications || [];
  return `
    <div>
      ${editMode ? `<div style="margin-bottom:14px"><button class="btn btn-sm btn-primary" onclick="window._profileAddMedication()">+ Add Medication</button></div>` : ''}
      <div id="pp-med-add-form" style="display:none;background:var(--hover-bg);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px">
        <div class="g2" style="gap:10px">
          <div class="form-group"><label class="form-label">Medication Name</label><input id="pp-m-name" class="form-control" placeholder="e.g. Sertraline"></div>
          <div class="form-group"><label class="form-label">Dose</label><input id="pp-m-dose" class="form-control" placeholder="e.g. 100mg"></div>
          <div class="form-group"><label class="form-label">Frequency</label><input id="pp-m-freq" class="form-control" placeholder="e.g. Once daily"></div>
          <div class="form-group"><label class="form-label">Start Date</label><input id="pp-m-start" class="form-control" type="date"></div>
        </div>
        <div class="form-group"><label class="form-label">Notes</label><input id="pp-m-notes" class="form-control" placeholder="Optional notes"></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-primary btn-sm" onclick="window._profileSaveMedication()">Save</button>
          <button class="btn btn-sm" onclick="document.getElementById('pp-med-add-form').style.display='none'">Cancel</button>
        </div>
      </div>
      ${meds.length === 0
        ? `<div style="text-align:center;padding:32px;color:var(--text-tertiary);font-size:.875rem">No medications on record.</div>`
        : `<div style="overflow-x:auto"><table class="ds-table med-table" style="width:100%">
            <thead><tr><th>Medication</th><th>Dose</th><th>Frequency</th><th>Start Date</th><th>Notes</th>${editMode ? '<th></th>' : ''}</tr></thead>
            <tbody>
              ${meds.map((m, i) => `<tr>
                <td style="font-weight:500">${m.name}</td>
                <td>${m.dose || '—'}</td>
                <td>${m.frequency || '—'}</td>
                <td style="color:var(--text-secondary)">${m.startDate || '—'}</td>
                <td style="color:var(--text-tertiary);font-size:.8rem">${m.notes || '—'}</td>
                ${editMode ? `<td><button class="btn btn-sm btn-danger" onclick="window._profileDeleteMedication(${i})">&#10005;</button></td>` : ''}
              </tr>`).join('')}
            </tbody>
          </table></div>`}
    </div>`;
}

function _ppRenderAllergies(profile, editMode) {
  const allergies = profile.allergies || [];
  return `
    <div>
      ${editMode ? `<div style="margin-bottom:14px"><button class="btn btn-sm btn-primary" onclick="window._profileAddAllergy()">+ Add Allergy</button></div>` : ''}
      <div id="pp-allergy-add-form" style="display:none;background:var(--hover-bg);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px">
        <div class="g2" style="gap:10px">
          <div class="form-group"><label class="form-label">Substance</label><input id="pp-a-substance" class="form-control" placeholder="e.g. Penicillin"></div>
          <div class="form-group"><label class="form-label">Reaction</label><input id="pp-a-reaction" class="form-control" placeholder="e.g. Rash, hives"></div>
          <div class="form-group"><label class="form-label">Severity</label>
            <select id="pp-a-severity" class="form-control">
              <option>Mild</option><option>Moderate</option><option>Severe</option><option>Life-threatening</option>
            </select>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-primary btn-sm" onclick="window._profileSaveAllergy()">Save</button>
          <button class="btn btn-sm" onclick="document.getElementById('pp-allergy-add-form').style.display='none'">Cancel</button>
        </div>
      </div>
      ${allergies.length === 0
        ? `<div style="text-align:center;padding:32px;color:var(--text-tertiary);font-size:.875rem">No known allergies on record.</div>`
        : `<div style="overflow-x:auto"><table class="ds-table allergy-table" style="width:100%">
            <thead><tr><th>Substance</th><th>Reaction</th><th>Severity</th>${editMode ? '<th></th>' : ''}</tr></thead>
            <tbody>
              ${allergies.map((a, i) => `<tr>
                <td style="font-weight:500">${a.substance}</td>
                <td>${a.reaction || '—'}</td>
                <td>${_ppSeverityBadge(a.severity)}</td>
                ${editMode ? `<td><button class="btn btn-sm btn-danger" onclick="window._profileDeleteAllergy(${i})">&#10005;</button></td>` : ''}
              </tr>`).join('')}
            </tbody>
          </table></div>`}
    </div>`;
}

function _ppRenderHistory(profile, editMode) {
  const history = (profile.treatmentHistory || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  return `
    <div>
      ${editMode ? `<div style="margin-bottom:14px"><button class="btn btn-sm btn-primary" onclick="window._profileAddHistory()">+ Add Entry</button></div>` : ''}
      <div id="pp-history-add-form" style="display:none;background:var(--hover-bg);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:20px">
        <div class="g2" style="gap:10px">
          <div class="form-group"><label class="form-label">Date</label><input id="pp-h-date" class="form-control" type="date"></div>
          <div class="form-group"><label class="form-label">Type</label>
            <select id="pp-h-type" class="form-control">
              <option value="neurofeedback">Neurofeedback</option>
              <option value="TMS">TMS</option>
              <option value="tDCS">tDCS</option>
              <option value="consultation">Consultation</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Provider</label><input id="pp-h-provider" class="form-control" placeholder="e.g. Dr. Smith"></div>
          <div class="form-group"><label class="form-label">Outcome Score (0-100)</label><input id="pp-h-outcome" class="form-control" type="number" min="0" max="100" value="70"></div>
        </div>
        <div class="form-group"><label class="form-label">Notes</label><textarea id="pp-h-notes" class="form-control" rows="2" placeholder="Session notes…"></textarea></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-primary btn-sm" onclick="window._profileSaveHistory()">Save Entry</button>
          <button class="btn btn-sm" onclick="document.getElementById('pp-history-add-form').style.display='none'">Cancel</button>
        </div>
      </div>
      ${history.length === 0
        ? `<div style="text-align:center;padding:32px;color:var(--text-tertiary);font-size:.875rem">No treatment history recorded.</div>`
        : `<div class="timeline">
            ${history.map(h => `
              <div class="timeline-entry">
                <div class="timeline-entry-card">
                  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px">
                    <span style="font-size:.8rem;color:var(--text-tertiary)">${h.date}</span>
                    ${_ppTypeBadge(h.type)}
                    <span style="font-size:.8rem;color:var(--text-secondary)">&#x2014; ${h.provider || '—'}</span>
                  </div>
                  ${h.notes ? `<div style="font-size:.875rem;margin-bottom:8px">${h.notes}</div>` : ''}
                  ${h.outcome != null ? `<div style="display:flex;align-items:center;gap:8px">
                    <span style="font-size:.75rem;color:var(--text-tertiary)">Outcome</span>
                    <div style="flex:1;max-width:160px;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
                      <div style="height:6px;border-radius:3px;background:var(--accent-teal);width:${h.outcome}%;transition:width .4s"></div>
                    </div>
                    <span style="font-size:.75rem;font-weight:600;color:var(--accent-teal)">${h.outcome}%</span>
                  </div>` : ''}
                </div>
              </div>`).join('')}
          </div>`}
    </div>`;
}

function _ppRenderNotes(profile, editMode) {
  const notes = profile.notes || '';
  return `
    <div style="max-width:700px">
      <label class="form-label">Clinical Notes</label>
      <textarea id="pp-notes-area" class="form-control" rows="12" ${!editMode ? 'readonly' : ''} oninput="document.getElementById('pp-notes-count').textContent=this.value.length+' characters'">${notes}</textarea>
      <div style="font-size:.75rem;color:var(--text-tertiary);margin-top:4px" id="pp-notes-count">${notes.length} characters</div>
      ${editMode ? `<div style="margin-top:12px"><button class="btn btn-primary" onclick="window._profileSaveNotes()">Save Notes</button></div>` : ''}
    </div>`;
}

function _ppRenderAssessments(profile) {
  let runs = [];
  try { runs = JSON.parse(localStorage.getItem('ds_assessment_runs') || '[]'); } catch { runs = []; }
  const patientRuns = runs.filter(r => r && String(r.patient_id) === String(profile.id));
  const total = patientRuns.length;
  const completed = patientRuns.filter(r => r.status === 'completed');
  const overdue = patientRuns.filter(r => r.status === 'overdue');
  const lastRun = completed.length
    ? completed.slice().sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))[0]
    : null;
  const lastDate = lastRun ? new Date(lastRun.completed_at).toLocaleDateString() : '—';
  const nextScheduled = patientRuns.find(r => r.status === 'scheduled');
  const nextDate = nextScheduled ? new Date(nextScheduled.completed_at).toLocaleDateString() : '—';

  const statsRow = `
    <div class="pp-ass-stats">
      <div class="pp-ass-stat-card">
        <div class="pp-ass-stat-val">${total}</div>
        <div class="pp-ass-stat-lbl">Total Assessments</div>
      </div>
      <div class="pp-ass-stat-card">
        <div class="pp-ass-stat-val">${lastDate}</div>
        <div class="pp-ass-stat-lbl">Last Assessment</div>
      </div>
      <div class="pp-ass-stat-card">
        <div class="pp-ass-stat-val" style="color:${overdue.length > 0 ? 'var(--red)' : 'var(--text-primary)'}">${overdue.length}</div>
        <div class="pp-ass-stat-lbl">Overdue</div>
      </div>
      <div class="pp-ass-stat-card">
        <div class="pp-ass-stat-val">${nextDate}</div>
        <div class="pp-ass-stat-lbl">Next Scheduled</div>
      </div>
    </div>`;

  let tableHtml;
  if (patientRuns.length === 0) {
    tableHtml = `
      <div class="pp-ass-empty">
        <div class="pp-ass-empty-msg">No assessments recorded yet.</div>
        <button class="btn btn-primary" onclick="window._nav('assessments-hub')">Run First Assessment &#8594;</button>
      </div>`;
  } else {
    const sorted = patientRuns.slice().sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
    tableHtml = `
      <div style="overflow-x:auto">
        <table class="ds-table" style="width:100%">
          <thead>
            <tr>
              <th>Scale</th>
              <th>Date</th>
              <th>Score</th>
              <th>Timing Window</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map(r => {
              const dateStr = r.completed_at ? new Date(r.completed_at).toLocaleDateString() : '—';
              const scoreStr = (r.score != null && r.score !== '') ? String(r.score) : '—';
              const window_ = r.timing_window || '—';
              const isOverdue = r.status === 'overdue';
              const badgeStyle = isOverdue
                ? 'background:var(--red);color:#fff;padding:2px 8px;border-radius:12px;font-size:.75rem;font-weight:600'
                : 'background:var(--green);color:#fff;padding:2px 8px;border-radius:12px;font-size:.75rem;font-weight:600';
              const badgeLabel = isOverdue ? 'Overdue' : (r.status === 'completed' ? 'Completed' : (r.status || '—'));
              return `<tr>
                <td style="font-weight:500">${r.scale_name || r.scale_id || '—'}</td>
                <td style="color:var(--text-secondary)">${dateStr}</td>
                <td style="font-weight:600;color:var(--teal)">${scoreStr}</td>
                <td style="color:var(--text-tertiary);font-size:.85rem">${window_}</td>
                <td><span style="${badgeStyle}">${badgeLabel}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  return `
    <div>
      ${statsRow}
      <h3 style="font-size:.9rem;font-weight:600;color:var(--text-secondary);margin:20px 0 10px;text-transform:uppercase;letter-spacing:.04em">Scale History</h3>
      ${tableHtml}
      <div class="pp-ass-footer">
        <button class="btn btn-primary" onclick="window._nav('assessments-hub')">Open Assessments Hub &#8594;</button>
      </div>
    </div>`;
}

function _ppRenderTab(profile, tab, editMode) {
  switch (tab) {
    case 'demographics': return _ppRenderDemographics(profile, editMode);
    case 'insurance':    return _ppRenderInsurance(profile, editMode);
    case 'medications':  return _ppRenderMedications(profile, editMode);
    case 'allergies':    return _ppRenderAllergies(profile, editMode);
    case 'history':      return _ppRenderHistory(profile, editMode);
    case 'notes':        return _ppRenderNotes(profile, editMode);
    case 'assessments':  return _ppRenderAssessments(profile);
    default:             return _ppRenderDemographics(profile, editMode);
  }
}

let _ppCurrentId   = null;
let _ppCurrentTab  = 'demographics';
let _ppEditMode    = false;

function _ppRerender() {
  const profile = getPatientProfile(_ppCurrentId);
  if (!profile) return;
  const el = document.getElementById('content');
  if (!el) return;
  el.innerHTML = _ppBuildPage(profile, _ppCurrentTab, _ppEditMode);
}

function _ppBuildPage(profile, tab, editMode) {
  return `
    <div style="max-width:960px;margin:0 auto;padding-bottom:40px">
      ${_ppRenderHeader(profile, editMode)}
      ${_ppRenderTabs(tab)}
      <div id="pp-tab-content">
        ${_ppRenderTab(profile, tab, editMode)}
      </div>
    </div>`;
}

export async function pgPatientProfile(setTopbar) {
  _ppSeedProfiles();

  const requestedId = window._profilePatientId || window._selectedPatientId || null;
  const profiles    = getPatientProfiles();
  const profile     = (requestedId ? getPatientProfile(requestedId) : null) || profiles[0];

  if (!profile) {
    const _el = document.getElementById('content');
    if (_el) _el.innerHTML = `<div style="padding:48px;text-align:center;color:var(--text-tertiary)">No patient profile found.</div>`;
    return;
  }

  _ppCurrentId  = profile.id;
  _ppCurrentTab = 'demographics';
  _ppEditMode   = false;

  setTopbar('Patient Profile', `<button class="btn btn-sm" onclick="window._nav('patients')">&#8592; All Patients</button>`);

  const el = document.getElementById('content');
  el.innerHTML = _ppBuildPage(profile, _ppCurrentTab, _ppEditMode);

  // ── Global handlers ──────────────────────────────────────────────────────

  window._profileTab = function(name) {
    _ppCurrentTab = name;
    const p = getPatientProfile(_ppCurrentId);
    if (!p) return;
    document.getElementById('pp-tab-content').innerHTML = _ppRenderTab(p, name, _ppEditMode);
    // Re-sync tab button active states
    document.querySelectorAll('[role="tab"]').forEach(btn => {
      const active = btn.textContent.toLowerCase().includes(name) ||
        (name === 'history' && btn.textContent.includes('History')) ||
        (name === 'demographics' && btn.textContent === 'Demographics') ||
        (name === 'insurance' && btn.textContent === 'Insurance') ||
        (name === 'medications' && btn.textContent === 'Medications') ||
        (name === 'allergies' && btn.textContent === 'Allergies') ||
        (name === 'notes' && btn.textContent === 'Notes') ||
        (name === 'assessments' && btn.textContent === 'Assessments');
      btn.style.borderBottomColor = active ? 'var(--accent-teal)' : 'transparent';
      btn.style.fontWeight        = active ? '600' : '400';
      btn.style.color             = active ? 'var(--accent-teal)' : 'var(--text-secondary)';
    });
  };

  window._profileToggleEdit = function() {
    _ppEditMode = !_ppEditMode;
    _ppRerender();
  };

  window._profileUploadPhoto = function() {
    document.getElementById('pp-photo-input')?.click();
  };

  window._profileHandlePhoto = function(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const p = getPatientProfile(_ppCurrentId);
      if (!p) return;
      p.photoDataUrl = e.target.result;
      savePatientProfile(p);
      const wrap = document.getElementById('pp-avatar-wrap');
      if (wrap) wrap.innerHTML = _ppAvatarHTML(p);
    };
    reader.readAsDataURL(file);
  };

  window._profileHandleCardScan = function(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const p = getPatientProfile(_ppCurrentId);
      if (!p) return;
      p.insurance = p.insurance || {};
      p.insurance.scanDataUrl = e.target.result;
      savePatientProfile(p);
      const preview = document.getElementById('pp-card-preview');
      if (preview) preview.innerHTML = `<img src="${e.target.result}" alt="Insurance card" style="width:100%;height:100%;object-fit:contain">`;
    };
    reader.readAsDataURL(file);
  };

  window._profileSaveDemographics = async function() {
    const p = getPatientProfile(_ppCurrentId);
    if (!p) return;
    p.name    = document.getElementById('pp-d-name')?.value  || p.name;
    p.dob     = document.getElementById('pp-d-dob')?.value   || p.dob;
    p.gender  = document.getElementById('pp-d-gender')?.value || p.gender;
    p.phone   = document.getElementById('pp-d-phone')?.value || p.phone;
    p.email   = document.getElementById('pp-d-email')?.value || p.email;
    p.address = document.getElementById('pp-d-address')?.value || '';
    p.emergencyContact = {
      name:         document.getElementById('pp-d-ec-name')?.value  || '',
      phone:        document.getElementById('pp-d-ec-phone')?.value || '',
      relationship: document.getElementById('pp-d-ec-rel')?.value   || '',
    };
    savePatientProfile(p);
    _ppEditMode = false;
    _ppRerender();
    window._announce?.('Demographics saved');
    // ── Sync core fields to backend ────────────────────────────────────────
    const nameParts = (p.name || '').trim().split(/\s+/);
    const backendData = {
      first_name: nameParts[0] || '',
      last_name:  nameParts.slice(1).join(' ') || '',
      dob:        p.dob    || undefined,
      email:      p.email  || undefined,
      phone:      p.phone  || undefined,
      gender:     p.gender || undefined,
    };
    try {
      await api.updatePatient(_ppCurrentId, backendData);
      window._showNotifToast?.({ title: 'Saved', body: 'Patient profile updated.', severity: 'success' });
    } catch(e) {
      window._showNotifToast?.({ title: 'Save failed', body: e.message || 'Could not sync to server.', severity: 'warn' });
    }
  };

  window._profileSaveInsurance = function() {
    const p = getPatientProfile(_ppCurrentId);
    if (!p) return;
    p.insurance = {
      ...(p.insurance || {}),
      payer:    document.getElementById('pp-i-payer')?.value  || '',
      memberId: document.getElementById('pp-i-member')?.value || '',
      groupId:  document.getElementById('pp-i-group')?.value  || '',
      copay:    document.getElementById('pp-i-copay')?.value  || '',
    };
    savePatientProfile(p);
    _ppEditMode = false;
    _ppRerender();
    window._announce?.('Insurance saved');
  };

  window._profileAddMedication = function() {
    const form = document.getElementById('pp-med-add-form');
    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
  };

  window._profileSaveMedication = function() {
    const name = document.getElementById('pp-m-name')?.value?.trim();
    if (!name) return;
    const p = getPatientProfile(_ppCurrentId);
    if (!p) return;
    p.medications = p.medications || [];
    p.medications.push({
      name,
      dose:      document.getElementById('pp-m-dose')?.value  || '',
      frequency: document.getElementById('pp-m-freq')?.value  || '',
      startDate: document.getElementById('pp-m-start')?.value || '',
      notes:     document.getElementById('pp-m-notes')?.value || '',
    });
    savePatientProfile(p);
    document.getElementById('pp-tab-content').innerHTML = _ppRenderMedications(p, _ppEditMode);
    window._announce?.('Medication added');
  };

  window._profileDeleteMedication = function(idx) {
    const p = getPatientProfile(_ppCurrentId);
    if (!p) return;
    p.medications = (p.medications || []).filter((_, i) => i !== idx);
    savePatientProfile(p);
    document.getElementById('pp-tab-content').innerHTML = _ppRenderMedications(p, _ppEditMode);
  };

  window._profileAddAllergy = function() {
    const form = document.getElementById('pp-allergy-add-form');
    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
  };

  window._profileSaveAllergy = function() {
    const substance = document.getElementById('pp-a-substance')?.value?.trim();
    if (!substance) return;
    const p = getPatientProfile(_ppCurrentId);
    if (!p) return;
    p.allergies = p.allergies || [];
    p.allergies.push({
      substance,
      reaction: document.getElementById('pp-a-reaction')?.value  || '',
      severity: document.getElementById('pp-a-severity')?.value  || 'Mild',
    });
    savePatientProfile(p);
    document.getElementById('pp-tab-content').innerHTML = _ppRenderAllergies(p, _ppEditMode);
    window._announce?.('Allergy added');
  };

  window._profileDeleteAllergy = function(idx) {
    const p = getPatientProfile(_ppCurrentId);
    if (!p) return;
    p.allergies = (p.allergies || []).filter((_, i) => i !== idx);
    savePatientProfile(p);
    document.getElementById('pp-tab-content').innerHTML = _ppRenderAllergies(p, _ppEditMode);
  };

  window._profileAddHistory = function() {
    const form = document.getElementById('pp-history-add-form');
    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
  };

  window._profileSaveHistory = function() {
    const date = document.getElementById('pp-h-date')?.value;
    if (!date) return;
    const p = getPatientProfile(_ppCurrentId);
    if (!p) return;
    p.treatmentHistory = p.treatmentHistory || [];
    p.treatmentHistory.push({
      date,
      type:     document.getElementById('pp-h-type')?.value     || 'consultation',
      provider: document.getElementById('pp-h-provider')?.value || '',
      notes:    document.getElementById('pp-h-notes')?.value    || '',
      outcome:  parseInt(document.getElementById('pp-h-outcome')?.value || '70', 10),
    });
    savePatientProfile(p);
    document.getElementById('pp-tab-content').innerHTML = _ppRenderHistory(p, _ppEditMode);
    window._announce?.('Treatment entry added');
  };

  window._profileSaveNotes = function() {
    const p = getPatientProfile(_ppCurrentId);
    if (!p) return;
    p.notes = document.getElementById('pp-notes-area')?.value || '';
    savePatientProfile(p);
    _ppEditMode = false;
    _ppRerender();
    window._announce?.('Notes saved');
  };

  window._profileAddFlag = function(flag) {
    const p = getPatientProfile(_ppCurrentId);
    if (!p) return;
    p.flags = p.flags || [];
    if (!p.flags.includes(flag)) {
      p.flags.push(flag);
      savePatientProfile(p);
      _ppRerender();
    }
  };

  window._profileRemoveFlag = function(flag) {
    const p = getPatientProfile(_ppCurrentId);
    if (!p) return;
    p.flags = (p.flags || []).filter(f => f !== flag);
    savePatientProfile(p);
    _ppRerender();
  };

  // ── Quick "Add Note" action from profile header ──────────────────────────
  window._ppAddNoteQuick = function(patientId) {
    _ppCurrentTab = 'notes';
    _ppEditMode   = true;
    const p = getPatientProfile(patientId || _ppCurrentId);
    if (!p) return;
    document.getElementById('pp-tab-content').innerHTML = _ppRenderTab(p, 'notes', true);
    document.querySelectorAll('[role="tab"]').forEach(btn => {
      const isNotes = btn.textContent.trim() === 'Notes';
      btn.style.borderBottomColor = isNotes ? 'var(--accent-teal)' : 'transparent';
      btn.style.fontWeight        = isNotes ? '600' : '400';
      btn.style.color             = isNotes ? 'var(--accent-teal)' : 'var(--text-secondary)';
    });
    document.getElementById('pp-notes-area')?.focus();
    window._announce?.('Notes tab open — begin typing');
  };
}

// ── Advanced Search ──────────────────────────────────────────────────────────

// ── Saved searches store ──────────────────────────────────────────────────────
const SAVED_SEARCHES_KEY = 'ds_saved_searches';

function getSavedSearches() {
  try { return JSON.parse(localStorage.getItem(SAVED_SEARCHES_KEY) || '[]'); } catch { return []; }
}

function saveSearch(query, filters, resultCount) {
  const list = getSavedSearches();
  const entry = {
    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2),
    query,
    filters: filters || {},
    resultCount,
    savedAt: new Date().toISOString(),
    label: query + (filters?.types?.length ? ' [' + filters.types.join(',') + ']' : ''),
  };
  list.unshift(entry);
  try { localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(list.slice(0, 20))); } catch { /* quota */ }
  return entry;
}

function deleteSavedSearch(id) {
  const list = getSavedSearches().filter(s => s.id !== id);
  try { localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(list)); } catch { /* quota */ }
}

// ── Search index builder ──────────────────────────────────────────────────────
function buildSearchIndex() {
  const records = [];

  // ── Patients ───────────────────────────────────────────────────────────────
  try {
    const raw = JSON.parse(localStorage.getItem('ds_patients') || '[]');
    raw.forEach(p => {
      if (!p) return;
      const name = p.name || [p.first_name, p.last_name].filter(Boolean).join(' ') || ('Patient #' + p.id);
      records.push({
        id: String(p.id || Math.random()),
        type: 'patient',
        title: name,
        subtitle: p.condition || p.primary_condition || p.diagnosis || '',
        tags: [p.condition || p.primary_condition, p.status, p.gender].filter(Boolean),
        preview: [p.email, p.phone, p.notes].filter(Boolean).join(' · ').slice(0, 200),
        navTarget: 'patient-profile',
        navParam: { _profilePatientId: p.id },
        date: p.created_at || p.dob || '',
      });
    });
  } catch (_e) { /* resilient */ }

  // ── SOAP Notes ─────────────────────────────────────────────────────────────
  try {
    const notesObj = JSON.parse(localStorage.getItem('ds_soap_notes') || '{}');
    Object.entries(notesObj).forEach(([key, note]) => {
      if (!note) return;
      const title = note.patientName ? ('SOAP: ' + note.patientName) : ('SOAP Note #' + key);
      records.push({
        id: 'soap_' + key,
        type: 'note',
        title,
        subtitle: note.condition || note.session || '',
        tags: ['soap', note.condition, note.clinician].filter(Boolean),
        preview: [note.subjective, note.objective, note.assessment, note.plan].filter(Boolean).join(' ').slice(0, 200),
        navTarget: 'clinical-notes',
        navParam: {},
        date: note.updatedAt || note.createdAt || '',
      });
    });
  } catch (_e) { /* resilient */ }

  // ── Protocols ──────────────────────────────────────────────────────────────
  try {
    const protos = JSON.parse(localStorage.getItem('ds_protocols') || '[]');
    protos.forEach(p => {
      if (!p) return;
      records.push({
        id: String(p.id || Math.random()),
        type: 'protocol',
        title: p.name || p.title || ('Protocol #' + p.id),
        subtitle: [p.condition, p.modality].filter(Boolean).join(' · '),
        tags: [p.condition, p.modality, p.status, p.type].filter(Boolean),
        preview: p.description || p.notes || '',
        navTarget: 'protocol-wizard',
        navParam: { _selectedProtocolId: p.id },
        date: p.created_at || p.updatedAt || '',
      });
    });
  } catch (_e) { /* resilient */ }

  // ── Completed sessions ─────────────────────────────────────────────────────
  try {
    const sessions = JSON.parse(localStorage.getItem('ds_completed_sessions') || '[]');
    sessions.forEach(s => {
      if (!s) return;
      records.push({
        id: 'sess_' + (s.id || Math.random()),
        type: 'session',
        title: s.patientName ? ('Session: ' + s.patientName) : ('Session #' + (s.sessionNumber || s.id)),
        subtitle: [s.condition, s.modality, s.status].filter(Boolean).join(' · '),
        tags: [s.condition, s.modality, s.status].filter(Boolean),
        preview: s.notes || s.clinician || '',
        navTarget: 'session-execution',
        navParam: {},
        date: s.completedAt || s.date || '',
      });
    });
  } catch (_e) { /* resilient */ }

  // ── Appointments ───────────────────────────────────────────────────────────
  try {
    const appts = JSON.parse(localStorage.getItem('ds_appointments') || '[]');
    appts.forEach(a => {
      if (!a) return;
      records.push({
        id: 'appt_' + (a.id || Math.random()),
        type: 'session',
        title: a.patientName ? ('Appt: ' + a.patientName) : ('Appointment ' + (a.date || '')),
        subtitle: [a.type, a.clinician].filter(Boolean).join(' · '),
        tags: [a.type, a.status].filter(Boolean),
        preview: a.notes || '',
        navTarget: 'calendar',
        navParam: {},
        date: a.date || a.time || '',
      });
    });
  } catch (_e) { /* resilient */ }

  // ── Invoices ───────────────────────────────────────────────────────────────
  try {
    const invoices = JSON.parse(localStorage.getItem('ds_invoices') || '[]');
    invoices.forEach(inv => {
      if (!inv) return;
      records.push({
        id: 'inv_' + (inv.id || Math.random()),
        type: 'invoice',
        title: inv.patientName ? ('Invoice: ' + inv.patientName) : ('Invoice #' + (inv.id || inv.number)),
        subtitle: [inv.status, inv.amount ? ('$' + inv.amount) : null].filter(Boolean).join(' · '),
        tags: [inv.status, inv.type].filter(Boolean),
        preview: inv.description || inv.notes || '',
        navTarget: 'billing',
        navParam: {},
        date: inv.date || inv.createdAt || '',
      });
    });
  } catch (_e) { /* resilient */ }

  // ── QA Reviews ─────────────────────────────────────────────────────────────
  try {
    const reviews = JSON.parse(localStorage.getItem('ds_qa_reviews') || '[]');
    reviews.forEach(r => {
      if (!r) return;
      records.push({
        id: 'qa_' + (r.id || Math.random()),
        type: 'qa-review',
        title: r.title || ('QA Review: ' + (r.patientName || r.clinician || r.id)),
        subtitle: [r.status, r.reviewer].filter(Boolean).join(' · '),
        tags: [r.status, r.type, r.flagged ? 'flagged' : null].filter(Boolean),
        preview: r.notes || r.findings || '',
        navTarget: 'quality-assurance',
        navParam: {},
        date: r.date || r.createdAt || '',
      });
    });
  } catch (_e) { /* resilient */ }

  // ── Referrals ──────────────────────────────────────────────────────────────
  try {
    const referrals = JSON.parse(localStorage.getItem('ds_referrals') || '[]');
    referrals.forEach(ref => {
      if (!ref) return;
      records.push({
        id: 'ref_' + (ref.id || Math.random()),
        type: 'referral',
        title: ref.patientName ? ('Referral: ' + ref.patientName) : ('Referral #' + ref.id),
        subtitle: [ref.speciality || ref.specialty, ref.status].filter(Boolean).join(' · '),
        tags: [ref.status, ref.priority, ref.speciality || ref.specialty].filter(Boolean),
        preview: ref.reason || ref.notes || '',
        navTarget: 'referrals',
        navParam: {},
        date: ref.date || ref.createdAt || '',
      });
    });
  } catch (_e) { /* resilient */ }

  // ── Intake submissions ─────────────────────────────────────────────────────
  try {
    const intakes = JSON.parse(localStorage.getItem('ds_intake_submissions') || '[]');
    intakes.forEach(sub => {
      if (!sub) return;
      records.push({
        id: 'intake_' + (sub.id || Math.random()),
        type: 'intake',
        title: sub.patientName || sub.name || ('Intake #' + sub.id),
        subtitle: sub.status || 'submitted',
        tags: ['intake', sub.status].filter(Boolean),
        preview: sub.chiefComplaint || sub.notes || '',
        navTarget: 'intake',
        navParam: {},
        date: sub.submittedAt || sub.createdAt || '',
      });
    });
  } catch (_e) { /* resilient */ }

  return records;
}

// ── Search algorithm ──────────────────────────────────────────────────────────
function searchIndex(query, index, filters) {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  return index
    .filter(r => !filters?.types?.length || filters.types.includes(r.type))
    .filter(r => {
      if (!filters?.dateFrom && !filters?.dateTo) return true;
      if (!r.date) return true;
      const d = r.date.slice(0, 10);
      if (filters.dateFrom && d < filters.dateFrom) return false;
      if (filters.dateTo && d > filters.dateTo) return false;
      return true;
    })
    .filter(r => {
      if (!filters?.tags) return true;
      const tagQ = filters.tags.toLowerCase();
      return r.tags?.some(t => t?.toLowerCase().includes(tagQ));
    })
    .map(r => {
      let score = 0;
      if (r.title.toLowerCase() === q) score += 100;
      else if (r.title.toLowerCase().includes(q)) score += 70;
      if (r.subtitle?.toLowerCase().includes(q)) score += 50;
      if (r.tags?.some(t => t?.toLowerCase().includes(q))) score += 40;
      if (r.preview?.toLowerCase().includes(q)) score += 20;
      return { record: r, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);
}

// ── Highlight helper ──────────────────────────────────────────────────────────
function _hlMark(text, query) {
  if (!text || !query) return text || '';
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp('(' + escaped + ')', 'gi'), '<mark>$1</mark>');
}

// ── Type badge colors ─────────────────────────────────────────────────────────
