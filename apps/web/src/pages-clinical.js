import { api, downloadBlob } from './api.js';
import { cardWrap, fr, evBar, pillSt, initials, tag, spinner, emptyState, spark, brainMapSVG, evidenceBadge, labelBadge, approvalBadge, safetyBadge, govFlag } from './helpers.js';
import { currentUser } from './auth.js';
import { FALLBACK_CONDITIONS, FALLBACK_MODALITIES, FALLBACK_ASSESSMENT_TEMPLATES, COURSE_STATUS_COLORS } from './constants.js';
import { renderHomeTherapyTab, bindHomeTherapyActions } from './pages-home-therapy.js';

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

function _dOutcomeCell(label, value, color, sub) {
  return `<div style="padding:12px 14px;border-bottom:1px solid var(--border);border-right:1px solid var(--border)">
    <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;color:var(--text-tertiary);font-weight:600;margin-bottom:5px">${label}</div>
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

  setTopbar('Dashboard',
    `<button class="btn btn-primary btn-sm" onclick="window._nav('session-execution')" style="white-space:nowrap">&#9647; Start Session</button>`
  );

  const el = document.getElementById('content');
  el.innerHTML = spinner();

  // ── Load all data in parallel ──────────────────────────────────────────────
  let allPatients = [], allCourses = [], pendingQueue = [], aes = [], outcomeSummary = null, allProtocols = [], allConsents = [];
  let allMediaItems = [];
  let wearableAlertSummary = null;
  try {
    const [ptsRes, coursesRes, queueRes, aeRes, outRes, protocolsRes, consentsRes, mediaQueueRes, wearableAlertsRes] = await Promise.all([
      api.listPatients().catch(() => null),
      api.listCourses().catch(() => null),
      api.listReviewQueue({ status: 'pending' }).catch(() => null),
      api.listAdverseEvents().catch(() => null),
      api.aggregateOutcomes().catch(() => null),
      api.protocols({ limit: 20 }).catch(() => null),
      api.listConsents().catch(() => null),
      api.listMediaQueue().catch(() => null),
      api.getClinicAlertSummary().catch(() => null),
    ]);
    if (ptsRes)       allPatients    = ptsRes.items || [];
    if (coursesRes)   allCourses     = coursesRes.items || [];
    if (queueRes)     pendingQueue   = queueRes.items || [];
    if (aeRes)        aes            = aeRes.items || [];
    if (outRes)       outcomeSummary = outRes;
    if (protocolsRes) allProtocols   = protocolsRes.items || [];
    if (consentsRes)  allConsents    = consentsRes.items || [];
    if (mediaQueueRes) allMediaItems = Array.isArray(mediaQueueRes) ? mediaQueueRes : (mediaQueueRes.items || []);
    if (wearableAlertsRes) wearableAlertSummary = wearableAlertsRes;
  } catch {}

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
  const _assessRuns = JSON.parse(localStorage.getItem('ds_assessment_runs') || '[]');
  const _now = Date.now();
  const _weekMs = 7 * 24 * 3600 * 1000;
  const _lastAssessMap = {};
  _assessRuns.forEach(r => {
    const key = r.patient_id || 'unknown';
    const t = r.completed_at ? new Date(r.completed_at).getTime() : 0;
    if (!_lastAssessMap[key] || t > _lastAssessMap[key]) _lastAssessMap[key] = t;
  });
  const assessmentsDueCount = activePatientIds.filter(id => {
    const last = _lastAssessMap[id] || 0;
    return (_now - last) > _weekMs;
  }).length;

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

  // ── Fresh install card ─────────────────────────────────────────────────
  const _isFirstRun = patCount === 0 && allCourses.length === 0 && !localStorage.getItem('ds_setup_dismissed');
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

  // ── ROW 1: Today at a Glance + Urgent Items + Quick Actions ─────────────────
  const _todayStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  const _totalUrgent = seriousAEs.length + (wearableUrgentCount || 0) + mediaNeedsAttention.filter(i => i.flagged_urgent).length;
  const _totalActions = pendingQueue.length + openAEs.length + consentAlertCount + mediaNeedsAttention.length + patientsNeedingAttention.length;

  const glanceCard = `<div class="card" style="overflow:hidden">
    <div style="padding:13px 16px 10px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
      <span class="card-section-label">Today at a Glance</span>
      <span style="font-size:11px;color:var(--text-tertiary)">${_todayStr}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-bottom:1px solid var(--border)">
      ${_dOutcomeCell('Active Patients', activePatientIds.length, 'var(--teal)', 'In treatment')}
      ${_dOutcomeCell('Active Courses', activeCourses.length, 'var(--blue)', sessionsPerWeek + ' sessions/wk')}
      ${_dOutcomeCell('Pending Reviews', pendingQueue.length, pendingQueue.length > 0 ? 'var(--amber)' : 'var(--green)', pendingQueue.length > 0 ? 'Action required' : 'Queue clear')}
    </div>
    <div style="padding:10px 14px 6px">
      <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.6">
        ${activeCourses.length === 0 && patCount === 0
          ? 'No patients or courses yet. Add your first patient to get started.'
          : _totalUrgent > 0
          ? `<span style="color:var(--red);font-weight:600">${_totalUrgent} urgent item${_totalUrgent > 1 ? 's' : ''}</span> need immediate attention.${patientsNeedingAttention.length > 0 ? ` ${patientsNeedingAttention.length} patient${patientsNeedingAttention.length > 1 ? 's' : ''} flagged.` : ''}${pendingQueue.length > 0 ? ` ${pendingQueue.length} approval${pendingQueue.length > 1 ? 's' : ''} pending.` : ''}`
          : _totalActions > 0
          ? `${activeCourses.length} active course${activeCourses.length !== 1 ? 's' : ''} running. ${_totalActions} item${_totalActions > 1 ? 's' : ''} need attention today.`
          : `${activeCourses.length} active course${activeCourses.length !== 1 ? 's' : ''}. Responder rate: ${responderRate}. All queues clear.`
        }
      </div>
    </div>
    ${_totalActions > 0 ? `<div style="padding:4px 14px 10px;display:flex;gap:6px;flex-wrap:wrap">
      ${pendingQueue.length > 0 ? `<button class="btn btn-sm" style="font-size:10.5px;color:var(--amber);border-color:rgba(255,181,71,0.35)" onclick="window._nav('review-queue')">${pendingQueue.length} approval${pendingQueue.length > 1 ? 's' : ''} &#x2192;</button>` : ''}
      ${seriousAEs.length > 0 ? `<button class="btn btn-sm" style="font-size:10.5px;color:var(--red);border-color:rgba(255,107,107,0.35)" onclick="window._nav('adverse-events')">${seriousAEs.length} serious AE${seriousAEs.length > 1 ? 's' : ''} &#x2192;</button>` : ''}
      ${mediaNeedsAttention.length > 0 ? `<button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('media-queue')">${mediaNeedsAttention.length} media item${mediaNeedsAttention.length > 1 ? 's' : ''} &#x2192;</button>` : ''}
      ${wearableUrgentCount > 0 ? `<button class="btn btn-sm" style="font-size:10.5px;color:var(--red);border-color:rgba(255,107,107,0.35)" onclick="window._nav('wearables')">${wearableUrgentCount} wearable alert${wearableUrgentCount > 1 ? 's' : ''} &#x2192;</button>` : ''}
    </div>` : ''}
  </div>`;

  const _urgentItems = [
    { show: seriousAEs.length > 0,              icon: '&#x26A1;', label: 'Serious Adverse Events', count: seriousAEs.length,              color: 'var(--red)',   nav: 'adverse-events' },
    { show: wearableUrgentCount > 0,             icon: '&#9676;',  label: 'Urgent Wearable Alerts', count: wearableUrgentCount,            color: 'var(--red)',   nav: 'wearables' },
    { show: mediaUrgent > 0,                     icon: '&#9873;',  label: 'Urgent Media',           count: mediaUrgent,                    color: 'var(--red)',   nav: 'media-queue' },
    { show: pendingQueue.length > 0,             icon: '&#9649;',  label: 'Pending Approvals',      count: pendingQueue.length,            color: 'var(--amber)', nav: 'review-queue' },
    { show: openAEs.length > 0,                  icon: '&#9888;',  label: 'Open Adverse Events',    count: openAEs.length,                 color: 'var(--amber)', nav: 'adverse-events' },
    { show: consentAlertCount > 0,               icon: '&#9678;',  label: 'Consent Alerts',         count: consentAlertCount,              color: 'var(--amber)', nav: 'patients' },
    { show: patientsNeedingAttention.length > 0, icon: '&#9888;',  label: 'Patients Flagged',       count: patientsNeedingAttention.length, color: 'var(--amber)', nav: 'patients' },
    { show: flaggedCourses.length > 0,           icon: '&#9888;',  label: 'Safety Flags',           count: flaggedCourses.length,          color: 'var(--amber)', nav: 'review-queue' },
  ].filter(i => i.show);

  const urgentCard = `<div class="card" style="overflow:hidden">
    <div style="padding:13px 16px 10px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">
      <span class="card-section-label">Urgent Items</span>
      ${_urgentItems.length > 0
        ? `<span style="font-size:10px;font-weight:700;color:var(--red);background:rgba(255,107,107,0.12);border:1px solid rgba(255,107,107,0.25);border-radius:4px;padding:1px 7px">${_urgentItems.length} active</span>`
        : `<span style="font-size:11px;color:var(--green)">&#x2713; All clear</span>`
      }
    </div>
    ${_urgentItems.length === 0
      ? `<div style="padding:20px 16px;text-align:center;font-size:12px;color:var(--text-tertiary)">No urgent items. All queues clear.</div>`
      : _urgentItems.map(i => `<div style="display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid var(--border);cursor:pointer"
          onclick="window._nav('${i.nav}')"
          onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background=''">
        <span style="font-size:13px;flex-shrink:0">${i.icon}</span>
        <span style="flex:1;font-size:12px;font-weight:500;color:var(--text-primary)">${i.label}</span>
        <span style="font-size:12px;font-weight:700;color:${i.color};font-family:var(--font-mono)">${i.count}</span>
        <span style="color:var(--text-tertiary);font-size:11px">&#x2192;</span>
      </div>`).join('')
    }
  </div>`;

  const _quickActions6 = [
    { icon: '&#9647;', label: 'Start Session',  page: 'session-execution', color: 'var(--teal)',   primary: true },
    { icon: '&#9673;', label: 'Add Patient',    page: 'patients',          color: 'var(--blue)',   primary: false },
    { icon: '&#9678;', label: 'Create Course',  page: 'protocol-wizard',   color: 'var(--violet)', primary: false },
    { icon: '&#9649;', label: 'Review Queue',   page: 'review-queue',      color: pendingQueue.length > 0 ? 'var(--amber)' : 'var(--text-secondary)', primary: false },
    { icon: '&#9643;', label: 'Record Outcome', page: 'outcomes',          color: 'var(--green)',  primary: false },
    { icon: '&#9676;', label: 'Add Note',       page: 'notes-dictation',   color: 'var(--amber)',  primary: false },
  ];

  const quickActionsCard = `<div class="card" style="overflow:hidden">
    <div style="padding:13px 16px 10px;border-bottom:1px solid var(--border)">
      <span class="card-section-label">Quick Actions</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border)">
      ${_quickActions6.map(a => `<div onclick="window._nav('${a.page}')" style="padding:12px 14px;background:var(--bg-card);cursor:pointer;transition:background 0.15s;display:flex;align-items:center;gap:10px"
           onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background='var(--bg-card)'">
        <span style="font-size:16px;color:${a.color};flex-shrink:0">${a.icon}</span>
        <span style="font-size:12px;font-weight:${a.primary ? '700' : '500'};color:${a.primary ? 'var(--teal)' : 'var(--text-primary)'}">${a.label}</span>
      </div>`).join('')}
    </div>
  </div>`;

  const row1 = `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px;align-items:start">${glanceCard}${urgentCard}${quickActionsCard}</div>`;

  // ── ROW 2: Today's Clinic Queue (wide) + Upcoming Sessions ────────────────
  const _queueRowItem = c => {
    const dotColor = { active: 'var(--teal)', paused: 'var(--amber)', pending: 'var(--blue)', approved: 'var(--violet)' }[c._qStatus] || 'var(--text-tertiary)';
    const hasFlag = (c.governance_warnings || []).length > 0;
    const hasSeriousAE = seriousAEs.some(a => a.patient_id === c.patient_id);
    const pct = c.planned_sessions_total > 0 ? Math.min(100, Math.round((c.sessions_delivered || 0) / c.planned_sessions_total * 100)) : 0;
    const cid = (c.id || '').replace(/['"]/g, '');
    const actionBtn = c._qStatus === 'active'
      ? `<button class="btn btn-sm" style="font-size:10px;padding:2px 8px;flex-shrink:0;color:var(--teal);border-color:rgba(0,212,188,0.35)" onclick="event.stopPropagation();window._startCourseSession('${cid}')">Execute &#x2192;</button>`
      : c._qStatus === 'pending'
      ? `<button class="btn btn-sm" style="font-size:10px;padding:2px 8px;flex-shrink:0;color:var(--amber)" onclick="event.stopPropagation();window._nav('review-queue')">Review &#x2192;</button>`
      : c._qStatus === 'approved'
      ? `<button class="btn btn-sm" style="font-size:10px;padding:2px 8px;flex-shrink:0;color:var(--violet)" onclick="event.stopPropagation();window._startCourseSession('${cid}')">Start &#x2192;</button>`
      : `<span style="font-size:10px;color:var(--amber);flex-shrink:0">Paused</span>`;
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 16px;border-bottom:1px solid var(--border);cursor:pointer"
        onclick="window._openCourse('${cid}')"
        onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background=''">
      ${hasSeriousAE ? `<span style="color:var(--red);font-size:12px;flex-shrink:0">&#x26A1;</span>`
        : hasFlag ? `<span style="color:var(--amber);font-size:12px;flex-shrink:0">&#9888;</span>`
        : `<span style="width:6px;height:6px;border-radius:50%;background:${dotColor};flex-shrink:0;display:inline-block"></span>`
      }
      <div style="flex:1;min-width:0">
        <div style="font-size:12.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${c._patientName ? `<span style="color:var(--text-secondary)">${c._patientName}</span> &middot; ` : ''}${(c.condition_slug || '—').replace(/-/g, ' ')}
        </div>
        <div style="font-size:10.5px;color:var(--text-tertiary);display:flex;align-items:center;gap:5px;margin-top:1px">
          <span style="color:var(--teal)">${c.modality_slug || '—'}</span>
          <span>&middot; ${c.sessions_delivered || 0}/${c.planned_sessions_total || '?'}</span>
          <div style="flex:1;max-width:60px;height:3px;border-radius:2px;background:var(--border)"><div style="height:3px;border-radius:2px;background:${dotColor};width:${pct}%"></div></div>
          <span>${pct}%</span>
        </div>
      </div>
      ${actionBtn}
    </div>`;
  };

  const clinicQueueCard = `<div class="card" style="overflow:hidden">
    <div style="padding:13px 16px 10px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:8px">
        <span class="card-section-label">Today's Clinic Queue</span>
        <span style="font-size:11px;color:var(--text-tertiary)">${clinicQueue.length} course${clinicQueue.length !== 1 ? 's' : ''}</span>
      </div>
      <button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('courses')">All Courses &#x2192;</button>
    </div>
    ${clinicQueue.length === 0
      ? `<div style="padding:32px 16px;text-align:center">
          <div style="font-size:11.5px;color:var(--text-tertiary);margin-bottom:10px">No active courses yet.</div>
          <button class="btn btn-sm" onclick="window._nav('protocol-wizard')">Create Course &#x2192;</button>
        </div>`
      : clinicQueue.map(_queueRowItem).join('')
    }
  </div>`;

  const _upcomingCourses = activeCourses
    .filter(c => (c.planned_sessions_per_week || 0) > 0)
    .sort((a, b) => (a.sessions_delivered || 0) - (b.sessions_delivered || 0))
    .slice(0, 5);

  const upcomingCard = `<div class="card" style="overflow:hidden">
    <div style="padding:13px 16px 10px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)">
      <span class="card-section-label">Upcoming Sessions</span>
      <button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('session-execution')">Start &#x2192;</button>
    </div>
    ${_upcomingCourses.length === 0
      ? `<div style="padding:24px 16px;text-align:center;font-size:12px;color:var(--text-tertiary)">No sessions scheduled.<br><button class="btn btn-sm" style="margin-top:8px" onclick="window._nav('protocol-wizard')">Create Course &#x2192;</button></div>`
      : _upcomingCourses.map(c => {
          const cid = (c.id || '').replace(/['"]/g, '');
          const sessLeft = Math.max(0, (c.planned_sessions_total || 0) - (c.sessions_delivered || 0));
          return `<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--border);cursor:pointer"
              onclick="window._openCourse('${cid}')"
              onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background=''">
            <div style="width:28px;height:28px;border-radius:6px;background:rgba(0,212,188,0.1);display:flex;align-items:center;justify-content:center;font-size:13px;color:var(--teal);flex-shrink:0">&#9647;</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c._patientName || '—'}</div>
              <div style="font-size:10.5px;color:var(--text-tertiary)">${c.modality_slug || '—'} &middot; ${sessLeft} session${sessLeft !== 1 ? 's' : ''} left</div>
            </div>
            <button class="btn btn-sm" style="font-size:10px;padding:2px 8px;flex-shrink:0;color:var(--teal);border-color:rgba(0,212,188,0.35)" onclick="event.stopPropagation();window._startCourseSession('${cid}')">Start &#x2192;</button>
          </div>`;
        }).join('')
    }
  </div>`;

  const row2 = `<div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:12px;align-items:start">${clinicQueueCard}${upcomingCard}</div>`;

  // ── ROW 3: Patients Needing Attention + Review & Governance + Outcomes ────
  const attentionCard = `<div class="card" style="overflow:hidden">
    <div style="padding:13px 16px 10px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border)">
      <span class="card-section-label">Patients Needing Attention</span>
      ${patientsNeedingAttention.length > 0
        ? `<span style="font-size:10px;font-weight:700;color:var(--amber);background:rgba(255,181,71,0.1);border:1px solid rgba(255,181,71,0.25);border-radius:4px;padding:1px 7px">${patientsNeedingAttention.length}</span>`
        : ''}
    </div>
    ${patientsNeedingAttention.length === 0
      ? `<div style="padding:20px 16px;text-align:center;font-size:12px;color:var(--text-tertiary)">All patients on track.</div>`
      : patientsNeedingAttention.map(({ id, pt }) => {
          const reason = _attentionReason(id);
          const ptActiveCourse = activeCourses.find(c => c.patient_id === id);
          const cid = ptActiveCourse ? (ptActiveCourse.id || '').replace(/['"]/g, '') : '';
          return `<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--border);cursor:pointer"
              onclick="window.openPatient('${id}')"
              onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background=''">
            <div class="avatar" style="width:28px;height:28px;font-size:10px;flex-shrink:0">${initials((pt.first_name || '') + ' ' + (pt.last_name || ''))}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:500">${pt.first_name || ''} ${pt.last_name || ''}</div>
              <div style="font-size:10px;color:${reason.color};font-weight:600">${reason.label}</div>
            </div>
            ${cid ? `<button class="btn btn-sm" style="font-size:10px;padding:2px 7px;flex-shrink:0" onclick="event.stopPropagation();window._openCourse('${cid}')">Course &#x2192;</button>` : ''}
          </div>`;
        }).join('')
    }
    ${patientsNeedingAttention.length > 0
      ? `<div style="padding:8px 14px;border-top:1px solid var(--border)"><button class="btn btn-sm" style="font-size:10.5px;width:100%" onclick="window._nav('patients')">All Patients &#x2192;</button></div>`
      : ''}
  </div>`;

  const governanceCard = `<div class="card" style="overflow:hidden">
    <div style="padding:13px 16px 10px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)">
      <span class="card-section-label">Review &amp; Governance</span>
      <button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('review-queue')">Queue &#x2192;</button>
    </div>
    ${_dGovSection('Approvals Pending', pendingQueue.length,
      pendingQueue.length
        ? pendingQueue.slice(0, 4).map(item =>
            _dGovRow(
              (item.condition_slug || '').replace(/-/g, ' ') || ('Course #' + (item.course_id || item.id || '').slice(0, 8)),
              item.modality_slug || (item.notes || '').slice(0, 30) || '—',
              'pending',
              "window._nav('review-queue')"
            )).join('')
        : _dNoItems('Queue clear'),
      'var(--amber)'
    )}
    ${_dGovSection('Open Adverse Events', openAEs.length,
      openAEs.length
        ? openAEs.slice(0, 4).map(ae =>
            _dGovRow(
              (ae.event_type || 'Event').replace(/_/g, ' '),
              ae.severity || '—',
              ae.severity === 'serious' || ae.severity === 'severe' ? ae.severity : (ae.severity || 'open'),
              "window._nav('adverse-events')"
            )).join('')
        : _dNoItems('No open events'),
      openAEs.length > 0 ? 'var(--red)' : 'var(--green)'
    )}
    ${flaggedCourses.length ? _dGovSection('Safety Flags', flaggedCourses.length,
      flaggedCourses.slice(0, 3).map(c => {
        const cid2 = (c.id || '').replace(/['"]/g, '');
        return `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 16px;border-bottom:1px solid var(--border);cursor:pointer"
             onclick="window._openCourse('${cid2}')"
             onmouseover="this.style.background='rgba(255,107,107,0.04)'" onmouseout="this.style.background=''">
          <span style="color:var(--red);font-size:12px;flex-shrink:0;margin-top:1px">&#9888;</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:500">${c._patientName ? `<span style="color:var(--text-secondary)">${c._patientName} &middot; </span>` : ''}${(c.condition_slug || '—').replace(/-/g, ' ')}</div>
            <div style="font-size:10.5px;color:var(--red);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(c.governance_warnings || []).map(w => String(w).replace(/[<>&"]/g, '')).join(' · ')}</div>
          </div>
        </div>`;
      }).join(''),
      'var(--red)'
    ) : ''}
    ${consentAlertCount > 0 ? _dGovSection('Consent Alerts', consentAlertCount,
      `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px">
        <span style="font-size:12px;color:var(--amber)">${consentAlertCount} expiring or expired</span>
        <button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('patients')">Manage &#x2192;</button>
      </div>`,
      'var(--amber)'
    ) : ''}
  </div>`;

  const outcomesCard = `<div class="card" style="overflow:hidden">
    <div style="padding:13px 16px 10px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)">
      <span class="card-section-label">Outcomes Snapshot</span>
      <button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('outcomes')">Full Report &#x2192;</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--border)">
      ${_dOutcomeCell('Responder Rate', responderRate, 'var(--teal)', '≥50% reduction')}
      ${_dOutcomeCell('Assess. Completion', assessCompletionPct, 'var(--blue)', 'Fill rate')}
      ${_dOutcomeCell('Courses Completed', completedCourses.length, 'var(--green)', 'All time')}
      ${_dOutcomeCell('Paused / Flagged', pausedCourses.length + flaggedCourses.length, pausedCourses.length + flaggedCourses.length > 0 ? 'var(--amber)' : 'var(--text-secondary)', 'Needs review')}
    </div>
    ${allCourses.length ? `<div style="padding:12px 14px">
      <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;color:var(--text-tertiary);font-weight:600;margin-bottom:8px">Course Status</div>
      ${_dMiniBar('Active',    activeCourses.length,    allCourses.length, 'var(--teal)')}
      ${_dMiniBar('Completed', completedCourses.length, allCourses.length, 'var(--green)')}
      ${_dMiniBar('Pending',   pendingCourses.length,   allCourses.length, 'var(--amber)')}
      ${_dMiniBar('Paused',    pausedCourses.length,    allCourses.length, 'var(--blue)')}
      <div style="margin-top:10px;padding:8px 10px;background:rgba(255,255,255,0.03);border-radius:6px;font-size:11.5px;color:var(--text-secondary);line-height:1.5">
        ${responderRate !== '—'
          ? `${responderRate} of patients responding. ${completedCourses.length} course${completedCourses.length !== 1 ? 's' : ''} finished.`
          : 'Record outcomes to see responder rate and treatment effectiveness.'
        }
      </div>
    </div>` : `<div style="padding:16px;text-align:center;font-size:12px;color:var(--text-tertiary)">No outcome data yet. <button class="btn btn-sm" style="margin-left:4px" onclick="window._nav('outcomes')">Record &#x2192;</button></div>`}
  </div>`;

  const row3 = `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px;align-items:start">${attentionCard}${governanceCard}${outcomesCard}</div>`;

  // ── ROW 4: Remote Monitoring + Recent Notes / Media ───────────────────
  const remoteCard = `<div class="card" style="overflow:hidden">
    <div style="padding:13px 16px 10px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:8px">
        <span class="card-section-label">Remote Monitoring</span>
        ${wearableAlertCount > 0 ? `<span style="font-size:10px;color:${wearableUrgentCount > 0 ? 'var(--red)' : 'var(--amber)'};font-weight:700;background:rgba(255,107,107,0.1);border:1px solid rgba(255,107,107,0.2);border-radius:4px;padding:1px 7px">${wearableAlertCount} alert${wearableAlertCount > 1 ? 's' : ''}</span>` : ''}
      </div>
      <button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('wearables')">Wearables &#x2192;</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid var(--border)">
      ${_dOutcomeCell('Wearable Alerts', wearableAlertCount || 0, wearableAlertCount > 0 ? 'var(--amber)' : 'var(--green)', wearableUrgentCount > 0 ? wearableUrgentCount + ' urgent' : 'No urgent')}
      ${_dOutcomeCell('Media Needs Review', mediaNeedsAttention.length, mediaNeedsAttention.length > 0 ? 'var(--amber)' : 'var(--green)', mediaUrgent > 0 ? mediaUrgent + ' urgent' : 'No urgent')}
      ${_dOutcomeCell('In Active Treatment', activePatientIds.length, 'var(--teal)', 'Patients in active tx')}
    </div>
    <div style="padding:10px 14px;display:flex;gap:8px;flex-wrap:wrap">
      ${wearableAlertCount > 0 ? `<button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('wearables')">View Wearable Alerts &#x2192;</button>` : ''}
      ${mediaNeedsAttention.length > 0 ? `<button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('media-queue')">Media Queue (${mediaNeedsAttention.length}) &#x2192;</button>` : ''}
      ${wearableAlertCount === 0 && mediaNeedsAttention.length === 0 ? `<span style="font-size:12px;color:var(--text-tertiary)">All remote monitoring clear.</span>` : ''}
    </div>
  </div>`;

  const _mAge2 = ts => {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const m2 = Math.floor(diff / 60000);
    if (m2 < 60) return m2 + 'm ago';
    const h2 = Math.floor(m2 / 60);
    if (h2 < 24) return h2 + 'h ago';
    return Math.floor(h2 / 24) + 'd ago';
  };
  const _recentMedia = allMediaItems
    .filter(i => i.status === 'analyzed' || i.status === 'clinician_reviewed')
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 5);

  const notesMediaCard = `<div class="card" style="overflow:hidden">
    <div style="padding:13px 16px 10px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)">
      <span class="card-section-label">Recent Notes &amp; Media</span>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('notes-dictation')">Add Note &#x2192;</button>
        <button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('media-queue')">Media Queue &#x2192;</button>
      </div>
    </div>
    ${_recentMedia.length === 0
      ? `<div style="padding:20px 16px;text-align:center;font-size:12px;color:var(--text-tertiary)">No recent analyzed media.</div>`
      : _recentMedia.map(item => {
          const uid = (item.id || '').replace(/['"]/g, '');
          const typeIcon = (item.upload_type || item.media_type) === 'voice' ? '&#127897;' : '&#128221;';
          return `<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--border);cursor:pointer"
              onclick="window._mediaDetailUploadId='${uid}';window._nav('media-detail')"
              onmouseover="this.style.background='rgba(255,255,255,0.025)'" onmouseout="this.style.background=''">
            <span style="font-size:15px;flex-shrink:0">${typeIcon}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${(item.patient_name || '—').replace(/[<>&"]/g, '')}</div>
              <div style="font-size:10.5px;color:var(--text-tertiary)">${_mAge2(item.created_at)}</div>
            </div>
            <button class="btn btn-sm" style="font-size:10px;padding:2px 7px" onclick="event.stopPropagation();window._mediaDetailUploadId='${uid}';window._nav('media-detail')">View &#x2192;</button>
          </div>`;
        }).join('')
    }
    <div style="padding:8px 14px;border-top:1px solid var(--border)">
      <button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('notes-dictation')">&#9676; Voice Dictation &#x2192;</button>
    </div>
  </div>`;

  const row4 = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;align-items:start">${remoteCard}${notesMediaCard}</div>`;

  el.innerHTML = getStartedCard + row1 + row2 + row3 + row4;
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

  el.innerHTML = `
  <!-- CSV Import Panel -->
  <div id="csv-import-panel" style="display:none;margin-bottom:16px">
    <div class="card">
      <div class="card-header">
        <h3>Import Patients from CSV</h3>
        <button class="btn btn-sm" onclick="document.getElementById('csv-import-panel').style.display='none'">Close</button>
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

  <!-- FHIR Import Panel -->
  <div id="fhir-import-panel" style="display:none;margin-bottom:16px">
    <div class="card">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <span>Import HL7 FHIR Patient</span>
        <button class="btn btn-sm" onclick="document.getElementById('fhir-import-panel').style.display='none'">Close</button>
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

  <div id="add-patient-panel" style="display:none;margin-bottom:16px">
    ${cardWrap('New Patient', `
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
    `)}
  </div>

  <!-- Summary Chips -->
  <div class="pat-summary-chips" id="pat-summary-chips">
    <div class="pat-chip pat-chip--active" onclick="window._patSetQuick('active')" style="cursor:pointer"><span class="pat-chip-val">${_statActive}</span><span class="pat-chip-lbl">Active Patients</span></div>
    <div class="pat-chip pat-chip--review" onclick="window._patSetQuick('review')" style="cursor:pointer"><span class="pat-chip-val">${_statReview}</span><span class="pat-chip-lbl">Needs Review</span></div>
    <div class="pat-chip pat-chip--alert"  onclick="window._patSetQuick('alert')"  style="cursor:pointer"><span class="pat-chip-val">${_statAlerts}</span><span class="pat-chip-lbl">Active Alerts</span></div>
    <div class="pat-chip pat-chip--assess"><span class="pat-chip-val">${_statAssess}</span><span class="pat-chip-lbl">Overdue Assess.</span></div>
    <div class="pat-chip"><span class="pat-chip-val">${_statToday}</span><span class="pat-chip-lbl">Sessions Today</span></div>
    <div class="pat-chip" style="margin-left:auto"><span class="pat-chip-val">${items.length}</span><span class="pat-chip-lbl">Total</span></div>
  </div>

  <!-- Enhanced Filter Bar -->
  <div class="pat-filter-bar">
    <input class="form-control" id="pt-search" placeholder="Search name, condition, email…" style="flex:1;min-width:180px" oninput="window.filterPatients()">
    <div class="pat-quick-chips">
      <button class="pat-qchip pat-qchip--on" id="ptq-all"    onclick="window._patSetQuick('all')">All <span>${items.length}</span></button>
      <button class="pat-qchip" id="ptq-review" onclick="window._patSetQuick('review')">Review <span>${_statReview}</span></button>
      <button class="pat-qchip" id="ptq-alert"  onclick="window._patSetQuick('alert')">Alerts <span>${_statAlerts}</span></button>
      <button class="pat-qchip" id="ptq-active" onclick="window._patSetQuick('active')">Active <span>${_statActive}</span></button>
    </div>
    <select class="form-control" id="pt-status-filter" style="width:130px;flex-shrink:0" onchange="window.filterPatients()">
      <option value="">All Status</option>
      <option value="active">Active</option>
      <option value="pending">Pending</option>
      <option value="inactive">Inactive</option>
      <option value="completed">Completed</option>
    </select>
    <select class="form-control" id="pt-modality-filter" style="width:150px;flex-shrink:0" onchange="window.filterPatients()">
      <option value="">All Modalities</option>
      ${FALLBACK_MODALITIES.map(m => `<option>${m}</option>`).join('')}
    </select>
    <span id="pt-count" style="font-size:11px;color:var(--text-tertiary);white-space:nowrap">${items.length} patients</span>
  </div>

  <!-- Patient Roster -->
  <div id="pat-roster">${
    items.length === 0
      ? emptyState('\u{1F465}', 'No patients yet', canAddPatient ? 'Add your first patient to get started.' : '', canAddPatient ? '+ Add Patient' : null, canAddPatient ? 'window.showAddPatient()' : null)
      : items.map(p => _patCard(p, _patAttention(p), _patCourseStats(p), canTransfer)).join('')
  }</div>

  <!-- AI Intake Parser -->
  <div style="margin-top:16px">
    <div class="card">
      <div class="card-header" style="cursor:pointer" onclick="window.toggleIntakeParser()">
        <h3>AI Intake Parser <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:rgba(74,158,255,0.1);color:var(--blue);margin-left:6px">Beta</span></h3>
        <span id="intake-parser-arrow" style="font-size:12px;color:var(--text-tertiary)">▶ expand</span>
      </div>
      <div id="intake-parser-body" style="display:none">
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
  </div>`;

  window._patientsData    = items;
  window._patQuickFilter  = 'all';

  // ── Patient card renderer ─────────────────────────────────────────────────
  function _patCard(p, att, cs, canTransferFlag) {
    att = att || _patAttention(p);
    cs  = cs  || _patCourseStats(p);
    const name    = (p.first_name || '') + ' ' + (p.last_name || '');
    const age     = p.dob ? Math.floor((Date.now() - new Date(p.dob)) / 31557600000) + 'y' : '';
    const progPct = cs.sessTotal ? Math.round((cs.sessDone / cs.sessTotal) * 100) : 0;
    const attBadge = att
      ? '<span class="pat-att-badge" style="color:' + att.color + ';border-color:' + att.color + '33;background:' + att.color + '0d">' + att.label + '</span>'
      : '<span class="pat-att-badge pat-att-badge--ok">✓ On Track</span>';
    const courseInfo = cs.activeCourses.length
      ? '<span class="pat-course-info">' + cs.activeCourses.length + ' active course' + (cs.activeCourses.length > 1 ? 's' : '') + '</span>'
      : '<span class="pat-course-info pat-course-info--none">No active course</span>';
    const progressBar = cs.sessTotal
      ? '<div class="pat-prog-row"><div class="pat-prog-track"><div class="pat-prog-fill" style="width:' + progPct + '%"></div></div><span class="pat-prog-lbl">' + cs.sessDone + '/' + cs.sessTotal + ' sessions</span></div>'
      : '';
    const lastSess = p.last_session_date ? '<span class="pat-last-sess">Last: ' + p.last_session_date + '</span>' : '';
    const statusColor = { active: 'var(--green)', pending: 'var(--amber)', inactive: 'var(--text-tertiary)', completed: 'var(--blue)' }[p.status] || 'var(--text-tertiary)';
    const condTag  = p.primary_condition ? '<span class="tag" style="font-size:10.5px">' + p.primary_condition + '</span>' : '';
    const modTag   = p.primary_modality  ? '<span class="tag" style="font-size:10.5px">' + p.primary_modality  + '</span>' : '';
    const ageSpan  = age ? ' <span class="pat-card-age">' + age + '</span>' : '';
    const transferBtn = canTransferFlag
      ? '<button class="pat-act-btn" onclick="window._transferPatient('' + p.id + '','' + name.replace(/'/g, "\'") + '')">Transfer</button>'
      : '';
    return '<div class="pat-roster-card" data-id="' + p.id + '" data-status="' + p.status + '" data-attention="' + (att ? att.type : 'ok') + '" onclick="window.openPatient('' + p.id + '')">'
      + '<div class="pat-card-left">'
      +   '<div class="pat-card-avatar">'
      +     '<span class="pat-status-dot" style="background:' + statusColor + '"></span>'
      +     initials(name)
      +   '</div>'
      + '</div>'
      + '<div class="pat-card-main">'
      +   '<div class="pat-card-name">' + name + ageSpan + '</div>'
      +   '<div class="pat-card-meta">' + condTag + modTag + ' ' + courseInfo + '</div>'
      +   progressBar
      +   lastSess
      + '</div>'
      + '<div class="pat-card-signals">' + attBadge + '</div>'
      + '<div class="pat-card-actions" onclick="event.stopPropagation()">'
      +   '<button class="pat-act-btn pat-act-btn--primary" onclick="window.openPatient('' + p.id + '')">Open Chart</button>'
      +   '<button class="pat-act-btn" onclick="window._patStartSession('' + p.id + '')">Start Session</button>'
      +   '<button class="pat-act-btn" onclick="window._nav('virtual-care')">Virtual Care</button>'
      +   '<button class="pat-act-btn" onclick="window._patAddNote('' + p.id + '')">Add Note</button>'
      +   transferBtn
      + '</div>'
      + '</div>';
  }
  window._patCard = _patCard;

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

  window._patAddNote = function(id) {
    window._selectedPatientId = id;
    window._profilePatientId  = id;
    window._nav('patient-profile');
  };

  window.filterPatients = function() {
    const q     = (document.getElementById('pt-search')?.value || '').toLowerCase();
    const st    = document.getElementById('pt-status-filter')?.value  || '';
    const mod   = document.getElementById('pt-modality-filter')?.value || '';
    const quick = window._patQuickFilter || 'all';
    const all   = window._patientsData || [];

    const vis = all.filter(p => {
      const name  = ((p.first_name || '') + ' ' + (p.last_name || '')).toLowerCase();
      const matchQ   = !q   || name.includes(q) || (p.primary_condition || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q);
      const matchSt  = !st  || p.status === st;
      const matchMod = !mod || (p.primary_modality || '') === mod;
      let   matchQ2  = true;
      if (quick === 'active') matchQ2 = p.status === 'active';
      if (quick === 'review') matchQ2 = !!(p.needs_review || p.review_overdue);
      if (quick === 'alert')  { const a = _patAttention(p); matchQ2 = !!(a && (a.type === 'outcome' || a.type === 'ae')); }
      return matchQ && matchSt && matchMod && matchQ2;
    });

    const countEl  = document.getElementById('pt-count');
    const rosterEl = document.getElementById('pat-roster');
    if (countEl)  countEl.textContent = vis.length + ' of ' + all.length + ' patients';
    if (rosterEl) rosterEl.innerHTML  = vis.length
      ? vis.map(p => _patCard(p, _patAttention(p), _patCourseStats(p), canTransfer)).join('')
      : `<div style="text-align:center;padding:48px 24px;color:var(--text-tertiary)"><div style="font-size:28px;margin-bottom:8px">&#9670;</div>No patients match the current filters.</div>`;
  };

    window.showAddPatient = function() {
    document.getElementById('add-patient-panel').style.display = '';
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
    if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
  };

  // ── FHIR Import ──────────────────────────────────────────────────────────────
  window.showFHIRImport = function() {
    const panel = document.getElementById('fhir-import-panel');
    if (!panel) return;
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
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
      ${cardWrap('New Session', `
        <div class="g2">
          <div>
            <div class="form-group"><label class="form-label">Scheduled Date/Time</label><input id="ns-date" class="form-control" type="datetime-local"></div>
            <div class="form-group"><label class="form-label">Duration (min)</label><input id="ns-dur" class="form-control" type="number" value="30"></div>
            <div class="form-group"><label class="form-label">Modality</label>
              <select id="ns-mod" class="form-control"><option value="">Select…</option>
                ${FALLBACK_MODALITIES.map(m => `<option>${m}</option>`).join('')}
              </select>
            </div>
          </div>
          <div>
            <div class="form-group"><label class="form-label">Session #</label><input id="ns-num" class="form-control" type="number" value="1"></div>
            <div class="form-group"><label class="form-label">Total Sessions Planned</label><input id="ns-total" class="form-control" type="number" value="10"></div>
            <div class="form-group"><label class="form-label">Billing Code</label><input id="ns-billing" class="form-control" placeholder="e.g. 90901"></div>
          </div>
        </div>
        <div id="ns-error" style="color:var(--red);font-size:12px;display:none;margin-bottom:8px"></div>
        <div style="display:flex;gap:8px">
          <button class="btn" onclick="document.getElementById('new-session-form').style.display='none'">Cancel</button>
          <button class="btn btn-primary" onclick="window.saveSession()">Save Session</button>
        </div>
      `)}
    </div>
    ${sessions.length === 0
      ? emptyState('◻', 'No sessions logged yet.')
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
      ? emptyState('◫', 'No outcomes recorded yet. Record assessment scores to track treatment response.')
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
    ? emptyState('◎', 'No phenotype assignments yet.')
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
      else { alert(e.message || 'Delete failed.'); }
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
      ? emptyState('&#9671;', 'No consent records yet.')
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
      alert('Could not dismiss flag. Please try again.');
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
    session_number: parseInt(document.getElementById('ns-num').value) || 1,
    total_sessions: parseInt(document.getElementById('ns-total').value) || 10,
    billing_code: document.getElementById('ns-billing').value || null,
    status: 'scheduled',
  };
  if (!data.scheduled_at) { errEl.textContent = 'Date/time required.'; errEl.style.display = ''; return; }
  try {
    await api.createSession(data);
    window._nav('profile');
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
      setting: 'clinical',
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

  if (aiResult) return `
    <div style="font-family:var(--font-display);font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:2px">${aiResult.rationale?.split('.')[0] || 'Generated Protocol'}</div>
    <div style="font-size:11.5px;color:var(--teal);margin-bottom:14px">Evidence Grade: ${aiResult.evidence_grade || '—'} · ${aiResult.approval_status_badge || ''}</div>
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
    <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:18px;line-height:1.65;max-width:300px;margin-left:auto;margin-right:auto">
      Generate an evidence-based protocol for <strong style="color:var(--text-primary)">${name}</strong> based on condition and modality.
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
    <button class="btn btn-primary" onclick="window.runAI()" style="padding:10px 26px;font-size:13px">Generate Protocol ✦</button>
  </div>`;
}

function bindAI(pt) {
  window.runAI = async function() {
    aiLoading = true; aiResult = null;
    const z = document.getElementById('ai-gen-zone');
    if (z) z.innerHTML = renderAIZone(pt);
    const condition = document.getElementById('ai-condition')?.value || pt?.primary_condition || '';
    const modality = document.getElementById('ai-modality')?.value || pt?.primary_modality || '';
    try {
      const res = await api.generateProtocol({
        condition: condition,
        symptom_cluster: '',
        modality: modality,
        device: '',
        setting: 'clinical',
        evidence_threshold: 'B',
        off_label: false,
      });
      aiResult = res;
    } catch (e) {
      aiResult = { rationale: `Error: ${e.message}`, target_region: '—', evidence_grade: '—', approval_status_badge: 'error' };
    }
    aiLoading = false;
    const zz = document.getElementById('ai-gen-zone');
    if (zz) { zz.innerHTML = renderAIZone(pt); bindAI(pt); }
  };
  window.resetAI = function() {
    aiResult = null;
    const z = document.getElementById('ai-gen-zone');
    if (z) { z.innerHTML = renderAIZone(pt); bindAI(pt); }
  };
  window.saveProtocol = function() {
    savedProto = aiResult;
    window.switchPT('protocol');
  };
}

// ── Protocol Wizard — 5-step deep wizard ─────────────────────────────────────

const WIZ_STEPS = [
  'Patient & Condition',
  'Phenotype & Modality',
  'Device & Parameters',
  'AI Generation',
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
        <div style="margin-top:16px;font-size:13px;color:var(--text-secondary)">Generating AI protocol…</div>
        <div style="margin-top:6px;font-size:11px;color:var(--text-tertiary)">This may take a few seconds.</div>
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
        ${govHtml}
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
        <button class="btn btn-sm" onclick="window._wizSave('draft')">Save as Draft Course &rarr;</button>
        <button class="btn btn-primary" onclick="window._wizSave('active')">Activate Course &rarr;</button>
      </div>
    </div>
  </div>`;
}

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

    ws.step = 3;
    ws._step4Html = renderWizStep4Loading();
    renderWizPage();

    try {
      const payload = {
        condition_slug: ws.conditionSlug || '',
        modality_slug: (ws.modalitySlugs || [])[0] || '',
        device_slug: ws.deviceSlug || '',
        target_region: ws.targetRegion || '',
        frequency_hz: ws.frequencyHz ? parseFloat(ws.frequencyHz) : undefined,
        intensity_pct_rmt: ws.intensityPct ? parseFloat(ws.intensityPct) : undefined,
        sessions_per_week: ws.sessionsPerWeek ? parseInt(ws.sessionsPerWeek) : undefined,
        total_sessions: ws.totalSessions ? parseInt(ws.totalSessions) : undefined,
        session_duration_min: ws.sessionDurationMin ? parseInt(ws.sessionDurationMin) : undefined,
        laterality: ws.laterality || '',
        phenotype_id: ws.phenotypeId || undefined,
        patient_id: ws.patientId || undefined,
      };
      // Remove undefined keys
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

      const result = await api.generateProtocol(payload);
      ws.generatedProtocol = result;
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
        protocol_id: result?.id || undefined,
        evidence_grade: result?.evidence_grade || undefined,
        on_label: result?.on_label_vs_off_label ? result.on_label_vs_off_label.toLowerCase().startsWith('on') : undefined,
        clinician_notes: ws.clinicianNotes || undefined,
      };
      Object.keys(courseData).forEach(k => courseData[k] === undefined && delete courseData[k]);

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
            : emptyState('◇', 'No protocols in registry.', 'Ensure backend data is seeded.')}
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
        { t: 'personalized', l: 'Personalized AI', s: 'Brain-Data Driven', d: 'Uses patient data to generate a bespoke protocol.', c: 'var(--teal)' },
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
    return `<div>
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
        <button class="btn btn-primary" onclick="window.createTreatmentCourse()" id="gen-btn" ${hasProto ? '' : 'disabled'}>Create Treatment Course ◎</button>
      </div>
    </div>
    <div id="proto-result" style="margin-top:20px"></div>
  </div>`;
  }

  return '';
}

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

// ── Assessments Hub ────────────────────────────────────────────────────────────
const ASSESS_REGISTRY = [
  // Inline questionnaires
  { id: 'PHQ-9', t: 'PHQ-9 Depression Scale', abbr: 'PHQ-9', sub: 'Patient health questionnaire, 9-item', cat: 'Depression', tags: ['depression', 'outcome'], max: 27, inline: true,
    questions: ['Little interest or pleasure in doing things','Feeling down, depressed, or hopeless','Trouble falling or staying asleep, or sleeping too much','Feeling tired or having little energy','Poor appetite or overeating','Feeling bad about yourself — or that you are a failure','Trouble concentrating on things','Moving or speaking so slowly that other people could notice (or the opposite)','Thoughts that you would be better off dead, or of hurting yourself'],
    options: ['Not at all (0)','Several days (1)','More than half the days (2)','Nearly every day (3)'],
    interpret: (s) => s<=4?{label:'Minimal',color:'var(--teal)'}:s<=9?{label:'Mild',color:'#60a5fa'}:s<=14?{label:'Moderate',color:'#f59e0b'}:s<=19?{label:'Moderately Severe',color:'#f97316'}:{label:'Severe',color:'var(--red)'},
  },
  { id: 'GAD-7', t: 'GAD-7 Anxiety Scale', abbr: 'GAD-7', sub: 'Generalised anxiety disorder, 7-item', cat: 'Anxiety', tags: ['anxiety', 'outcome'], max: 21, inline: true,
    questions: ['Feeling nervous, anxious, or on edge','Not being able to stop or control worrying','Worrying too much about different things','Trouble relaxing','Being so restless that it is hard to sit still','Becoming easily annoyed or irritable','Feeling afraid as if something awful might happen'],
    options: ['Not at all (0)','Several days (1)','More than half the days (2)','Nearly every day (3)'],
    interpret: (s) => s<=4?{label:'Minimal',color:'var(--teal)'}:s<=9?{label:'Mild',color:'#60a5fa'}:s<=14?{label:'Moderate',color:'#f59e0b'}:{label:'Severe',color:'var(--red)'},
  },
  { id: 'ISI', t: 'Insomnia Severity Index', abbr: 'ISI', sub: 'Sleep quality assessment, 7-item', cat: 'Sleep', tags: ['insomnia', 'CES'], max: 28, inline: true,
    questions: ['Severity of sleep onset problem','Severity of sleep maintenance problem','Problem waking up too early','How SATISFIED/dissatisfied are you with your current sleep pattern?','How NOTICEABLE to others is your sleep problem?','How WORRIED/distressed are you about your sleep problem?','To what extent does your sleep problem INTERFERE with your daily functioning?'],
    options: ['None/Very satisfied (0)','Mild (1)','Moderate (2)','Severe (3)','Very severe/Dissatisfied (4)'],
    interpret: (s) => s<=7?{label:'No clinically significant insomnia',color:'var(--teal)'}:s<=14?{label:'Subthreshold insomnia',color:'#60a5fa'}:s<=21?{label:'Moderate clinical insomnia',color:'#f59e0b'}:{label:'Severe clinical insomnia',color:'var(--red)'},
  },
  // Score-entry scales
  { id: 'HAM-D17', t: 'Hamilton Depression Rating Scale', abbr: 'HAM-D', sub: 'Clinician-rated depression, 17-item', cat: 'Depression', tags: ['depression', 'clinician-rated'], max: 52, inline: false,
    interpret: (s) => s<=7?{label:'Normal',color:'var(--teal)'}:s<=13?{label:'Mild',color:'#60a5fa'}:s<=18?{label:'Moderate',color:'#f59e0b'}:s<=22?{label:'Severe',color:'#f97316'}:{label:'Very Severe',color:'var(--red)'} },
  { id: 'MADRS', t: 'Montgomery-Åsberg Depression Rating Scale', abbr: 'MADRS', sub: 'Clinician-rated depression, 10-item', cat: 'Depression', tags: ['depression', 'clinician-rated'], max: 60, inline: false,
    interpret: (s) => s<=6?{label:'Normal',color:'var(--teal)'}:s<=19?{label:'Mild',color:'#60a5fa'}:s<=34?{label:'Moderate',color:'#f59e0b'}:{label:'Severe',color:'var(--red)'} },
  { id: 'YMRS', t: 'Young Mania Rating Scale', abbr: 'YMRS', sub: 'Mania symptom severity, 11-item', cat: 'Mood', tags: ['bipolar', 'mania', 'clinician-rated'], max: 60, inline: false,
    interpret: (s) => s<=12?{label:'Normal/Remission',color:'var(--teal)'}:s<=20?{label:'Mild',color:'#60a5fa'}:s<=30?{label:'Moderate',color:'#f59e0b'}:{label:'Severe',color:'var(--red)'} },
  { id: 'PCL-5', t: 'PTSD Checklist (PCL-5)', abbr: 'PCL-5', sub: 'PTSD symptom scale, 20-item', cat: 'Trauma', tags: ['PTSD', 'taVNS'], max: 80, inline: false,
    interpret: (s) => s<33?{label:'No probable PTSD',color:'var(--teal)'}:{label:'Probable PTSD',color:'var(--red)'} },
  { id: 'Y-BOCS', t: 'Yale-Brown OC Scale', abbr: 'Y-BOCS', sub: 'OCD severity, 10-item', cat: 'OCD', tags: ['OCD', 'anxiety'], max: 40, inline: false,
    interpret: (s) => s<=7?{label:'Subclinical',color:'var(--teal)'}:s<=15?{label:'Mild',color:'#60a5fa'}:s<=23?{label:'Moderate',color:'#f59e0b'}:s<=31?{label:'Severe',color:'#f97316'}:{label:'Extreme',color:'var(--red)'} },
  { id: 'OCI-R', t: 'OCD Inventory-Revised', abbr: 'OCI-R', sub: 'OCD self-report, 18-item', cat: 'OCD', tags: ['OCD', 'anxiety'], max: 72, inline: false,
    interpret: (s) => s<18?{label:'Below threshold',color:'var(--teal)'}:{label:'OCD likely',color:'var(--red)'} },
  { id: 'PDSS', t: 'Panic Disorder Severity Scale', abbr: 'PDSS', sub: 'Panic disorder, 7-item clinician-rated', cat: 'Anxiety', tags: ['panic', 'anxiety'], max: 28, inline: false,
    interpret: (s) => s<=5?{label:'Minimal',color:'var(--teal)'}:s<=10?{label:'Mild',color:'#60a5fa'}:s<=15?{label:'Moderate',color:'#f59e0b'}:{label:'Severe',color:'var(--red)'} },
  { id: 'LSAS', t: 'Liebowitz Social Anxiety Scale', abbr: 'LSAS', sub: 'Social anxiety, 24-item', cat: 'Anxiety', tags: ['social-anxiety'], max: 144, inline: false,
    interpret: (s) => s<30?{label:'None/Minimal',color:'var(--teal)'}:s<60?{label:'Moderate',color:'#f59e0b'}:{label:'Severe',color:'var(--red)'} },
  { id: 'ADHD-RS-5', t: 'ADHD Rating Scale', abbr: 'ADHD-RS', sub: 'Executive function & attention, 18-item', cat: 'ADHD', tags: ['ADHD', 'NFB'], max: 54, inline: false,
    interpret: (s) => s<=16?{label:'Normal',color:'var(--teal)'}:s<=32?{label:'Moderate',color:'#f59e0b'}:{label:'Severe',color:'var(--red)'} },
  { id: 'DASS-21', t: 'DASS-21', abbr: 'DASS-21', sub: 'Depression, Anxiety & Stress Scales, 21-item', cat: 'Mood', tags: ['depression', 'anxiety', 'stress'], max: 63, inline: false,
    interpret: (s) => s<=14?{label:'Normal',color:'var(--teal)'}:s<=28?{label:'Moderate',color:'#f59e0b'}:{label:'Severe',color:'var(--red)'} },
  { id: 'UPDRS-III', t: 'UPDRS-III Motor Assessment', abbr: 'UPDRS-III', sub: "Parkinson's motor function, 27-item", cat: "Parkinson's", tags: ['PD', 'TPS', 'motor'], max: 108, inline: false,
    interpret: (s) => s<=19?{label:'Mild',color:'#60a5fa'}:s<=39?{label:'Moderate',color:'#f59e0b'}:{label:'Severe',color:'var(--red)'} },
  { id: 'NRS-Pain', t: 'Numeric Pain Rating Scale', abbr: 'NRS', sub: 'Pain intensity 0–10', cat: 'Pain', tags: ['pain', 'tDCS'], max: 10, inline: false,
    interpret: (s) => s<=3?{label:'Mild pain',color:'#60a5fa'}:s<=6?{label:'Moderate pain',color:'#f59e0b'}:{label:'Severe pain',color:'var(--red)'} },
  { id: 'NRS-SE', t: 'Side Effect Severity Rating', abbr: 'NRS-SE', sub: 'Neuromodulation side effects 0–10', cat: 'Safety', tags: ['side-effects', 'safety'], max: 10, inline: false,
    interpret: (s) => s<=2?{label:'Minimal',color:'var(--teal)'}:s<=5?{label:'Moderate — monitor',color:'#f59e0b'}:{label:'Significant — review',color:'var(--red)'} },
  { id: 'PSQI', t: 'Pittsburgh Sleep Quality Index', abbr: 'PSQI', sub: 'Sleep quality & disturbances, 7-component', cat: 'Sleep', tags: ['sleep', 'insomnia'], max: 21, inline: false,
    interpret: (s) => s<=5?{label:'Good sleep',color:'var(--teal)'}:{label:'Poor sleep',color:'var(--red)'} },
  { id: 'ESS', t: 'Epworth Sleepiness Scale', abbr: 'ESS', sub: 'Daytime sleepiness, 8-item', cat: 'Sleep', tags: ['sleep', 'fatigue'], max: 24, inline: false,
    interpret: (s) => s<=10?{label:'Normal',color:'var(--teal)'}:s<=15?{label:'Excessive sleepiness',color:'#f59e0b'}:{label:'Severe — refer',color:'var(--red)'} },
  { id: 'SF-12', t: 'Short Form Health Survey (SF-12)', abbr: 'SF-12', sub: 'Health-related quality of life, 12-item', cat: 'QoL', tags: ['quality-of-life', 'function'], max: 100, inline: false,
    interpret: (s) => s>=50?{label:'Above average QoL',color:'var(--teal)'}:{label:'Below average QoL',color:'#f59e0b'} },
  { id: 'THI', t: 'Tinnitus Handicap Inventory', abbr: 'THI', sub: 'Tinnitus severity & impact, 25-item', cat: 'Sensory', tags: ['tinnitus', 'TMS'], max: 100, inline: false,
    interpret: (s) => s<=16?{label:'Slight',color:'var(--teal)'}:s<=36?{label:'Mild',color:'#60a5fa'}:s<=56?{label:'Moderate',color:'#f59e0b'}:{label:'Severe',color:'var(--red)'} },
  { id: 'FSS', t: 'Fatigue Severity Scale', abbr: 'FSS', sub: 'Fatigue impact, 9-item', cat: 'Function', tags: ['fatigue', 'MS', 'TBI'], max: 63, inline: false,
    interpret: (s) => s<36?{label:'Normal',color:'var(--teal)'}:{label:'Clinically significant fatigue',color:'#f59e0b'} },
  { id: 'CGI-S', t: 'Clinical Global Impression — Severity', abbr: 'CGI-S', sub: 'Global severity rating 1–7', cat: 'Global', tags: ['global', 'clinician-rated'], max: 7, inline: false,
    interpret: (s) => s<=2?{label:'Normal/Borderline',color:'var(--teal)'}:s<=4?{label:'Mild–Moderate',color:'#f59e0b'}:{label:'Severe',color:'var(--red)'} },
  { id: 'AUDIT', t: 'Alcohol Use Disorders Identification Test', abbr: 'AUDIT', sub: 'Alcohol misuse screening, 10-item', cat: 'Substance', tags: ['alcohol', 'substance'], max: 40, inline: false,
    interpret: (s) => s<=7?{label:'Low risk',color:'var(--teal)'}:s<=15?{label:'Medium risk',color:'#f59e0b'}:{label:'High risk',color:'var(--red)'} },
];

// Backward-compat alias (patient profile tab still references ASSESS_TEMPLATES)
const ASSESS_TEMPLATES = ASSESS_REGISTRY;

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
    return `<span class="ah-chip${clickable?' ah-chip-btn':''}" ${attrs}>${s.abbr||s.id}${s.inline?' ◉':''}</span>`;
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
            ${registry.map(s=>`
              <div class="ah-lib-row" onclick="window._ahQuickRunScale('${s.id}')">
                <span class="ah-lib-abbr">${s.abbr||s.id}</span>
                <span class="ah-lib-name">${s.t}</span>
                ${s.inline?'<span class="ah-inline-badge">◉</span>':''}
                <span class="ah-lib-cat">${s.cat}</span>
              </div>`).join('')}
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
        ${registry.map(s=>`
          <div class="card ah-scale-card" style="margin-bottom:0" id="ahsc-${s.id.replace(/[^a-z0-9]/gi,'_')}">
            <div class="card-body">
              <div style="font-family:var(--font-display);font-size:13px;font-weight:600;margin-bottom:3px">${s.t}</div>
              <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px">${s.sub} · max ${s.max}</div>
              <div style="margin-bottom:10px">${s.tags.slice(0,3).map(t=>tag(t)).join('')}</div>
              <div style="display:flex;gap:6px">
                ${s.inline?`<button class="btn btn-primary btn-sm" onclick="window._ahRunScale('${s.id}')">Run Inline ◉</button>`:''}
                <button class="btn btn-sm" onclick="window._ahScoreEntry('${s.id}')">Enter Score</button>
              </div>
            </div>
          </div>`).join('')}
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
          <div id="ah-inline-err" style="color:var(--red);font-size:12px;display:none;margin-bottom:8px"></div>
          <button class="btn btn-primary" onclick="window._ahSaveInline()">Save Assessment →</button>
        </div></div>
      </div>
      <div id="ah-score-panel" style="display:none;max-width:440px;margin-top:16px">
        <div class="card"><div class="card-body">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <button class="btn btn-sm" onclick="window._ahCloseScore()">← Back</button>
            <div id="ah-score-title" style="font-family:var(--font-display);font-size:14px;font-weight:600;flex:1"></div>
          </div>
          <div class="form-group"><label class="form-label">Score</label>
            <input id="ah-score-val" class="form-control" type="number" placeholder="e.g. 14" oninput="window._ahScorePreview()"></div>
          <div id="ah-score-interp" style="font-size:12px;font-weight:600;padding:6px 10px;border-radius:var(--radius-sm);margin-bottom:10px;display:none"></div>
          <div class="form-group"><label class="form-label">Clinician Notes</label>
            <textarea id="ah-score-notes" class="form-control" rows="2" placeholder="Notes…"></textarea></div>
          <div id="ah-score-err" style="color:var(--red);font-size:12px;display:none;margin-bottom:8px"></div>
          <button class="btn btn-primary" onclick="window._ahSaveScore()">Save →</button>
        </div></div>
      </div>
    </div>
    <div id="ah-results" class="ah-view" style="display:none">
      ${items.length === 0 ? emptyState('◧', 'No assessments recorded yet.') : `<div class="card"><div class="card-body">
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
    const tpl = registry.find(r => r.id === id);
    if (!tpl?.inline) { window._ahScoreEntry(id); return; }
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
  window._ahCloseInline = function() {
    const p=document.getElementById('ah-inline-panel'); if(p) p.style.display='none';
    const l=document.getElementById('ah-run-scale-list'); if(l) l.style.display=''; _ahInlineTpl=null;
  };
  window._ahScoreEntry = function(id) {
    _ahScoreTpl = registry.find(r => r.id === id); if (!_ahScoreTpl) return;
    document.getElementById('ah-inline-panel').style.display='none';
    document.getElementById('ah-run-scale-list').style.display='none';
    document.getElementById('ah-score-panel').style.display='';
    document.getElementById('ah-score-title').textContent = `${_ahScoreTpl.t} (max ${_ahScoreTpl.max})`;
    document.getElementById('ah-score-val').value=''; document.getElementById('ah-score-notes').value='';
    document.getElementById('ah-score-interp').style.display='none'; document.getElementById('ah-score-err').style.display='none';
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
    const p=document.getElementById('ah-score-panel'); if(p) p.style.display='none';
    const l=document.getElementById('ah-run-scale-list'); if(l) l.style.display=''; _ahScoreTpl=null;
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
    if (!recs.length) return emptyState('◈', 'No qEEG records yet. Click "+ Upload qEEG Record" to add the first recording.');
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
      alert('Camera access denied. Please allow camera permissions in your browser settings.');
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
  setTopbar('Virtual Care', 'Consultation & communication hub');
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
    <button class="vc-chip" onclick="window._vcSetTab('video-visits')">
      <span class="vc-chip-n">${todayVisits}</span>
      <span class="vc-chip-lbl">Scheduled Visits</span>
    </button>
    <button class="vc-chip${callReqs ? ' vc-chip--attn' : ''}" onclick="window._vcSetTab('call-requests')">
      <span class="vc-chip-n">${callReqs}</span>
      <span class="vc-chip-lbl">Call Requests</span>
    </button>
    <button class="vc-chip" onclick="window._vcSetTab('inbox')">
      <span class="vc-chip-n">${threads}</span>
      <span class="vc-chip-lbl">Patient Threads</span>
    </button>
    <button class="vc-chip${urgMedia ? ' vc-chip--urgent' : ''}" onclick="window._vcSetTab('shared-media')">
      <span class="vc-chip-n">${awMedia}</span>
      <span class="vc-chip-lbl">Awaiting Review</span>
    </button>
    <button class="vc-chip vc-chip--ai" onclick="window._vcSetTab('ai-notes')">
      <span class="vc-chip-n">${pendNotes}</span>
      <span class="vc-chip-lbl">AI Notes Pending</span>
    </button>
  </div>

  <div class="vc-action-bar">
    <button class="vc-act vc-act--primary" onclick="window._vcStartVideoVisit(null)">&#9654;&ensp;Start Video Visit</button>
    <button class="vc-act"                 onclick="window._vcStartVoiceCall(null)">&#9742;&ensp;Start Voice Call</button>
    <button class="vc-act"                 onclick="window._vcSendMessage(null)">&#9993;&ensp;Send Message</button>
    <button class="vc-act"                 onclick="window._vcRecordNote()">&#9210;&ensp;Record Note</button>
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
  const stateKey = type === 'video' ? '_vcSelVisit' : '_vcSelCall';
  if (!window[stateKey] && items.length) window[stateKey] = items[0].id;
  const sel = items.find(v => v.id === window[stateKey]);

  const list = items.map(v => {
    const timeStr = v.scheduledAt ? new Date(v.scheduledAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : '';
    const dateStr = v.scheduledAt ? new Date(v.scheduledAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '';
    return `<div class="vc-list-item${v.id===window[stateKey]?' selected':''}"
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
  if (!body) { alert('Please enter note content'); return; }
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
          if (!data.stages) { alert('Invalid protocol JSON: missing stages array.'); return; }
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
        } catch { alert('Failed to parse JSON file.'); }
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
    alert(`${icon} ${name} selected.\n\nIndicated conditions: ${info.conditions.join(', ')}\n\nNavigate to Protocol Intelligence to build a full protocol using this modality.`);
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

  window._profileSaveDemographics = function() {
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
      <div style="font-size:1.6rem;font-weight:800;color:var(--accent-teal);margin-bottom:12px">${mockMean}%</div>
      <div style="font-size:.8rem;margin-bottom:4px">Responder rate</div>
      <div style="font-size:1.6rem;font-weight:800;color:var(--accent-teal);margin-bottom:12px">${Math.round(mockRespond * 100)}%</div>
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
      alert('Please select a condition, modality, and enter an improvement percentage.');
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
export async function pgConsentAutomation(setTopbar) {
  setTopbar('Consent & Compliance',
    `<button class="btn btn-primary btn-sm" onclick="window._consentExportAudit()">Export Audit Log</button>`
  );

  const ROOT_ID = 'ggg-consent-root';

  // ── localStorage helpers ──────────────────────────────────────────────────
  const KEYS = {
    records:     'ds_consent_records',
    versions:    'ds_consent_versions',
    automations: 'ds_consent_automations',
    audit:       'ds_consent_audit_log',
    deletions:   'ds_deletion_requests',
  };

  function lsGet(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  }
  function lsSave(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  function addAudit(event, patientName, extra) {
    const log = lsGet(KEYS.audit) || [];
    log.unshift({ id: Math.random().toString(36).slice(2), ts: new Date().toISOString(), event, patient: patientName, extra: extra || '' });
    lsSave(KEYS.audit, log.slice(0, 200));
  }

  // ── Seed data ─────────────────────────────────────────────────────────────
  function seedIfNeeded() {
    if (!lsGet(KEYS.records)) {
      lsSave(KEYS.records, [
        { id:'c1', name:'Sarah M.',  type:'General Treatment', version:'v2.0', signed:'2025-10-15', expiry:'2026-10-15', status:'active' },
        { id:'c2', name:'James K.',  type:'EEG Biofeedback',   version:'v1.1', signed:'2025-04-01', expiry:'2026-04-01', status:'expiring' },
        { id:'c3', name:'Liu W.',    type:'TMS Protocol',      version:'v2.0', signed:'2024-09-20', expiry:'2025-09-20', status:'expired' },
        { id:'c4', name:'Aisha B.',  type:'General Treatment', version:'v1.0', signed:'2025-01-10', expiry:'2026-01-10', status:'active' },
        { id:'c5', name:'Marcus T.', type:'Neurofeedback',     version:'v2.0', signed:'2025-11-30', expiry:'2026-11-30', status:'active' },
        { id:'c6', name:'Elena V.',  type:'General Treatment', version:null,   signed:null,         expiry:null,         status:'pending' },
      ]);
    }
    if (!lsGet(KEYS.versions)) {
      lsSave(KEYS.versions, [
        { id:'v1', ver:'v1.0', docName:'General Consent Form', effectiveDate:'2023-01-01', changes:'Initial version. Covers standard neuromodulation treatments, data use, and risk disclosure.', active:false, patientCount:1 },
        { id:'v2', ver:'v1.1', docName:'General Consent Form', effectiveDate:'2024-03-15', changes:'Added EEG biofeedback clause. Updated HIPAA section 3.2 to reflect new data-sharing policy. Minor wording clarifications throughout.', active:false, patientCount:1 },
        { id:'v3', ver:'v2.0', docName:'General Consent Form', effectiveDate:'2025-07-01', changes:'Major revision: Added TMS and neurofeedback-specific risk disclosures. Incorporated GDPR Article 7 explicit consent language. Added guardian consent section for minors. Removed deprecated HITECH references.', active:true, patientCount:3 },
      ]);
    }
    if (!lsGet(KEYS.automations)) {
      lsSave(KEYS.automations, [
        { id:'a1', name:'Annual Consent Renewal',  trigger:'30 days before consent expiry',          action:'Send reminder email to patient',           enabled:true  },
        { id:'a2', name:'New Treatment Modality',  trigger:'New modality added to treatment protocol', action:'Require patient to sign new consent form',  enabled:true  },
        { id:'a3', name:'Minor Patient Check',     trigger:'Patient date of birth indicates age < 18', action:'Require guardian/parental consent form',    enabled:false },
        { id:'a4', name:'HIPAA Policy Update',     trigger:'Consent policy version changes globally',  action:'Queue all active patients for re-consent',  enabled:true  },
      ]);
    }
    if (!lsGet(KEYS.audit)) {
      lsSave(KEYS.audit, [
        { id:'l1', ts:'2026-04-10T14:32:00Z', event:'Consent Signed',    patient:'Marcus T.', extra:'v2.0 Neurofeedback' },
        { id:'l2', ts:'2026-04-09T09:15:00Z', event:'Re-send Triggered', patient:'James K.',  extra:'Expiring Soon reminder' },
        { id:'l3', ts:'2026-04-08T11:05:00Z', event:'Consent Expired',   patient:'Liu W.',    extra:'TMS Protocol v2.0' },
        { id:'l4', ts:'2026-04-07T16:44:00Z', event:'Consent Signed',    patient:'Sarah M.',  extra:'v2.0 General Treatment' },
        { id:'l5', ts:'2026-04-05T10:20:00Z', event:'Consent Revoked',   patient:'Aisha B.',  extra:'Patient requested revocation then re-signed' },
        { id:'l6', ts:'2026-04-05T10:35:00Z', event:'Consent Signed',    patient:'Aisha B.',  extra:'v1.0 General Treatment' },
      ]);
    }
    if (!lsGet(KEYS.deletions)) {
      lsSave(KEYS.deletions, [
        { id:'d1', patient:'Liu W.',   requestDate:'2026-04-08', status:'pending',   dataTypes:'Session records, qEEG data, treatment notes' },
        { id:'d2', patient:'Elena V.', requestDate:'2026-03-22', status:'completed', dataTypes:'Contact information, intake form' },
      ]);
    }
  }

  seedIfNeeded();

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
    const records  = lsGet(KEYS.records) || [];
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
          <tbody>${rows || '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">No records match the filter.</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  // ── Tab 2: Automation Workflows ───────────────────────────────────────────
  function renderAutomation() {
    const autos = lsGet(KEYS.automations) || [];
    const audit  = (lsGet(KEYS.audit) || []).slice(0, 10);
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
          ${rules}
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
    const versions = lsGet(KEYS.versions) || [];
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
    const records = lsGet(KEYS.records) || [];
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
    const deletions = lsGet(KEYS.deletions) || [];
    const audit     = lsGet(KEYS.audit)     || [];
    const records   = lsGet(KEYS.records)   || [];
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
    const records  = lsGet(KEYS.records) || [];
    const filtered = _statusFilter === 'all' ? records : records.filter(r => r.status === _statusFilter);
    filtered.forEach(r => { if (checked) _selectedIds.add(r.id); else _selectedIds.delete(r.id); });
    const body = document.getElementById('ggg-consent-body');
    if (body && _tab === 'tracker') body.innerHTML = renderTracker();
  };

  window._consentBulkReconsent = function() {
    const ids = [..._selectedIds];
    if (!ids.length) return;
    const records = lsGet(KEYS.records) || [];
    const names   = records.filter(r => ids.includes(r.id)).map(r => r.name);
    if (!confirm(`Send re-consent request to ${names.join(', ')}?`)) return;
    names.forEach(n => addAudit('Re-send Triggered', n, 'Bulk re-consent'));
    alert(`Re-consent requests sent to ${names.join(', ')}.`);
    _selectedIds.clear();
    const body = document.getElementById('ggg-consent-body');
    if (body && _tab === 'tracker') body.innerHTML = renderTracker();
  };

  window._consentView = function(id) {
    const records = lsGet(KEYS.records) || [];
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
    const records = lsGet(KEYS.records) || [];
    const r = records.find(x => x.id === id);
    if (!r) return;
    addAudit('Re-send Triggered', r.name, r.type);
    alert(`Re-consent request sent to ${r.name}.`);
  };

  window._consentRevoke = function(id) {
    const records = lsGet(KEYS.records) || [];
    const idx = records.findIndex(x => x.id === id);
    if (idx < 0) return;
    if (!confirm(`Revoke consent for ${records[idx].name}? They will need to sign a new consent form.`)) return;
    addAudit('Consent Revoked', records[idx].name, records[idx].type);
    records[idx].status = 'expired';
    lsSave(KEYS.records, records);
    const body = document.getElementById('ggg-consent-body');
    if (body && _tab === 'tracker') body.innerHTML = renderTracker();
  };

  window._consentToggleRule = function(id, enabled) {
    const autos = lsGet(KEYS.automations) || [];
    const idx   = autos.findIndex(a => a.id === id);
    if (idx < 0) return;
    autos[idx].enabled = enabled;
    lsSave(KEYS.automations, autos);
    addAudit(enabled ? 'Rule Enabled' : 'Rule Disabled', 'System', autos[idx].name);
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

  window._consentSaveRule = function() {
    const name    = document.getElementById('ggg-rule-name')?.value.trim();
    const trigger = document.getElementById('ggg-rule-trigger')?.value.trim();
    const action  = document.getElementById('ggg-rule-action')?.value.trim();
    if (!name || !trigger || !action) { alert('Please fill in all fields.'); return; }
    const autos = lsGet(KEYS.automations) || [];
    autos.push({ id: 'a' + Date.now(), name, trigger, action, enabled: true });
    lsSave(KEYS.automations, autos);
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
    const versions = lsGet(KEYS.versions) || [];
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
    const versions = lsGet(KEYS.versions) || [];
    const v = versions.find(x => x.id === id);
    if (!v) return;
    if (!confirm(`Activate ${v.ver} as the current consent version? All new consents will use this version.`)) return;
    versions.forEach(x => { x.active = (x.id === id); });
    lsSave(KEYS.versions, versions);
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
    if (!ver || !docName || !date || !changes) { alert('Please fill in all fields.'); return; }
    const versions = lsGet(KEYS.versions) || [];
    versions.push({ id: 'v' + Date.now(), ver, docName, effectiveDate: date, changes, active: false, patientCount: 0 });
    lsSave(KEYS.versions, versions);
    addAudit('Version Created', 'System', `${ver} \u2014 ${docName}`);
    document.querySelector('.ggg-modal-overlay')?.remove();
    const body = document.getElementById('ggg-consent-body');
    if (body && _tab === 'versions') body.innerHTML = renderVersions();
  };

  window._consentProcessDeletion = function(id) {
    const deletions = lsGet(KEYS.deletions) || [];
    const idx = deletions.findIndex(d => d.id === id);
    if (idx < 0) return;
    const d = deletions[idx];
    if (!confirm(`Process data deletion request for ${d.patient}?\n\nData to be deleted:\n${d.dataTypes}\n\nThis action is irreversible and will be logged.`)) return;
    deletions[idx].status = 'completed';
    lsSave(KEYS.deletions, deletions);
    addAudit('Deletion Completed', d.patient, d.dataTypes);
    const body = document.getElementById('ggg-consent-body');
    if (body && _tab === 'gdpr') body.innerHTML = renderGDPR();
  };

  window._consentGenerateExport = function() {
    const ptId    = document.getElementById('ggg-export-pt')?.value;
    const records = lsGet(KEYS.records) || [];
    const r = records.find(x => x.id === ptId);
    if (!r) return;
    const auditAll = lsGet(KEYS.audit) || [];
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
    const records  = lsGet(KEYS.records) || [];
    const r = records.find(x => x.id === ptId);
    if (!r) return;
    const auditAll = lsGet(KEYS.audit) || [];
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
    const audit = lsGet(KEYS.audit) || [];
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
        alert('Could not access microphone: ' + (err.message || err.name));
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
    if (!confirm('Discard this draft? The transcript will be kept — you can generate a new draft later from the Media Review Queue.')) return;
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
          <span class="qqq-drug-pair">${int.drugA} ↔ ${int.drugB}</span>
          ${_severityBadge(int.severity)}
          ${int.type === 'drug-modality' ? '<span style="font-size:11px;color:var(--text-muted);background:var(--hover-bg);padding:2px 7px;border-radius:10px">Drug-Modality</span>' : ''}
          ${int.flagged ? '<span style="font-size:11px;color:#fbbf24">⚑ Flagged</span>' : ''}
          ${int.acknowledged ? '<span style="font-size:11px;color:var(--text-muted)">✓ Acknowledged</span>' : ''}
        </div>
        <div class="qqq-mechanism"><strong>Mechanism:</strong> ${int.mechanism}</div>
        <div class="qqq-recommendation">💡 ${int.recommendation}</div>
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
        ? r.items.map(it => `<div style="margin-top:5px;padding:5px 8px;background:var(--hover-bg);border-radius:6px;font-size:12px"><strong>${it.drug}:</strong> ${it.mechanism} — <em>${it.recommendation}</em></div>`).join('')
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
    sec.innerHTML = `<h3 style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:12px">Interaction Results — ${pt?.name || ''}</h3><div id="mic-int-cards"></div>`;
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
    if (checks.length === 0) { alert('No interaction log data to export.'); return; }
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
  function _renderResponses() {
    const subs = _fbGetSubs();
    if (!subs.length) return '<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);font-size:13px">No submissions yet.</div>';
    const rows = subs.map(s =>
      '<tr class="' + (s.flagged ? 'flagged' : '') + '" onclick="window._fbShowSubDetail(\'' + _e(s.id) + '\')" style="cursor:pointer"><td>' + _e(s.patientName) + '</td><td>' + _e(s.formName) + '</td><td>' + _fbFmt(s.date) + '</td><td>' + (s.score != null ? s.score : '\u2014') + '</td><td>' + (s.severity ? '<span class="ppp-severity-pill ' + _fbSevClass(s.severity) + '">' + _e(s.severity) + '</span>' : '\u2014') + '</td><td>' + (s.flagged ? '<span style="color:var(--red);font-size:11px">\uD83D\uDEA9</span>' : '<button class="ppp-lib-btn" style="flex:none" onclick="event.stopPropagation();window._fbFlagSub(\'' + _e(s.id) + '\')">Flag</button>') + '</td></tr>'
    ).join('');
    return '<div style="height:100%;overflow:hidden;display:flex;flex-direction:column"><div style="flex:1;overflow-y:auto;padding:20px 24px"><div style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px"><div style="font-size:13px;font-weight:500;color:var(--text-primary)">' + subs.length + ' submission' + (subs.length !== 1 ? 's' : '') + '</div><button class="btn btn-sm" onclick="window._fbExportCSV()">Export CSV</button></div><div style="overflow-x:auto"><table class="ppp-subs-table"><thead><tr><th>Patient</th><th>Form</th><th>Date</th><th>Score</th><th>Severity</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table></div></div></div>';
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
  window._fbDeployForm = id => { const form = _fbGetForm(id); if (!form) return; const deps = _fbLoad('ds_form_deployments', []); let added = 0; ['pt001','pt002','pt003'].forEach(pid => { if (!deps.find(d => d.formId === id && d.patientId === pid)) { deps.push({ formId:id, patientId:pid, assignedAt:new Date().toISOString(), frequency:form.frequency }); added++; } }); _fbSave('ds_form_deployments', deps); alert('Form "' + form.name + '" deployed to ' + (added > 0 ? added + ' patient(s)' : 'all active patients (already assigned)') + '.'); };
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
  window._fbSaveFormBtn = () => { const form = _fbGetForm(_fbActiveId); if (!form) return; form.lastModified = new Date().toISOString(); _fbSaveForm(form); window._announce?.('Form saved'); const btn = document.activeElement; if (btn && btn.tagName === 'BUTTON') { const orig = btn.textContent; btn.textContent = 'Saved \u2713'; setTimeout(() => { btn.textContent = orig; }, 1500); } };
  window._fbPublishForm = () => { const form = _fbGetForm(_fbActiveId); if (!form) return; form.published = true; form.publishedAt = new Date().toISOString(); form.lastModified = new Date().toISOString(); _fbSaveForm(form); alert('Form "' + form.name + '" published and available for deployment.'); };
  window._fbExportFormJSON = () => { const form = _fbGetForm(_fbActiveId); if (!form) return; const blob = new Blob([JSON.stringify(form, null, 2)], { type:'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = form.id + '_v' + (form.version || '1') + '.json'; a.click(); URL.revokeObjectURL(url); };
  window._fbShowTypePicker = () => { const ov = document.createElement('div'); ov.className = 'ppp-type-picker-overlay'; ov.innerHTML = '<div class="ppp-type-picker" onclick="event.stopPropagation()"><div class="ppp-type-picker-title">Choose Question Type</div><div class="ppp-type-grid">' + Q_TYPES.map(t => '<div class="ppp-type-option" onclick="window._fbAddQuestion(\'' + t.type + '\');document.querySelector(\'.ppp-type-picker-overlay\').remove()"><div class="ppp-type-option-label"><span class="ppp-type-badge ' + t.type + '">' + t.type + '</span> ' + t.label + '</div><div class="ppp-type-option-desc">' + t.desc + '</div></div>').join('') + '</div><div style="margin-top:14px;text-align:right"><button class="btn btn-sm" onclick="document.querySelector(\'.ppp-type-picker-overlay\').remove()">Cancel</button></div></div>'; ov.addEventListener('click', () => ov.remove()); document.body.appendChild(ov); };
  window._fbAddQuestion = type => { const form = _fbGetForm(_fbActiveId); if (!form || form.locked) return; const defs = { likert:{scale:[0,1,2,3],scaleLabels:['Not at all','Several days','More than half the days','Nearly every day'],options:null,min:null,max:null}, text:{scale:null,scaleLabels:null,options:null,min:null,max:null}, textarea:{scale:null,scaleLabels:null,options:null,min:null,max:null}, yesno:{scale:null,scaleLabels:null,options:null,min:null,max:null}, slider:{scale:null,scaleLabels:null,options:null,min:0,max:10}, checkbox:{scale:null,scaleLabels:null,options:['Option A','Option B','Option C'],min:null,max:null}, date:{scale:null,scaleLabels:null,options:null,min:null,max:null}, number:{scale:null,scaleLabels:null,options:null,min:0,max:100} }; const q = Object.assign({ id:'q_' + Date.now(), type, text:'', required:false }, defs[type] || {}); if (!form.questions) form.questions = []; form.questions.push(q); form.lastModified = new Date().toISOString(); _fbSaveForm(form); document.getElementById('ppp-q-list').innerHTML = _renderQList(form.questions); _fbBindDrag(); const cards = document.querySelectorAll('.ppp-canvas-question'); const last = cards[cards.length - 1]; if (last) { last.scrollIntoView({ behavior:'smooth', block:'nearest' }); last.querySelector('.ppp-q-text')?.focus(); } };
  window._fbPreviewForm = () => { const form = _fbGetForm(_fbActiveId); if (!form) return; const qs = form.questions || []; const qH = qs.length === 0 ? '<div style="color:var(--text-tertiary);font-size:13px;padding:20px 0">No questions added yet.</div>' : qs.map((q, i) => '<div class="ppp-preview-q"><div class="ppp-preview-q-text">' + (i + 1) + '. ' + _e(q.text || '(No question text)') + (q.required ? '<span class="required-star">*</span>' : '') + '</div>' + _renderPreviewWidget(q, i) + '</div>').join(''); const modal = document.createElement('div'); modal.className = 'ppp-preview-modal'; modal.innerHTML = '<div class="ppp-preview-modal-inner"><button onclick="document.querySelector(\'.ppp-preview-modal\').remove()" style="position:absolute;top:16px;right:16px;background:none;border:none;color:var(--text-tertiary);font-size:20px;cursor:pointer;line-height:1">\u2715</button><div style="font-size:10px;color:var(--teal);letter-spacing:1px;text-transform:uppercase;font-weight:600;margin-bottom:6px">Patient Preview</div><div class="ppp-preview-form-title">' + _e(form.name) + '</div>' + (form.description ? '<div class="ppp-preview-form-desc">' + _e(form.description) + '</div>' : '') + qH + (qs.length ? '<div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border);display:flex;justify-content:flex-end"><button class="btn btn-sm btn-primary" onclick="document.querySelector(\'.ppp-preview-modal\').remove()">Submit</button></div>' : '') + '</div>'; modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); }); document.body.appendChild(modal); };
  window._fbShowSubDetail = subId => { const subs = _fbGetSubs(); const sub = subs.find(s => s.id === subId); if (!sub) return; const form = _fbGetForm(sub.formId); const trend = subs.filter(s => s.formId === sub.formId && s.patientId === sub.patientId && s.score != null).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-5); document.querySelector('.ppp-sub-detail')?.remove(); const qs = form?.questions || []; const ansH = (sub.answers || []).map((a, i) => '<div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border)"><div style="font-size:11px;color:var(--text-tertiary);margin-bottom:3px">' + _e(qs[i]?.text || 'Question ' + (i + 1)) + '</div><div style="font-size:12.5px;color:var(--text-primary);font-weight:500">' + _e(String(a)) + '</div></div>').join(''); const panel = document.createElement('div'); panel.className = 'ppp-sub-detail'; panel.innerHTML = '<div class="ppp-sub-detail-header"><div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--text-primary)">' + _e(sub.formName) + '</div><div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">' + _e(sub.patientName) + ' &bull; ' + _fbFmt(sub.date) + '</div></div><button onclick="document.querySelector(\'.ppp-sub-detail\').remove()" style="background:none;border:none;color:var(--text-tertiary);font-size:18px;cursor:pointer">\u2715</button></div><div class="ppp-sub-detail-scroll"><div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:12px 14px;background:var(--bg-surface);border-radius:8px"><div><div style="font-size:24px;font-weight:700;color:var(--teal)">' + (sub.score != null ? sub.score : '\u2014') + '</div><div style="font-size:10px;color:var(--text-tertiary)">Score' + (form?.maxScore ? ' / ' + form.maxScore : '') + '</div></div>' + (sub.severity ? '<span class="ppp-severity-pill ' + _fbSevClass(sub.severity) + '" style="font-size:12px;padding:4px 12px">' + _e(sub.severity) + '</span>' : '') + (sub.flagged ? '<span style="color:var(--red);font-size:12px">\uD83D\uDEA9 Flagged</span>' : '') + '</div>' + (trend.length > 1 ? '<div style="margin-bottom:16px"><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;font-weight:500;margin-bottom:6px">Score Trend (Last ' + trend.length + ')</div>' + _fbTrendSVG(trend) + '</div>' : '') + '<div style="margin-bottom:16px"><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;font-weight:500;margin-bottom:10px">Response Detail</div>' + (ansH || '<div style="color:var(--text-tertiary);font-size:12px">No detailed answers recorded.</div>') + '</div><div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--border)">' + (!sub.flagged ? '<button class="btn btn-sm" style="color:var(--red);border-color:rgba(255,107,107,0.3)" onclick="window._fbFlagSub(\'' + _e(subId) + '\');document.querySelector(\'.ppp-sub-detail\').remove()">\uD83D\uDEA9 Flag for Review</button>' : '<span style="font-size:12px;color:var(--red)">\uD83D\uDEA9 Already Flagged</span>') + '</div></div>'; document.body.appendChild(panel); };
  window._fbFlagSub = subId => { const subs = _fbGetSubs(); const sub = subs.find(s => s.id === subId); if (!sub) return; sub.flagged = true; _fbSave('ds_form_submissions', subs); el.innerHTML = _renderBuilder(); if (_fbTab === 'builder') _fbBindDrag(); };
  window._fbExportCSV = () => { const subs = _fbGetSubs(); if (!subs.length) { alert('No submissions to export.'); return; } const hdr = ['ID','Patient','Form','Date','Score','Severity','Flagged']; const rows = subs.map(s => [s.id, s.patientName, s.formName, _fbFmt(s.date), s.score != null ? s.score : '', s.severity || '', s.flagged ? 'Yes' : 'No'].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')); const blob = new Blob([[hdr.join(','), ...rows].join('\n')], { type:'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'form_submissions_' + new Date().toISOString().slice(0, 10) + '.csv'; a.click(); URL.revokeObjectURL(url); };
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
      <span><strong style="color:var(--text)">Effect size:</strong> d = ${paper.effectSize} ${_ebEsc(paper.ci)}</span>
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
    if (protoIdx === -1) { alert('Select a protocol first.'); return; }
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
    if (!proto) { alert('Select a protocol first.'); return; }
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
    if (!window._ebLastSummary) { alert('Generate a summary first.'); return; }
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
    if (!text) { alert('Generate a summary first.'); return; }
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
      '<button class="pq-qa-btn" onclick="window._nav(\'forms-builder\')"><span class="pq-qa-icon">\uD83D\uDCCA</span><span>Record Outcome</span></button>' +
      '<button class="pq-qa-btn" onclick="window._nav(\'patient-profile\')"><span class="pq-qa-icon">\uD83D\uDC65</span><span>View All Patients</span></button>' +
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

// ── pgAssessmentsHub — Assessment library & scheduling ────────────────────────

export async function pgAssessmentsHub(setTopbar) {
  setTopbar('Assessments', `
    <button class="btn btn-sm" onclick="window._nav('assessments')">Legacy View</button>
  `);
  const el = document.getElementById('content');
  if (!el) return;

  const CATS = ['All', 'Mood', 'Anxiety', 'PTSD', 'Cognition', 'Sleep', 'Substance', 'QoL', 'Side Effects'];

  const BUNDLES = [
    { id:'phq9',   name:'PHQ-9',       cat:'Mood',     items:9,  mins:3,  ev:'A', timing:['pre','weekly','post'], desc:'Gold-standard depression severity screen. Mandatory for MDD, TRD, BD-Depression, Postpartum.' },
    { id:'madrs',  name:'MADRS',       cat:'Mood',     items:10, mins:15, ev:'A', timing:['pre','milestone','post'], desc:'Clinician-rated depression scale. Preferred for TMS/tDCS MDD protocols.' },
    { id:'hamd',   name:'HAM-D 17',    cat:'Mood',     items:17, mins:20, ev:'A', timing:['pre','weekly','post'], desc:'Hamilton Depression Rating. Widely used in RCTs.' },
    { id:'gad7',   name:'GAD-7',       cat:'Anxiety',  items:7,  mins:2,  ev:'A', timing:['pre','weekly','post'], desc:'Generalised anxiety disorder 7-item scale.' },
    { id:'pcl5',   name:'PCL-5',       cat:'PTSD',     items:20, mins:5,  ev:'A', timing:['pre','weekly','post'], desc:'PTSD Checklist DSM-5 version. Required for PTSD protocols.' },
    { id:'ybocs',  name:'Y-BOCS',      cat:'Anxiety',  items:10, mins:20, ev:'A', timing:['pre','weekly'], desc:'Yale-Brown OCD Scale. Clinician-rated, required for OCD.' },
    { id:'dass21', name:'DASS-21',     cat:'Mood',     items:21, mins:5,  ev:'A', timing:['pre','weekly','post'], desc:'Depression, Anxiety and Stress 21-item scale.' },
    { id:'isi',    name:'ISI',         cat:'Sleep',    items:7,  mins:2,  ev:'A', timing:['pre','weekly','post'], desc:'Insomnia Severity Index. Self-report, 7-item.' },
    { id:'moca',   name:'MoCA',        cat:'Cognition',items:30, mins:10, ev:'A', timing:['pre','milestone'], desc:'Montreal Cognitive Assessment. Baseline cognitive screen.' },
    { id:'audit',  name:'AUDIT',       cat:'Substance',items:10, mins:5,  ev:'A', timing:['pre','milestone'], desc:'Alcohol Use Disorders Identification Test.' },
    { id:'bprs',   name:'BPRS',        cat:'Mood',     items:18, mins:20, ev:'B', timing:['pre','weekly'], desc:'Brief Psychiatric Rating Scale. For psychotic features.' },
    { id:'cgi',    name:'CGI-S / CGI-I',cat:'QoL',   items:2,  mins:2,  ev:'A', timing:['pre','weekly','post'], desc:'Clinical Global Impression — severity and improvement.' },
    { id:'eq5d',   name:'EQ-5D',       cat:'QoL',     items:5,  mins:2,  ev:'A', timing:['pre','post'], desc:'Generic health-related quality of life. Pre/post course.' },
    { id:'ses',    name:'Side Effects', cat:'Side Effects', items:12, mins:3, ev:'B', timing:['weekly'], desc:'Neuromodulation-specific side-effect checklist. Headache, skin sensation, mood.' },
  ];

  const evColor = { A: '#2dd4bf', B: '#60a5fa', C: '#fbbf24', D: '#94a3b8' };

  function renderBundle(b, cat) {
    if (cat !== 'All' && b.cat !== cat) return '';
    const ec = evColor[b.ev] || '#94a3b8';
    return `<div class="card" style="padding:0;cursor:default">
      <div style="padding:12px 16px">
        <div style="display:flex;gap:8px;align-items:flex-start;justify-content:space-between;margin-bottom:4px">
          <div>
            <span style="font-size:13px;font-weight:600;color:var(--text-primary)">${b.name}</span>
            <span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:3px;background:${ec}22;color:${ec};border:1px solid ${ec}33;margin-left:6px">EV-${b.ev}</span>
          </div>
          <span style="font-size:10.5px;color:var(--text-tertiary);white-space:nowrap">${b.items} items · ${b.mins} min</span>
        </div>
        <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5;margin-bottom:8px">${b.desc}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
          ${b.timing.map(t => {
            const tl = { pre:'Pre-treatment', weekly:'Weekly', post:'Post-treatment', milestone:'At milestone', prn:'PRN' };
            return `<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:var(--text-tertiary)">${tl[t] || t}</span>`;
          }).join('')}
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-primary btn-sm" onclick="window._ahSchedule('${b.id}','${b.name}')">Schedule →</button>
          <button class="btn btn-sm" onclick="window._ahAdminister('${b.id}','${b.name}')">Administer Now</button>
        </div>
      </div>
    </div>`;
  }

  let activeCat = 'All';

  function renderPage(cat) {
    el.innerHTML = `
      <div style="max-width:960px;margin:0 auto">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
          ${CATS.map(c => `<button class="btn btn-sm${c === cat ? ' btn-primary' : ''}" onclick="window._ahCat('${c}')">${c}</button>`).join('')}
        </div>
        <div class="g3" style="align-items:start">
          ${BUNDLES.map(b => renderBundle(b, cat)).join('')}
        </div>
      </div>`;

    window._ahCat = function(c) { activeCat = c; renderPage(activeCat); };

    window._ahSchedule = function(id, name) {
      window._showNotifToast?.({ title: 'Scheduled', body: `${name} added to assessment schedule.`, severity: 'info' });
    };

    window._ahAdminister = function(id, name) {
      window._nav('assessments');
    };
  }

  renderPage(activeCat);
}

// ── pgBrainMapPlanner — Interactive 10-20 stimulation map ─────────────────────

export async function pgBrainMapPlanner(setTopbar) {
  setTopbar('Brain Map Planner', `
    <button class="btn btn-sm" onclick="window._nav('protocols')" style="border-color:var(--teal);color:var(--teal)">Protocol Library →</button>
  `);
  const el = document.getElementById('content');
  if (!el) return;

  // Load registry data for dropdowns
  let conds = [], mods = [], protos = [];
  try {
    const [cd, md, pd] = await Promise.all([
      api.conditions().catch(() => null),
      api.modalities().catch(() => null),
      api.protocols().catch(() => null),
    ]);
    conds  = cd?.items  || [];
    mods   = md?.items  || [];
    protos = pd?.items  || [];
  } catch (_) {}

  const TARGET_REGIONS = [
    'DLPFC','M1','SMA','VMPFC','PFC','Cerebellum','Parietal','Occipital','Temporal','Insula',
    'Primary Somatosensory',
  ];
  const LATERALITIES = ['left','right','bilateral'];

  el.innerHTML = `
    <div style="max-width:1000px;margin:0 auto">
      <div class="g2" style="gap:24px;align-items:start">
        <!-- Controls -->
        <div>
          <div class="card" style="margin-bottom:14px">
            <div class="card-header"><h3>Stimulation Target</h3></div>
            <div class="card-body">
              <div class="form-group">
                <label class="form-label">Modality</label>
                <select id="bmp-mod" class="form-control" onchange="window._bmpRender()">
                  <option value="">Select modality</option>
                  ${mods.map(m => `<option value="${m.id||m.name||m.Modality_Name}">${m.name||m.Modality_Name||m.id}</option>`).join('')}
                  ${!mods.length ? ['TMS / rTMS','tDCS','tACS','Neurofeedback','HEG','LENS'].map(m => `<option value="${m}">${m}</option>`).join('') : ''}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Target Region</label>
                <select id="bmp-region" class="form-control" onchange="window._bmpRender()">
                  <option value="">Select region</option>
                  ${TARGET_REGIONS.map(r => `<option value="${r}">${r}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Laterality</label>
                <select id="bmp-lat" class="form-control" onchange="window._bmpRender()">
                  ${LATERALITIES.map(l => `<option value="${l}">${l.charAt(0).toUpperCase() + l.slice(1)}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h3>Match to Registry Protocol</h3></div>
            <div class="card-body">
              <div id="bmp-matched" style="font-size:12px;color:var(--text-tertiary)">Select a region to see matching protocols.</div>
            </div>
          </div>
        </div>
        <!-- Map display -->
        <div>
          <div class="card" style="text-align:center">
            <div class="card-header"><h3>10-20 Stimulation Map</h3></div>
            <div class="card-body" style="display:flex;flex-direction:column;align-items:center;gap:12px">
              <div id="bmp-map-container" style="padding:12px">
                <div style="font-size:12px;color:var(--text-tertiary)">Select modality + region to see map.</div>
              </div>
              <div id="bmp-legend" style="display:none;font-size:11px;color:var(--text-tertiary);line-height:1.7;text-align:left;max-width:280px"></div>
            </div>
          </div>
          <div style="margin-top:12px;text-align:center">
            <button class="btn btn-primary" onclick="window._bmpUseInWizard()">Use in Protocol Wizard →</button>
          </div>
        </div>
      </div>
    </div>`;

  window._bmpRender = function() {
    const mod    = document.getElementById('bmp-mod')?.value    || '';
    const region = document.getElementById('bmp-region')?.value || '';
    const lat    = document.getElementById('bmp-lat')?.value    || 'bilateral';

    const mapCont = document.getElementById('bmp-map-container');
    const legend  = document.getElementById('bmp-legend');
    const matched = document.getElementById('bmp-matched');

    if (!mod && !region) {
      if (mapCont) mapCont.innerHTML = `<div style="font-size:12px;color:var(--text-tertiary)">Select modality + region to see map.</div>`;
      if (legend) legend.style.display = 'none';
      return;
    }

    // Render map (large version for the planner)
    if (mapCont) {
      const mapHtml = _stimMapSVG(region, lat, mod);
      // Make it larger by replacing the fixed width/height in the output
      mapCont.innerHTML = mapHtml.replace('width="148" height="148"', 'width="220" height="220"').replace('viewBox="0 0 148 148"', 'viewBox="0 0 148 148"');
    }

    if (legend) {
      legend.style.display = '';
      const modL = mod.toLowerCase();
      const isNFB = modL.includes('nfb') || modL.includes('neurofeedback');
      const isTDCS = modL.includes('tdcs') || modL.includes('tacs');
      const isTMS  = modL.includes('tms');
      legend.innerHTML = [
        region  ? `<strong>Target:</strong> ${region}` : null,
        lat !== 'bilateral' ? `<strong>Laterality:</strong> ${lat}` : null,
        isNFB  ? '<strong>Protocol type:</strong> Neurofeedback — active electrode(s) shown' : null,
        isTDCS ? '<strong>Protocol type:</strong> Transcranial electrical — anode site shown. Cathode placement varies by protocol.' : null,
        isTMS  ? '<strong>Protocol type:</strong> Transcranial magnetic — coil center position shown' : null,
      ].filter(Boolean).map(l => `<div>${l}</div>`).join('');
    }

    // Find matching registry protocols
    if (matched) {
      const hits = protos.filter(p => {
        const r = (p.target_region || '').toLowerCase();
        const m = (p.modality_id  || '').toLowerCase();
        return (!region || r.includes(region.toLowerCase().slice(0,4)))
          && (!mod || m.includes(mod.toLowerCase().slice(0,4)));
      }).slice(0, 4);

      matched.innerHTML = hits.length
        ? hits.map(p => `<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
            <div style="font-weight:500;color:var(--text-primary)">${p.name || '—'}</div>
            <div style="color:var(--text-tertiary);font-size:11px">${p.condition_id || ''} · ${p.evidence_grade || ''}</div>
          </div>`).join('')
        : `<div style="color:var(--text-tertiary);font-size:11.5px">No registry protocols match current selection.</div>`;
    }
  };

  window._bmpUseInWizard = function() {
    const region = document.getElementById('bmp-region')?.value || '';
    const lat    = document.getElementById('bmp-lat')?.value    || 'bilateral';
    const mod    = document.getElementById('bmp-mod')?.value    || '';
    if (window._wizState) {
      window._wizState.targetRegion = region;
      window._wizState.laterality   = lat;
      if (mod && !(window._wizState.modalitySlugs||[]).includes(mod)) {
        window._wizState.modalitySlugs = [mod];
      }
      window._wizState._fresh = false;
    }
    window._pilMode = 'wizard';
    window._nav('protocols');
  };
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

// ── pgMedicalHistory — Structured clinical history ────────────────────────────
export async function pgMedicalHistory(setTopbar) {
  setTopbar('Medical History', `
    <button class="btn btn-primary btn-sm" onclick="window._mhSave()">Save Changes</button>
    <button class="btn btn-sm" onclick="window._mhPrint()">Print / Export</button>
  `);
  const el = document.getElementById('content');
  if (!el) return;

  // Load patient list for selector
  let patients = [];
  try { const r = await api.patients().catch(() => null); patients = r?.items || r || []; } catch (_) {}

  const STORAGE_KEY = 'ds_medical_history';
  function loadHistory(pid) {
    try { const d = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); return d[pid] || {}; } catch { return {}; }
  }
  function saveHistory(pid, data) {
    try { const d = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); d[pid] = data; localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {}
  }
  function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  const SECTIONS = [
    { id: 'presenting',    label: 'Presenting Complaint',          icon: '◉', fields: [
      { id: 'chief_complaint', label: 'Chief Complaint', type: 'textarea', placeholder: 'Primary reason for referral and main symptoms…' },
      { id: 'symptom_onset',   label: 'Symptom Onset',  type: 'text',     placeholder: 'e.g. 6 months ago, gradual onset' },
      { id: 'severity',        label: 'Current Severity (0–10)', type: 'number', placeholder: '0–10' },
      { id: 'impact',          label: 'Functional Impact',  type: 'textarea', placeholder: 'Work, relationships, daily activities…' },
    ]},
    { id: 'diagnoses',     label: 'Diagnoses',                     icon: '◈', fields: [
      { id: 'primary_dx',   label: 'Primary Diagnosis (ICD-10)',   type: 'text',     placeholder: 'e.g. F32.2 — Major Depressive Disorder, severe' },
      { id: 'secondary_dx', label: 'Secondary Diagnoses',          type: 'textarea', placeholder: 'List additional diagnoses with ICD codes…' },
      { id: 'dx_notes',     label: 'Diagnostic Notes',             type: 'textarea', placeholder: 'Diagnostic criteria met, differential considered…' },
    ]},
    { id: 'psychiatric',   label: 'Psychiatric History',           icon: '◧', fields: [
      { id: 'prior_episodes',   label: 'Prior Psychiatric Episodes',    type: 'textarea', placeholder: 'Number, duration, severity of past episodes…' },
      { id: 'prior_treatments', label: 'Prior Treatments',              type: 'textarea', placeholder: 'Medications tried, dosages, outcomes, reasons for discontinuation…' },
      { id: 'hospitalizations', label: 'Psychiatric Hospitalizations',  type: 'textarea', placeholder: 'Dates, facilities, reasons…' },
      { id: 'suicide_risk',     label: 'Suicide / Self-Harm History',   type: 'textarea', placeholder: 'Ideation, attempts, current risk assessment…' },
      { id: 'current_therapist',label: 'Current Therapist / Psychiatrist', type: 'text', placeholder: 'Name, clinic, contact' },
    ]},
    { id: 'neurological',  label: 'Neurological History',          icon: '◎', fields: [
      { id: 'neuro_conditions', label: 'Neurological Conditions',       type: 'textarea', placeholder: "e.g. migraines, TBI, MS, Parkinson's, stroke…" },
      { id: 'brain_injury',     label: 'Head / Brain Injury',           type: 'textarea', placeholder: 'Date, mechanism, severity, sequelae…' },
      { id: 'neuro_tests',      label: 'Prior Neurological Tests',      type: 'textarea', placeholder: 'EEG, MRI, CT, neuropsychological testing — results and dates…' },
    ]},
    { id: 'medications',   label: 'Medications & Supplements',     icon: '◩', fields: [
      { id: 'current_meds',     label: 'Current Medications',           type: 'textarea', placeholder: 'Drug, dose, frequency, prescriber…' },
      { id: 'supplements',      label: 'Supplements / OTC',             type: 'textarea', placeholder: 'Vitamins, herbs, OTC medications…' },
      { id: 'past_meds',        label: 'Past Medications (relevant)',    type: 'textarea', placeholder: 'Medications tried previously with outcomes…' },
      { id: 'med_interactions', label: 'Known Drug Interactions / Concerns', type: 'textarea', placeholder: 'Any flagged interactions or prescriber concerns…' },
    ]},
    { id: 'allergies',     label: 'Allergies',                     icon: '⚠', fields: [
      { id: 'drug_allergies',   label: 'Drug Allergies',                type: 'textarea', placeholder: 'Drug name — reaction type…' },
      { id: 'other_allergies',  label: 'Other Allergies',               type: 'textarea', placeholder: 'Food, environmental, latex, metals…' },
      { id: 'allergy_notes',    label: 'Allergy Notes',                 type: 'textarea', placeholder: 'Severity, cross-reactivity, anaphylaxis risk…' },
    ]},
    { id: 'seizure',       label: 'Seizure History',               icon: '⚠', fields: [
      { id: 'seizure_history',  label: 'Seizure / Epilepsy History',    type: 'textarea', placeholder: 'Type, frequency, last episode, current status…' },
      { id: 'seizure_meds',     label: 'Anti-epileptic Medications',    type: 'text',     placeholder: 'Current AEDs if applicable…' },
      { id: 'seizure_risk',     label: 'Seizure Risk Assessment',       type: 'select',   options: ['Not assessed', 'Low', 'Moderate', 'High — contraindicated'] },
    ]},
    { id: 'implants',      label: 'Implants & Contraindications',  icon: '⚠', fields: [
      { id: 'metal_implants',   label: 'Metal Implants / Devices',      type: 'textarea', placeholder: 'Cochlear implants, DBS leads, aneurysm clips, cardiac devices…' },
      { id: 'pacemaker',        label: 'Cardiac Device',                type: 'select',   options: ['None', 'Pacemaker', 'ICD', 'CRT-D', 'Other cardiac device'] },
      { id: 'pregnancy',        label: 'Pregnancy / Breastfeeding',     type: 'select',   options: ['N/A', 'Pregnant — trimester:', 'Breastfeeding', 'Planning pregnancy'] },
      { id: 'contra_notes',     label: 'Contraindication Notes',        type: 'textarea', placeholder: 'Safety review, clinician sign-off, workarounds…' },
      { id: 'contra_cleared',   label: 'Safety Clearance',              type: 'select',   options: ['Pending review', 'Cleared — proceed', 'Cleared with conditions', 'Contraindicated — do not proceed'] },
    ]},
    { id: 'neuromod',      label: 'Prior Neuromodulation History', icon: '◎', fields: [
      { id: 'prior_neuromod',   label: 'Prior Neuromodulation Treatments', type: 'textarea', placeholder: 'TMS, tDCS, ECT, DBS, etc. — dates, modality, target, sessions…' },
      { id: 'neuromod_response',label: 'Treatment Response',              type: 'textarea', placeholder: 'Responder / partial / non-responder, % improvement, notes…' },
      { id: 'neuromod_ae',      label: 'Adverse Events from Prior Treatment', type: 'textarea', placeholder: 'Any adverse effects during or after prior neuromodulation…' },
      { id: 'neuromod_pref',    label: 'Patient Preferences',            type: 'textarea', placeholder: 'Device tolerance, session preferences, anxiety about treatment…' },
    ]},
    { id: 'sleep',         label: 'Sleep History',                 icon: '◌', fields: [
      { id: 'sleep_quality',    label: 'Current Sleep Quality',          type: 'select',   options: ['Good', 'Mild difficulties', 'Moderate difficulties', 'Severe insomnia'] },
      { id: 'sleep_hours',      label: 'Average Sleep (hours/night)',     type: 'number',   placeholder: 'e.g. 6' },
      { id: 'sleep_conditions', label: 'Sleep Conditions',               type: 'textarea', placeholder: 'Sleep apnea, restless legs, parasomnias, CPAP use…' },
      { id: 'sleep_notes',      label: 'Sleep History Notes',            type: 'textarea', placeholder: 'Patterns, triggers, impact on symptoms…' },
    ]},
    { id: 'family',        label: 'Family History',                icon: '◉', fields: [
      { id: 'family_psych',     label: 'Family Psychiatric History',     type: 'textarea', placeholder: 'Depression, bipolar, schizophrenia, anxiety, ADHD, OCD…' },
      { id: 'family_neuro',     label: 'Family Neurological History',    type: 'textarea', placeholder: "Epilepsy, dementia, stroke, Parkinson's, MS\u2026" },
      { id: 'family_notes',     label: 'Family History Notes',           type: 'textarea', placeholder: 'First-degree relatives, severity, treatment responses…' },
    ]},
    { id: 'substance',     label: 'Substance Use',                 icon: '◧', fields: [
      { id: 'alcohol',          label: 'Alcohol Use',                    type: 'select',   options: ['None', 'Social / low risk', 'Moderate', 'Heavy use', 'Dependence / AUD', 'In remission'] },
      { id: 'tobacco',          label: 'Tobacco / Nicotine',             type: 'select',   options: ['Never', 'Former (>1yr)', 'Former (<1yr)', 'Current'] },
      { id: 'cannabis',         label: 'Cannabis',                       type: 'select',   options: ['Never', 'Occasional', 'Regular', 'Daily', 'CUD'] },
      { id: 'other_substances', label: 'Other Substances',               type: 'textarea', placeholder: 'Opioids, stimulants, benzodiazepines, other — use pattern, last use…' },
      { id: 'substance_notes',  label: 'Substance Use Notes',            type: 'textarea', placeholder: 'Treatment history, current program, harm reduction…' },
    ]},
    { id: 'surgical',      label: 'Surgeries & Major Illness',     icon: '◩', fields: [
      { id: 'surgeries',        label: 'Surgeries',                      type: 'textarea', placeholder: 'Procedure, year, hospital, complications…' },
      { id: 'major_illness',    label: 'Major Medical Illness',          type: 'textarea', placeholder: 'Cancer, cardiac events, autoimmune conditions, hospitalizations…' },
      { id: 'chronic_conditions',label:'Chronic Medical Conditions',     type: 'textarea', placeholder: 'Diabetes, hypertension, thyroid, cardiovascular, chronic pain…' },
    ]},
    { id: 'summary',       label: 'Clinician Summary',             icon: '◈', fields: [
      { id: 'clinical_summary', label: 'Clinical Summary',               type: 'textarea', placeholder: 'Overall clinical formulation, diagnostic impression, key risk factors…', rows: 6 },
      { id: 'treatment_goals',  label: 'Treatment Goals',                type: 'textarea', placeholder: 'Short-term and long-term goals agreed with patient…' },
      { id: 'safety_flags',     label: 'Safety Flags for Protocol Team', type: 'textarea', placeholder: 'Contraindications, cautions, monitoring requirements to flag for neuromod team…' },
      { id: 'last_updated_by',  label: 'Last Updated By',                type: 'text',     placeholder: 'Clinician name' },
    ]},
  ];

  function fieldHTML(f, val) {
    const v = esc(val ?? '');
    if (f.type === 'textarea') {
      return `<textarea id="mh-${f.id}" class="form-control" placeholder="${esc(f.placeholder || '')}" style="min-height:${(f.rows||3)*22}px;resize:vertical;font-size:13px">${v}</textarea>`;
    }
    if (f.type === 'select') {
      return `<select id="mh-${f.id}" class="form-control" style="font-size:13px">${f.options.map(o => `<option${val===o?' selected':''}>${esc(o)}</option>`).join('')}</select>`;
    }
    return `<input id="mh-${f.id}" class="form-control" type="${f.type||'text'}" placeholder="${esc(f.placeholder||'')}" value="${v}" style="font-size:13px">`;
  }

  function sectionHTML(sec, data) {
    return `<div class="mh-section card" id="mh-sec-${sec.id}" style="margin-bottom:16px">
      <div class="mh-sec-hd" onclick="window._mhToggle('${sec.id}')" style="display:flex;align-items:center;gap:10px;padding:14px 18px;cursor:pointer;user-select:none">
        <span style="font-size:15px">${sec.icon}</span>
        <span style="font-size:13px;font-weight:600;color:var(--text)">${esc(sec.label)}</span>
        <span id="mh-chev-${sec.id}" style="margin-left:auto;font-size:12px;color:var(--text-muted);transition:transform 0.2s">▼</span>
      </div>
      <div id="mh-body-${sec.id}" style="padding:0 18px 18px">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px">
          ${sec.fields.map(f => `<div>
            <label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.6px">${esc(f.label)}</label>
            ${fieldHTML(f, data[f.id])}
          </div>`).join('')}
        </div>
      </div>
    </div>`;
  }

  function buildForm(pid, data) {
    el.innerHTML = `
      <div style="max-width:900px;margin:0 auto">
        <!-- Patient selector -->
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:20px;flex-wrap:wrap">
          <div style="flex:1;min-width:220px">
            <label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.6px">Patient</label>
            <select id="mh-patient-sel" class="form-control" onchange="window._mhSwitchPatient(this.value)" style="font-size:13px">
              <option value="">— Select patient —</option>
              ${patients.map(p => `<option value="${esc(p.id)}"${pid===String(p.id)?' selected':''}>${esc(p.full_name||p.name||'Patient '+p.id)}</option>`).join('')}
            </select>
          </div>
          ${pid ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
            <button class="btn btn-sm" onclick="window._mhExpandAll()">Expand All</button>
            <button class="btn btn-sm" onclick="window._mhCollapseAll()">Collapse All</button>
            <button class="btn btn-sm" onclick="window._nav('med-interactions')" style="border-color:var(--accent-violet);color:var(--accent-violet)">Check Drug Interactions →</button>
          </div>` : ''}
        </div>
        ${pid ? `
          <div style="background:rgba(var(--accent-teal-rgb,45,212,191),0.08);border:1px solid rgba(45,212,191,0.25);border-radius:10px;padding:12px 16px;margin-bottom:18px;font-size:12.5px;color:var(--text-secondary)">
            ◧ This record feeds safety and contraindication checks during protocol planning. Keep it current before each treatment course.
          </div>
          ${SECTIONS.map(s => sectionHTML(s, data)).join('')}
        ` : `<div style="padding:48px;text-align:center;color:var(--text-muted);font-size:14px">Select a patient to view or edit their medical history.</div>`}
      </div>`;

    SECTIONS.forEach(s => {
      const body = document.getElementById(`mh-body-${s.id}`);
      if (body) body.hidden = true;
      const chev = document.getElementById(`mh-chev-${s.id}`);
      if (chev) chev.style.transform = 'rotate(-90deg)';
    });
  }

  let activePid = '';
  let activeData = {};

  buildForm(activePid, activeData);

  window._mhSwitchPatient = function(pid) {
    activePid = pid;
    activeData = pid ? loadHistory(pid) : {};
    buildForm(pid, activeData);
  };

  window._mhToggle = function(secId) {
    const body = document.getElementById(`mh-body-${secId}`);
    const chev = document.getElementById(`mh-chev-${secId}`);
    if (!body) return;
    body.hidden = !body.hidden;
    if (chev) chev.style.transform = body.hidden ? 'rotate(-90deg)' : 'rotate(0deg)';
  };

  window._mhExpandAll = function() {
    SECTIONS.forEach(s => {
      const body = document.getElementById(`mh-body-${s.id}`);
      const chev = document.getElementById(`mh-chev-${s.id}`);
      if (body) { body.hidden = false; }
      if (chev) chev.style.transform = 'rotate(0deg)';
    });
  };

  window._mhCollapseAll = function() {
    SECTIONS.forEach(s => {
      const body = document.getElementById(`mh-body-${s.id}`);
      const chev = document.getElementById(`mh-chev-${s.id}`);
      if (body) { body.hidden = true; }
      if (chev) chev.style.transform = 'rotate(-90deg)';
    });
  };

  window._mhSave = function() {
    if (!activePid) { window._showNotifToast?.({ title: 'No Patient', body: 'Select a patient first.', severity: 'warning' }); return; }
    const data = {};
    SECTIONS.forEach(sec => {
      sec.fields.forEach(f => {
        const el2 = document.getElementById(`mh-${f.id}`);
        if (el2) data[f.id] = el2.tagName === 'SELECT' ? el2.value : el2.value.trim();
      });
    });
    data._updated = new Date().toISOString();
    saveHistory(activePid, data);
    activeData = data;
    window._showNotifToast?.({ title: 'Saved', body: 'Medical history updated.', severity: 'success' });
  };

  window._mhPrint = function() {
    window.print();
  };
}

// ── pgDocumentsHub — Forms, consent & document management ────────────────────
export async function pgDocumentsHub(setTopbar) {
  setTopbar('Documents', `
    <button class="btn btn-primary btn-sm" onclick="window._dhAssignForm()">Assign Form</button>
    <button class="btn btn-sm" onclick="window._dhUpload()">Upload Document</button>
    <button class="btn btn-sm" onclick="window._nav('forms-builder')" style="border-color:var(--accent-violet);color:var(--accent-violet)">Form Builder →</button>
  `);
  const el = document.getElementById('content');
  if (!el) return;

  function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  let patients = [];
  try { const r = await api.patients().catch(() => null); patients = r?.items || r || []; } catch {}

  const STORAGE_KEY = 'ds_documents_hub';
  function loadDocs() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
  function saveDocs(d) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {} }

  const FORM_TEMPLATES = [
    // Intake
    { id:'intake-general',   cat:'Intake',    name:'General Intake Form',               desc:'Demographics, contact, emergency contact, GP details.' },
    { id:'intake-clinical',  cat:'Intake',    name:'Clinical Intake Form',              desc:'Presenting problem, goals, previous treatment, medication.' },
    // Consent
    { id:'consent-tms',      cat:'Consent',   name:'TMS Treatment Consent',             desc:'Risks, benefits, alternatives, voluntary participation for TMS.' },
    { id:'consent-tdcs',     cat:'Consent',   name:'tDCS Treatment Consent',            desc:'Consent form for transcranial direct current stimulation.' },
    { id:'consent-ect',      cat:'Consent',   name:'ECT Consent',                       desc:'Electroconvulsive therapy consent including anaesthetic risks.' },
    { id:'consent-dbs',      cat:'Consent',   name:'DBS Consent',                       desc:'Deep brain stimulation surgical and device consent.' },
    { id:'consent-general',  cat:'Consent',   name:'General Treatment Consent',         desc:'Umbrella consent for neuromodulation treatments.' },
    // Privacy & Data
    { id:'privacy-clinic',   cat:'Privacy',   name:'Privacy & Data Sharing Policy',     desc:'Clinic privacy policy acknowledgement and data consent.' },
    { id:'privacy-research', cat:'Privacy',   name:'Research Data Use Consent',         desc:'Consent for de-identified data use in research.' },
    // Caregiver
    { id:'caregiver-auth',   cat:'Caregiver', name:'Caregiver / Representative Auth',   desc:"Authorises caregiver to act on patient's behalf." },
    { id:'caregiver-consent',cat:'Caregiver', name:'Caregiver Treatment Consent',       desc:'Caregiver consent for treatment when patient lacks capacity.' },
    // Clinical
    { id:'clinic-referral',  cat:'Clinical',  name:'Referral Acknowledgement',          desc:'Acknowledgement of referral and treatment pathway.' },
    { id:'clinic-discharge', cat:'Clinical',  name:'Discharge Summary',                 desc:'Structured discharge summary template.' },
    { id:'clinic-release',   cat:'Clinical',  name:'Information Release Auth',          desc:'Authorises release of records to third parties.' },
    { id:'clinic-adverse',   cat:'Clinical',  name:'Adverse Event Report',              desc:'Structured adverse event documentation form.' },
    // Custom
    { id:'custom-template',  cat:'Custom',    name:'Custom Form Template',              desc:'Blank template — configure in Form Builder.' },
  ];

  const CAT_COLORS = {
    Intake:    'var(--accent-teal)',
    Consent:   'var(--accent-blue)',
    Privacy:   'var(--accent-violet)',
    Caregiver: '#f59e0b',
    Clinical:  '#94a3b8',
    Custom:    '#ec4899',
    Signed:    '#2dd4bf',
    Generated: '#60a5fa',
    Uploaded:  '#a78bfa',
  };

  const CATS = ['All', 'Intake', 'Consent', 'Privacy', 'Caregiver', 'Clinical', 'Custom', 'Signed', 'Uploaded'];

  let activePid = '';
  let activeCat = 'All';
  let docs = loadDocs();

  function docsByCat(cat, pid) {
    let d = docs;
    if (pid) d = d.filter(x => x.patientId === pid);
    if (cat !== 'All') d = d.filter(x => x.category === cat);
    return d;
  }

  function statusBadgeHTML(status) {
    const cfg = {
      assigned:  ['Assigned',   '#f59e0b'],
      pending:   ['Pending',    '#f59e0b'],
      completed: ['Completed',  'var(--accent-teal)'],
      signed:    ['Signed',     'var(--accent-teal)'],
      uploaded:  ['Uploaded',   '#a78bfa'],
      generated: ['Generated',  '#60a5fa'],
      overdue:   ['Overdue',    '#ef4444'],
    };
    const [label, color] = cfg[status] || ['Unknown', '#94a3b8'];
    return `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:3px;background:${color}22;color:${color};border:1px solid ${color}44">${label}</span>`;
  }

  function docCardHTML(d) {
    const cc = CAT_COLORS[d.category] || '#94a3b8';
    const pt = patients.find(p => String(p.id) === String(d.patientId));
    const ptName = pt ? esc(pt.full_name || pt.name || 'Patient') : esc(d.patientId ? 'Patient #'+d.patientId : '');
    return `<div class="card" style="padding:0;cursor:default">
      <div style="padding:12px 16px">
        <div style="display:flex;gap:8px;align-items:flex-start;justify-content:space-between;margin-bottom:6px">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span style="font-size:12.5px;font-weight:600;color:var(--text)">${esc(d.name)}</span>
            <span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:3px;background:${cc}22;color:${cc};border:1px solid ${cc}44">${esc(d.category)}</span>
            ${statusBadgeHTML(d.status)}
          </div>
          <div style="display:flex;gap:5px;flex-shrink:0">
            ${d.url ? `<button class="btn btn-sm" style="font-size:10px;padding:2px 8px" onclick="window.open('${esc(d.url)}','_blank')">View</button>` : ''}
            <button class="btn btn-sm" style="font-size:10px;padding:2px 8px" onclick="window._dhMarkSigned('${esc(d.id)}')">Mark Signed</button>
            <button class="btn btn-sm" style="font-size:10px;padding:2px 8px;color:#ef4444;border-color:#ef444444" onclick="window._dhRemoveDoc('${esc(d.id)}')">✕</button>
          </div>
        </div>
        ${ptName ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">Patient: ${ptName}</div>` : ''}
        ${d.desc ? `<div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5;margin-bottom:6px">${esc(d.desc)}</div>` : ''}
        <div style="font-size:11px;color:var(--text-muted)">${d.assignedDate ? 'Assigned: '+esc(d.assignedDate) : ''} ${d.completedDate ? '· Completed: '+esc(d.completedDate) : ''}</div>
      </div>
    </div>`;
  }

  function renderPage() {
    const filtered = docsByCat(activeCat, activePid);
    const pending = docs.filter(d => ['assigned','pending','overdue'].includes(d.status) && (!activePid || d.patientId === activePid));
    const signed  = docs.filter(d => ['signed','completed'].includes(d.status) && (!activePid || d.patientId === activePid));

    el.innerHTML = `
      <div style="max-width:960px;margin:0 auto">
        <!-- Patient + filter bar -->
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
          <select id="dh-patient-sel" class="form-control" onchange="window._dhSwitchPatient(this.value)" style="font-size:13px;max-width:260px">
            <option value="">— All patients —</option>
            ${patients.map(p => `<option value="${esc(p.id)}"${activePid===String(p.id)?' selected':''}>${esc(p.full_name||p.name||'Patient '+p.id)}</option>`).join('')}
          </select>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${CATS.map(c => `<button class="btn btn-sm${c===activeCat?' btn-primary':''}" onclick="window._dhCat('${c}')">${c}</button>`).join('')}
          </div>
        </div>

        <!-- KPI strip -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
          ${[
            { label:'Total Documents', val: docs.filter(d=>!activePid||d.patientId===activePid).length, color:'var(--accent-blue)' },
            { label:'Pending / Assigned', val: pending.length, color:'#f59e0b' },
            { label:'Signed / Complete', val: signed.length, color:'var(--accent-teal)' },
            { label:'Form Templates', val: FORM_TEMPLATES.length, color:'var(--accent-violet)' },
          ].map(k => `<div class="card" style="padding:14px 16px">
            <div style="font-size:22px;font-weight:700;color:${k.color}">${k.val}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${k.label}</div>
          </div>`).join('')}
        </div>

        <!-- Document list -->
        <div style="margin-bottom:24px">
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.7px;margin-bottom:10px">
            ${activeCat === 'All' ? 'All Documents' : activeCat} (${filtered.length})
          </div>
          ${filtered.length ? `<div class="g3" style="align-items:start">${filtered.map(docCardHTML).join('')}</div>`
            : `<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px;background:var(--card-bg);border:1px solid var(--border);border-radius:12px">
                No documents in this category. Use <strong>Assign Form</strong> or <strong>Upload Document</strong> to add one.
               </div>`}
        </div>

        <!-- Form template library -->
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.7px;margin-bottom:10px">Form Template Library</div>
          <div class="g3" style="align-items:start">
            ${FORM_TEMPLATES.map(t => {
              const cc = CAT_COLORS[t.cat] || '#94a3b8';
              return `<div class="card" style="padding:0">
                <div style="padding:12px 16px">
                  <div style="display:flex;gap:8px;align-items:flex-start;justify-content:space-between;margin-bottom:4px">
                    <div>
                      <span style="font-size:12.5px;font-weight:600;color:var(--text)">${esc(t.name)}</span>
                      <span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:3px;background:${cc}22;color:${cc};border:1px solid ${cc}44;margin-left:6px">${esc(t.cat)}</span>
                    </div>
                  </div>
                  <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5;margin-bottom:10px">${esc(t.desc)}</div>
                  <div style="display:flex;gap:6px">
                    <button class="btn btn-primary btn-sm" onclick="window._dhAssignTemplate('${esc(t.id)}','${esc(t.name)}','${esc(t.cat)}','${esc(t.desc)}')">Assign to Patient</button>
                    ${t.id === 'custom-template' ? `<button class="btn btn-sm" onclick="window._nav('forms-builder')">Build Custom →</button>` : ''}
                  </div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>`;
  }

  renderPage();

  window._dhSwitchPatient = function(pid) { activePid = pid; renderPage(); };
  window._dhCat = function(c) { activeCat = c; renderPage(); };

  window._dhAssignTemplate = function(templateId, name, cat, desc) {
    const pid = activePid;
    if (!pid) { window._showNotifToast?.({ title: 'No Patient', body: 'Select a patient first.', severity: 'warning' }); return; }
    docs = loadDocs();
    docs.push({ id: 'doc_'+Date.now(), patientId: pid, templateId, name, category: cat, desc, status: 'assigned', assignedDate: new Date().toISOString().slice(0,10) });
    saveDocs(docs);
    renderPage();
    window._showNotifToast?.({ title: 'Form Assigned', body: `${name} assigned to patient.`, severity: 'success' });
  };

  window._dhAssignForm = function() {
    if (!activePid) { window._showNotifToast?.({ title: 'No Patient', body: 'Select a patient first, then click Assign Form.', severity: 'warning' }); return; }
    window._showNotifToast?.({ title: 'Assign Form', body: 'Choose a template from the library below and click Assign to Patient.', severity: 'info' });
    el.scrollTo?.({ top: el.scrollHeight, behavior: 'smooth' });
  };

  window._dhUpload = function() {
    if (!activePid) { window._showNotifToast?.({ title: 'No Patient', body: 'Select a patient first.', severity: 'warning' }); return; }
    const name = prompt('Document name:');
    if (!name) return;
    const cat = prompt('Category (Intake / Consent / Signed / Uploaded / Clinical):') || 'Uploaded';
    docs = loadDocs();
    docs.push({ id: 'doc_'+Date.now(), patientId: activePid, name, category: cat, status: 'uploaded', desc: 'Manually uploaded', assignedDate: new Date().toISOString().slice(0,10) });
    saveDocs(docs);
    renderPage();
    window._showNotifToast?.({ title: 'Uploaded', body: `${name} added to patient's documents.`, severity: 'success' });
  };

  window._dhMarkSigned = function(id) {
    docs = loadDocs();
    const d = docs.find(x => x.id === id);
    if (!d) return;
    d.status = 'signed';
    d.completedDate = new Date().toISOString().slice(0,10);
    saveDocs(docs);
    renderPage();
    window._showNotifToast?.({ title: 'Marked Signed', body: `${d.name} marked as signed.`, severity: 'success' });
  };

  window._dhRemoveDoc = function(id) {
    if (!confirm('Remove this document record?')) return;
    docs = loadDocs().filter(x => x.id !== id);
    saveDocs(docs);
    renderPage();
  };
}

// ── pgReportsHub — Patient report upload, filter, compare, AI summary ─────────
export async function pgReportsHub(setTopbar) {
  setTopbar('Reports', `
    <button class="btn btn-primary btn-sm" onclick="window._rhUpload()">Upload Report</button>
    <button class="btn btn-sm" onclick="window._nav('reports')" style="border-color:var(--accent-blue);color:var(--accent-blue)">Population Reports →</button>
  `);
  const el = document.getElementById('content');
  if (!el) return;

  function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  let patients = [];
  try { const r = await api.patients().catch(() => null); patients = r?.items || r || []; } catch {}

  const STORAGE_KEY = 'ds_reports_hub';
  function loadReports() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
  function saveReports(d) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {} }

  const REPORT_TYPES = ['All', 'EEG / qEEG', 'Blood / Lab', 'MRI / Imaging', 'Specialist Letter', 'Progress Report', 'Clinician Summary', 'AI Summary', 'Other'];

  const TYPE_COLORS = {
    'EEG / qEEG':       'var(--accent-violet)',
    'Blood / Lab':      '#f59e0b',
    'MRI / Imaging':    '#60a5fa',
    'Specialist Letter':'#94a3b8',
    'Progress Report':  'var(--accent-teal)',
    'Clinician Summary':'var(--accent-blue)',
    'AI Summary':       '#ec4899',
    'Other':            '#6b7280',
  };

  let activePid = '';
  let activeType = 'All';
  let compareIds = new Set();
  let reports = loadReports();

  // Seed demo reports if empty
  if (reports.length === 0 && patients.length > 0) {
    const pid = String(patients[0]?.id || '1');
    reports = [
      { id:'r1', patientId:pid, type:'EEG / qEEG',       name:'Baseline qEEG — DLPFC Alpha Power', date:'2026-03-01', source:'NeuroGuide', summary:'Elevated alpha at Fp1-Fp2. DLPFC alpha asymmetry consistent with MDD.', linked:'course-001', aiSummary:'', status:'final' },
      { id:'r2', patientId:pid, type:'Progress Report',   name:'4-Week TMS Progress Report',         date:'2026-03-28', source:'Internal', summary:'PHQ-9 dropped from 22 to 14 (36% reduction). Session tolerance excellent.', linked:'course-001', aiSummary:'', status:'final' },
      { id:'r3', patientId:pid, type:'Specialist Letter', name:'Psychiatry Referral Letter',         date:'2026-02-15', source:'Dr. K. Mehta', summary:'Referred for TMS following two failed antidepressant trials.', linked:'', aiSummary:'', status:'final' },
      { id:'r4', patientId:pid, type:'Blood / Lab',       name:'Pre-treatment Labs',                 date:'2026-02-20', source:'LabCorp', summary:'TSH 2.1, CBC normal, CMP normal. No flagged abnormalities.', linked:'', aiSummary:'', status:'final' },
    ];
    saveReports(reports);
  }

  function filteredReports() {
    let d = reports;
    if (activePid) d = d.filter(x => x.patientId === activePid);
    if (activeType !== 'All') d = d.filter(x => x.type === activeType);
    return d;
  }

  function reportCardHTML(r) {
    const tc = TYPE_COLORS[r.type] || '#94a3b8';
    const inCompare = compareIds.has(r.id);
    return `<div class="card" style="padding:0;border:2px solid ${inCompare ? 'var(--accent-teal)' : 'transparent'};transition:border-color 0.15s" id="rh-card-${esc(r.id)}">
      <div style="padding:14px 16px">
        <div style="display:flex;gap:8px;align-items:flex-start;justify-content:space-between;margin-bottom:6px">
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px">${esc(r.name)}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
              <span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:3px;background:${tc}22;color:${tc};border:1px solid ${tc}44">${esc(r.type)}</span>
              <span style="font-size:11px;color:var(--text-muted)">${esc(r.date)}</span>
              ${r.source ? `<span style="font-size:11px;color:var(--text-muted)">· ${esc(r.source)}</span>` : ''}
              ${r.linked ? `<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:var(--text-muted)">Linked: Course</span>` : ''}
            </div>
          </div>
          <div style="display:flex;gap:5px;flex-shrink:0">
            <button class="btn btn-sm" style="font-size:10px;padding:2px 8px;${inCompare?'background:var(--accent-teal)22;color:var(--accent-teal);border-color:var(--accent-teal)55':''}" onclick="window._rhToggleCompare('${esc(r.id)}')">${inCompare?'✓ Compare':'Compare'}</button>
            <button class="btn btn-sm" style="font-size:10px;padding:2px 8px" onclick="window._rhAISummary('${esc(r.id)}')">AI Summary</button>
            <button class="btn btn-sm" style="font-size:10px;padding:2px 8px;color:#ef4444;border-color:#ef444444" onclick="window._rhRemove('${esc(r.id)}')">✕</button>
          </div>
        </div>
        ${r.summary ? `<div style="font-size:12px;color:var(--text-secondary);line-height:1.55;margin-bottom:6px">${esc(r.summary)}</div>` : ''}
        ${r.aiSummary ? `<div style="font-size:11.5px;color:#ec4899;background:rgba(236,72,153,0.07);border-radius:6px;padding:8px 10px;margin-top:6px"><span style="font-weight:600">AI: </span>${esc(r.aiSummary)}</div>` : ''}
      </div>
    </div>`;
  }

  function comparePanel() {
    if (compareIds.size < 2) return '';
    const sel = reports.filter(r => compareIds.has(r.id));
    return `<div style="background:rgba(45,212,191,0.07);border:1px solid rgba(45,212,191,0.3);border-radius:12px;padding:16px 18px;margin-bottom:20px">
      <div style="font-size:12px;font-weight:600;color:var(--accent-teal);margin-bottom:10px">Comparing ${compareIds.size} Reports</div>
      <div style="display:grid;grid-template-columns:repeat(${Math.min(sel.length,3)},1fr);gap:14px">
        ${sel.map(r => `<div style="font-size:12px">
          <div style="font-weight:600;color:var(--text);margin-bottom:4px">${esc(r.name)}</div>
          <div style="color:var(--text-muted);font-size:11px;margin-bottom:6px">${esc(r.date)} · ${esc(r.type)}</div>
          <div style="color:var(--text-secondary);line-height:1.5">${esc(r.summary || '—')}</div>
        </div>`).join('')}
      </div>
      <button class="btn btn-sm" onclick="window._rhClearCompare()" style="margin-top:12px">Clear Comparison</button>
    </div>`;
  }

  function renderPage() {
    const filtered = filteredReports();
    el.innerHTML = `
      <div style="max-width:960px;margin:0 auto">
        <!-- Filter bar -->
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
          <select id="rh-patient-sel" class="form-control" onchange="window._rhSwitchPatient(this.value)" style="font-size:13px;max-width:260px">
            <option value="">— All patients —</option>
            ${patients.map(p => `<option value="${esc(p.id)}"${activePid===String(p.id)?' selected':''}>${esc(p.full_name||p.name||'Patient '+p.id)}</option>`).join('')}
          </select>
          <input id="rh-search" type="text" class="form-control" placeholder="Search reports…" oninput="window._rhSearch(this.value)" style="font-size:13px;max-width:220px">
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${REPORT_TYPES.map(t => `<button class="btn btn-sm${t===activeType?' btn-primary':''}" onclick="window._rhType('${esc(t)}')">${esc(t)}</button>`).join('')}
          </div>
        </div>

        <!-- KPI strip -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
          ${[
            { label:'Total Reports', val: reports.filter(r=>!activePid||r.patientId===activePid).length, color:'var(--accent-blue)' },
            { label:'EEG / Imaging',  val: reports.filter(r=>(!activePid||r.patientId===activePid)&&['EEG / qEEG','MRI / Imaging'].includes(r.type)).length, color:'var(--accent-violet)' },
            { label:'Progress Reports',val:reports.filter(r=>(!activePid||r.patientId===activePid)&&r.type==='Progress Report').length, color:'var(--accent-teal)' },
            { label:'AI Summaries',   val: reports.filter(r=>(!activePid||r.patientId===activePid)&&r.aiSummary).length, color:'#ec4899' },
          ].map(k => `<div class="card" style="padding:14px 16px">
            <div style="font-size:22px;font-weight:700;color:${k.color}">${k.val}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${k.label}</div>
          </div>`).join('')}
        </div>

        ${comparePanel()}

        <!-- Report list -->
        <div id="rh-list">
          ${filtered.length
            ? `<div class="g2" style="align-items:start">${filtered.map(reportCardHTML).join('')}</div>`
            : `<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px;background:var(--card-bg);border:1px solid var(--border);border-radius:12px">No reports found. Upload a report or adjust filters.</div>`}
        </div>
      </div>`;
  }

  renderPage();

  window._rhSwitchPatient = function(pid) { activePid = pid; compareIds.clear(); renderPage(); };
  window._rhType = function(t) { activeType = t; renderPage(); };

  window._rhSearch = function(q) {
    const cards = el.querySelectorAll('.card[id^="rh-card-"]');
    cards.forEach(c => {
      c.style.display = !q || c.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
    });
  };

  window._rhToggleCompare = function(id) {
    if (compareIds.has(id)) compareIds.delete(id);
    else compareIds.add(id);
    renderPage();
  };

  window._rhClearCompare = function() { compareIds.clear(); renderPage(); };

  window._rhAISummary = function(id) {
    reports = loadReports();
    const r = reports.find(x => x.id === id);
    if (!r) return;
    // Simulated AI summary — replace with real API call when backend endpoint available
    const summaries = [
      'Findings consistent with treatment response. Key metrics within expected range for this protocol phase.',
      'Compared to baseline, significant improvement noted. Recommend continuing current protocol.',
      'No red flags identified. Results support continued neuromodulation at current parameters.',
      'Partial response observed. Consider protocol adjustment at next clinical review.',
    ];
    r.aiSummary = summaries[Math.floor(Math.random() * summaries.length)];
    saveReports(reports);
    renderPage();
    window._showNotifToast?.({ title: 'AI Summary', body: 'Summary generated and attached to report.', severity: 'success' });
  };

  window._rhUpload = function() {
    if (!activePid) { window._showNotifToast?.({ title: 'No Patient', body: 'Select a patient first.', severity: 'warning' }); return; }
    const name = prompt('Report name:');
    if (!name) return;
    const typeOpts = REPORT_TYPES.slice(1).join(' / ');
    const type = prompt(`Report type:\n${typeOpts}`) || 'Other';
    const source = prompt('Source / author (optional):') || '';
    const summary = prompt('Brief summary (optional):') || '';
    reports = loadReports();
    reports.push({ id:'r'+Date.now(), patientId:activePid, type, name, date:new Date().toISOString().slice(0,10), source, summary, linked:'', aiSummary:'', status:'final' });
    saveReports(reports);
    renderPage();
    window._showNotifToast?.({ title:'Uploaded', body:`${name} added.`, severity:'success' });
  };

  window._rhRemove = function(id) {
    if (!confirm('Remove this report?')) return;
    reports = loadReports().filter(x => x.id !== id);
    saveReports(reports);
    renderPage();
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// pgMonitoring — Clinic-wide Patient Monitoring & Remote Follow-Up
// ─────────────────────────────────────────────────────────────────────────────
export async function pgMonitoring(setTopbar, navigate) {
  setTopbar({ title: 'Patient Monitoring & Remote Follow-Up', subtitle: 'Remote follow-up · risk detection · adherence oversight' });

  const el = document.getElementById('main-content');
  if (!el) return;
  el.innerHTML = '<div class="pm-loading">Loading monitoring data…</div>';

  // ── Data fetch ────────────────────────────────────────────────────────────
  const api = window._api || {};
  const [patients, courses, alertSummary, homeAdherence, homeFlags, mediaQueue, adverseEvents] = await Promise.all([
    api.listPatients?.().catch(() => []) ?? [],
    api.listCourses?.().catch(() => []) ?? [],
    api.getClinicAlertSummary?.().catch(() => ({})) ?? {},
    api.listHomeAdherenceEvents?.().catch(() => []) ?? [],
    api.listHomeReviewFlags?.().catch(() => []) ?? [],
    api.listMediaQueue?.().catch(() => []) ?? [],
    api.listAdverseEvents?.().catch(() => []) ?? [],
  ]);

  const patientMap = {};
  (patients || []).forEach(p => { patientMap[p.id] = p; });

  const coursesByPatient = {};
  (courses || []).forEach(c => {
    if (!coursesByPatient[c.patient_id]) coursesByPatient[c.patient_id] = [];
    coursesByPatient[c.patient_id].push(c);
  });

  const activeCourses = (courses || []).filter(c => ['active','in_progress'].includes(c.status));
  const openAEs = (adverseEvents || []).filter(a => a.status === 'open' || a.status === 'active');
  const seriousAEs = openAEs.filter(a => ['serious','severe'].includes(a.severity));

  // ── Signal scoring per patient ───────────────────────────────────────────
  const _signalScore = patId => {
    let score = 0;
    const ptAEs = openAEs.filter(a => a.patient_id === patId);
    const ptCourses = (coursesByPatient[patId] || []);
    const ptAdherence = (homeAdherence || []).filter(e => e.patient_id === patId);
    const ptFlags = (homeFlags || []).filter(f => f.patient_id === patId);
    if (ptAEs.some(a => ['serious','severe'].includes(a.severity))) score += 100;
    if (ptAEs.length) score += 40;
    if (ptCourses.some(c => c.status === 'paused')) score += 60;
    if (ptFlags.some(f => f.severity === 'high')) score += 50;
    if (ptAdherence.some(e => e.missed_sessions >= 3)) score += 30;
    if (ptCourses.some(c => (c.last_checkin_days_ago || 0) > 7)) score += 25;
    return score;
  };

  const _statusBadge = score => {
    if (score >= 80) return { label: 'Needs Review', cls: 'pm-badge-red' };
    if (score >= 30) return { label: 'Watch', cls: 'pm-badge-amber' };
    return { label: 'Stable', cls: 'pm-badge-green' };
  };

  const _monitoringReason = patId => {
    const ptAEs = openAEs.filter(a => a.patient_id === patId);
    const ptFlags = (homeFlags || []).filter(f => f.patient_id === patId);
    const ptAdherence = (homeAdherence || []).filter(e => e.patient_id === patId);
    const ptCourses = (coursesByPatient[patId] || []);
    if (ptAEs.some(a => ['serious','severe'].includes(a.severity))) return 'Serious adverse event';
    if (ptAEs.length) return 'Open adverse event';
    if (ptCourses.some(c => c.status === 'paused')) return 'Course paused';
    if (ptFlags.some(f => f.severity === 'high')) return 'High severity flag';
    if (ptAdherence.some(e => e.missed_sessions >= 3)) return 'Low adherence';
    if (ptCourses.some(c => (c.last_checkin_days_ago || 0) > 7)) return 'No recent check-in';
    return 'Routine monitoring';
  };

  const _latestSignal = patId => {
    const ptFlags = (homeFlags || []).filter(f => f.patient_id === patId).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    if (ptFlags.length) return ptFlags[0].description || 'Flag raised';
    const ptAEs = openAEs.filter(a => a.patient_id === patId);
    if (ptAEs.length) return `AE: ${ptAEs[0].description || ptAEs[0].type || 'Adverse event'}`;
    return 'No new signals';
  };

  // ── Build monitored patient list ─────────────────────────────────────────
  const monitoredPatientIds = [...new Set([
    ...activeCourses.map(c => c.patient_id),
    ...openAEs.map(a => a.patient_id),
    ...(homeAdherence || []).map(e => e.patient_id),
    ...(homeFlags || []).map(f => f.patient_id),
  ].filter(Boolean))];

  const monitoredPatients = monitoredPatientIds
    .map(id => {
      const pt = patientMap[id];
      if (!pt) return null;
      const score = _signalScore(id);
      const status = _statusBadge(score);
      const ptCourses = coursesByPatient[id] || [];
      const activeCourse = ptCourses.find(c => ['active','in_progress'].includes(c.status));
      return {
        id, pt, score, status,
        reason: _monitoringReason(id),
        signal: _latestSignal(id),
        modality: activeCourse?.modality || activeCourse?.protocol_name || '—',
        condition: activeCourse?.condition || pt.primary_condition || '—',
        ptAEs: openAEs.filter(a => a.patient_id === id),
        ptFlags: (homeFlags || []).filter(f => f.patient_id === id),
        ptAdherence: (homeAdherence || []).filter(e => e.patient_id === id),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  // ── Summary counts ───────────────────────────────────────────────────────
  const totalMonitored = monitoredPatients.length;
  const totalStable = monitoredPatients.filter(x => x.status.label === 'Stable').length;
  const totalNeedsReview = monitoredPatients.filter(x => x.status.label === 'Needs Review').length;
  const missingCheckins = monitoredPatients.filter(x => (coursesByPatient[x.id] || []).some(c => (c.last_checkin_days_ago || 0) > 7)).length;
  const deviceIssues = monitoredPatients.filter(x => x.ptFlags.some(f => f.type === 'device_sync' || f.type === 'wearable_disconnect')).length;
  const sideEffectFlags = monitoredPatients.filter(x => x.ptFlags.some(f => f.type === 'side_effect') || x.ptAEs.length > 0).length;

  // ── Action buttons ───────────────────────────────────────────────────────
  const _actionBtns = (pid, cid) => {
    const _cid = (cid || '').replace(/['"]/g, '');
    return `
      <button class="pm-act-btn pm-act-primary" onclick="window.openPatient('${pid}');window._nav('patient-profile')" title="Open Patient">Open</button>
      <button class="pm-act-btn" onclick="window.openPatient('${pid}');window._nav('messaging')" title="Message Patient">Message</button>
      <button class="pm-act-btn" onclick="window.openPatient('${pid}');window._nav('patient-profile')" title="Review Update">Review</button>
      <div class="pm-act-more" onclick="event.stopPropagation();this.nextElementSibling.classList.toggle('pm-act-open')">⋯</div>
      <div class="pm-act-dropdown">
        <div onclick="window.openPatient('${pid}');window._nav('outcomes')">Log Outcome</div>
        <div onclick="window.openPatient('${pid}');window._nav('assessments-hub')">Request Assessment</div>
        <div onclick="window.openPatient('${pid}');window._nav('home-task-manager')">Assign Task</div>
        <div onclick="window.openPatient('${pid}');window._nav('telehealth-recorder')">Schedule Call</div>
        <div onclick="window.openPatient('${pid}');window._nav('adverse-events')">Flag Review</div>
        ${_cid ? `<div onclick="window._nav('wearables')">Open Device Detail</div>` : ''}
      </div>`;
  };

  // ── Patient row ──────────────────────────────────────────────────────────
  const _patRow = (entry) => {
    const { id, pt, status, reason, signal, modality, condition } = entry;
    const ptCourses = coursesByPatient[id] || [];
    const activeCourse = ptCourses.find(c => ['active','in_progress'].includes(c.status));
    const cid = activeCourse?.id || '';
    const name = [pt.first_name, pt.last_name].filter(Boolean).join(' ') || pt.name || 'Unknown';
    return `
      <div class="pm-pat-row" onclick="window.openPatient('${id}');window._nav('patient-profile')">
        <div class="pm-pat-name">${name}</div>
        <div class="pm-pat-condition">${condition}</div>
        <div class="pm-pat-modality">${modality}</div>
        <div class="pm-pat-reason">${reason}</div>
        <div class="pm-pat-signal pm-signal-text">${signal}</div>
        <div class="pm-pat-status"><span class="pm-badge ${status.cls}">${status.label}</span></div>
        <div class="pm-pat-actions" onclick="event.stopPropagation()">${_actionBtns(id, cid)}</div>
      </div>`;
  };

  // ── Domain section helpers ───────────────────────────────────────────────
  const _domainSection = (title, icon, rows, emptyMsg) => `
    <div class="pm-domain">
      <div class="pm-domain-header"><span class="pm-domain-icon">${icon}</span> ${title}</div>
      ${rows.length ? rows.join('') : `<div class="pm-domain-empty">${emptyMsg}</div>`}
    </div>`;

  const symptomsPatients = monitoredPatients.filter(x => x.ptFlags.some(f => f.type === 'symptom' || f.type === 'side_effect') || x.ptAEs.length > 0);
  const assessmentPatients = monitoredPatients.filter(x => (coursesByPatient[x.id] || []).some(c => c.pending_assessment || c.outcome_due));
  const homeProgramPatients = monitoredPatients.filter(x => x.ptAdherence.some(e => e.missed_sessions >= 1));
  const wearablePatients = monitoredPatients.filter(x => x.ptFlags.some(f => f.type === 'wearable_disconnect' || f.type === 'device_sync'));
  const homeNeuroPatients = monitoredPatients.filter(x => x.ptFlags.some(f => f.type === 'home_device_non_use' || f.type === 'home_neuro'));

  const _domainRow = (entry, signal) => {
    const { id, pt, status } = entry;
    const name = [pt.first_name, pt.last_name].filter(Boolean).join(' ') || pt.name || 'Unknown';
    return `<div class="pm-domain-row" onclick="window.openPatient('${id}');window._nav('patient-profile')">
      <span class="pm-domain-name">${name}</span>
      <span class="pm-domain-signal">${signal}</span>
      <span class="pm-badge ${status.cls}">${status.label}</span>
    </div>`;
  };

  // ── Needs Review panel ───────────────────────────────────────────────────
  const needsReviewPatients = monitoredPatients.filter(x => x.status.label === 'Needs Review');
  const _reviewRow = (entry) => {
    const { id, pt, reason, ptAEs, ptFlags, ptAdherence } = entry;
    const name = [pt.first_name, pt.last_name].filter(Boolean).join(' ') || pt.name || 'Unknown';
    const tags = [];
    if (ptAEs.some(a => ['serious','severe'].includes(a.severity))) tags.push('<span class="pm-tag pm-tag-red">Serious AE</span>');
    else if (ptAEs.length) tags.push('<span class="pm-tag pm-tag-amber">Open AE</span>');
    if (ptFlags.some(f => f.type === 'side_effect')) tags.push('<span class="pm-tag pm-tag-amber">Side Effects</span>');
    if (ptFlags.some(f => f.type === 'wearable_disconnect')) tags.push('<span class="pm-tag pm-tag-grey">Wearable Offline</span>');
    if (ptFlags.some(f => f.type === 'home_device_non_use')) tags.push('<span class="pm-tag pm-tag-grey">Device Non-Use</span>');
    if (ptAdherence.some(e => e.missed_sessions >= 3)) tags.push('<span class="pm-tag pm-tag-amber">Low Adherence</span>');
    if (ptFlags.some(f => f.severity === 'high')) tags.push('<span class="pm-tag pm-tag-red">High Flag</span>');
    return `<div class="pm-review-row">
      <div class="pm-review-name">${name}</div>
      <div class="pm-review-reason">${reason}</div>
      <div class="pm-review-tags">${tags.join('')}</div>
      <div class="pm-review-actions" onclick="event.stopPropagation()">
        <button class="pm-act-btn pm-act-primary" onclick="window.openPatient('${id}');window._nav('patient-profile')">Open</button>
        <button class="pm-act-btn" onclick="window.openPatient('${id}');window._nav('messaging')">Message</button>
      </div>
    </div>`;
  };

  // ── Filter state ─────────────────────────────────────────────────────────
  let _pmFilter = { search: '', status: 'all', type: 'all' };

  const _filteredPatients = () => {
    let list = monitoredPatients;
    if (_pmFilter.status !== 'all') list = list.filter(x => x.status.label.toLowerCase().replace(' ', '-') === _pmFilter.status);
    if (_pmFilter.type === 'no-checkin') list = list.filter(x => (coursesByPatient[x.id] || []).some(c => (c.last_checkin_days_ago || 0) > 7));
    if (_pmFilter.type === 'low-adherence') list = list.filter(x => x.ptAdherence.some(e => e.missed_sessions >= 2));
    if (_pmFilter.type === 'wearable-issue') list = list.filter(x => x.ptFlags.some(f => f.type === 'wearable_disconnect'));
    if (_pmFilter.type === 'side-effects') list = list.filter(x => x.ptFlags.some(f => f.type === 'side_effect') || x.ptAEs.length > 0);
    if (_pmFilter.type === 'home-device') list = list.filter(x => x.ptFlags.some(f => f.type === 'home_device_non_use'));
    if (_pmFilter.search) {
      const q = _pmFilter.search.toLowerCase();
      list = list.filter(x => {
        const name = [x.pt.first_name, x.pt.last_name, x.pt.name].filter(Boolean).join(' ').toLowerCase();
        return name.includes(q) || (x.condition || '').toLowerCase().includes(q) || (x.modality || '').toLowerCase().includes(q);
      });
    }
    return list;
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const renderPage = () => {
    const filtered = _filteredPatients();

    const summaryStrip = `
      <div class="pm-summary-strip">
        <div class="pm-chip"><span class="pm-chip-val">${totalMonitored}</span><span class="pm-chip-lbl">Monitored</span></div>
        <div class="pm-chip pm-chip-green"><span class="pm-chip-val">${totalStable}</span><span class="pm-chip-lbl">Stable</span></div>
        <div class="pm-chip pm-chip-red"><span class="pm-chip-val">${totalNeedsReview}</span><span class="pm-chip-lbl">Needs Review</span></div>
        <div class="pm-chip pm-chip-amber"><span class="pm-chip-val">${missingCheckins}</span><span class="pm-chip-lbl">Missing Check-ins</span></div>
        <div class="pm-chip pm-chip-grey"><span class="pm-chip-val">${deviceIssues}</span><span class="pm-chip-lbl">Device Issues</span></div>
        <div class="pm-chip pm-chip-amber"><span class="pm-chip-val">${sideEffectFlags}</span><span class="pm-chip-lbl">Side Effect Flags</span></div>
      </div>`;

    const filterBar = `
      <div class="pm-filter-bar">
        <input class="pm-search" type="text" placeholder="Search patient, condition, modality…" value="${_pmFilter.search}" oninput="window._pmSearch(this.value)">
        <select class="pm-filter-sel" onchange="window._pmFilterStatus(this.value)">
          <option value="all" ${_pmFilter.status==='all'?'selected':''}>All Status</option>
          <option value="needs-review" ${_pmFilter.status==='needs-review'?'selected':''}>Needs Review</option>
          <option value="watch" ${_pmFilter.status==='watch'?'selected':''}>Watch</option>
          <option value="stable" ${_pmFilter.status==='stable'?'selected':''}>Stable</option>
        </select>
        <select class="pm-filter-sel" onchange="window._pmFilterType(this.value)">
          <option value="all" ${_pmFilter.type==='all'?'selected':''}>All Types</option>
          <option value="no-checkin" ${_pmFilter.type==='no-checkin'?'selected':''}>No Recent Check-in</option>
          <option value="low-adherence" ${_pmFilter.type==='low-adherence'?'selected':''}>Low Adherence</option>
          <option value="wearable-issue" ${_pmFilter.type==='wearable-issue'?'selected':''}>Wearable Issue</option>
          <option value="side-effects" ${_pmFilter.type==='side-effects'?'selected':''}>Side Effects / AE</option>
          <option value="home-device" ${_pmFilter.type==='home-device'?'selected':''}>Home Device Non-Use</option>
        </select>
      </div>`;

    const queueHeader = `
      <div class="pm-queue-header">
        <span>Patient</span><span>Condition</span><span>Modality</span><span>Reason</span><span>Latest Signal</span><span>Status</span><span>Actions</span>
      </div>`;

    const queueRows = filtered.length
      ? filtered.map(_patRow).join('')
      : '<div class="pm-empty-queue">No patients match current filters.</div>';

    const queueCard = `
      <div class="pm-card pm-queue-card">
        <div class="pm-card-title">Monitoring Queue <span class="pm-queue-count">${filtered.length}</span></div>
        ${filterBar}
        ${queueHeader}
        <div class="pm-queue-rows">${queueRows}</div>
      </div>`;

    const domainsCard = `
      <div class="pm-card pm-domains-card">
        <div class="pm-card-title">Signal Domains</div>
        ${_domainSection('Symptoms & Check-ins', '⚡',
          symptomsPatients.map(x => _domainRow(x, x.ptFlags.find(f=>f.type==='symptom'||f.type==='side_effect')?.description || (x.ptAEs[0]?.type || 'Symptom flag'))),
          'No symptom flags')}
        ${_domainSection('Assessments & Outcomes', '📋',
          assessmentPatients.map(x => _domainRow(x, 'Assessment pending or outcome due')),
          'All assessments current')}
        ${_domainSection('Home Programs', '🏠',
          homeProgramPatients.map(x => _domainRow(x, `${x.ptAdherence.find(e=>e.missed_sessions>=1)?.missed_sessions || 1} session(s) missed`)),
          'Full adherence')}
        ${_domainSection('Wearables & Devices', '⌚',
          wearablePatients.map(x => _domainRow(x, x.ptFlags.find(f=>f.type==='wearable_disconnect'||f.type==='device_sync')?.description || 'Device offline')),
          'All wearables synced')}
        ${_domainSection('Home Neuromodulation Devices', '🧠',
          homeNeuroPatients.map(x => _domainRow(x, x.ptFlags.find(f=>f.type==='home_device_non_use'||f.type==='home_neuro')?.description || 'Non-use detected')),
          'All devices in use')}
      </div>`;

    const reviewCard = needsReviewPatients.length ? `
      <div class="pm-card pm-review-card">
        <div class="pm-card-title pm-review-title">Needs Review <span class="pm-badge pm-badge-red">${needsReviewPatients.length}</span></div>
        <div class="pm-review-rows">${needsReviewPatients.map(_reviewRow).join('')}</div>
      </div>` : '';

    el.innerHTML = `
      <div class="pm-page">
        ${summaryStrip}
        ${queueCard}
        <div class="pm-lower-grid">
          ${domainsCard}
          ${reviewCard}
        </div>
      </div>`;
  };

  // ── Global handlers ───────────────────────────────────────────────────────
  window._pmSearch = (val) => { _pmFilter.search = val; renderPage(); };
  window._pmFilterStatus = (val) => { _pmFilter.status = val; renderPage(); };
  window._pmFilterType = (val) => { _pmFilter.type = val; renderPage(); };

  renderPage();
}
