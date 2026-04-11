import { api, downloadBlob } from './api.js';
import { cardWrap, fr, evBar, pillSt, initials, tag, spinner, emptyState, spark, brainMapSVG, evidenceBadge, labelBadge, approvalBadge, safetyBadge, govFlag } from './helpers.js';
import { currentUser } from './auth.js';
import { FALLBACK_CONDITIONS, FALLBACK_MODALITIES, FALLBACK_ASSESSMENT_TEMPLATES, COURSE_STATUS_COLORS } from './constants.js';

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
  document.getElementById('content').appendChild(panel);
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
  document.getElementById('content').appendChild(overlay);
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

function _dStatCard(label, value, sub, color, navId, alert = false) {
  const leftBorder = alert ? `border-left:3px solid ${color};padding-left:13px;` : '';
  return `<div class="metric-card" style="cursor:pointer;${leftBorder}"
      onclick="window._nav('${navId}')"
      onmouseover="this.style.borderColor='${alert ? color : 'var(--border-teal)'}'"
      onmouseout="this.style.borderColor='${alert ? color : 'var(--border)'}'">
    <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.9px;margin-bottom:8px">${label}</div>
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

  setTopbar('Dashboard',
    `<div style="display:flex;gap:6px;align-items:center">
      <button class="btn btn-primary btn-sm" onclick="window._nav('session-execution')">◧ Start Session</button>
      <button class="btn btn-sm" onclick="window._nav('patients')">◉ Patients</button>
      <button class="btn btn-sm" onclick="window._nav('protocol-wizard')">◎ New Course</button>
    </div>`
  );

  const el = document.getElementById('content');
  el.innerHTML = spinner();

  // ── Load all data in parallel ──────────────────────────────────────────────
  let allPatients = [], allCourses = [], pendingQueue = [], aes = [], outcomeSummary = null, allProtocols = [], allConsents = [];
  try {
    const [ptsRes, coursesRes, queueRes, aeRes, outRes, protocolsRes, consentsRes] = await Promise.all([
      api.listPatients().catch(() => null),
      api.listCourses().catch(() => null),
      api.listReviewQueue({ status: 'pending' }).catch(() => null),
      api.listAdverseEvents().catch(() => null),
      api.aggregateOutcomes().catch(() => null),
      api.protocols({ limit: 20 }).catch(() => null),
      api.listConsents().catch(() => null),
    ]);
    if (ptsRes)       allPatients    = ptsRes.items || [];
    if (coursesRes)   allCourses     = coursesRes.items || [];
    if (queueRes)     pendingQueue   = queueRes.items || [];
    if (aeRes)        aes            = aeRes.items || [];
    if (outRes)       outcomeSummary = outRes;
    if (protocolsRes) allProtocols   = protocolsRes.items || [];
    if (consentsRes)  allConsents    = consentsRes.items || [];
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

  const modalityCount = {};
  activeCourses.forEach(c => { const m = c.modality_slug || 'Unknown'; modalityCount[m] = (modalityCount[m] || 0) + 1; });
  const topModalities = Object.entries(modalityCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const recentCourses = [...allCourses]
    .sort((a, b) => ((b.updated_at || b.created_at || '') > (a.updated_at || a.created_at || '') ? 1 : -1))
    .slice(0, 10);

  const uniqueConditions = [...new Set(activeCourses.map(c => c.condition_slug).filter(Boolean))].slice(0, 3);
  const activePatientIds = [...new Set(activeCourses.map(c => c.patient_id).filter(Boolean))];
  const activePatients   = activePatientIds.map(id => {
    const pt = patientMap[id];
    return pt ? { pt, courses: activeCourses.filter(c => c.patient_id === id) } : null;
  }).filter(Boolean).slice(0, 8);

  // ── KPI stat bar ──────────────────────────────────────────────────────────
  const statBar = `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px">
    <div style="border-left:3px solid var(--teal)">${_dStatCard('Total Patients', patCount, `${activePatientIds.length} in active treatment`, 'var(--teal)', 'patients')}</div>
    <div style="border-left:3px solid var(--blue)">${_dStatCard('Active Courses', activeCourses.length, `${sessionsPerWeek} sessions/week planned`, 'var(--blue)', 'courses')}</div>
    <div style="border-left:3px solid var(--green)">${_dStatCard('Sessions Delivered', totalDelivered, `${completedCourses.length} courses completed`, 'var(--green)', 'courses')}</div>
    <div style="border-left:3px solid ${pendingQueue.length > 0 ? 'var(--amber)' : 'var(--border)'}">${_dStatCard('Pending Reviews', pendingQueue.length || 0, pendingQueue.length > 0 ? 'Action required' : 'Queue clear', pendingQueue.length > 0 ? 'var(--amber)' : 'var(--green)', 'review-queue', pendingQueue.length > 0)}</div>
    <div style="border-left:3px solid ${alertFlags > 0 ? 'var(--red)' : 'var(--border)'}">${_dStatCard('Safety Flags', alertFlags || 0, alertFlags > 0 ? `${flaggedCourses.length} gov · ${seriousAEs.length} serious AE` : 'No active flags', alertFlags > 0 ? 'var(--red)' : 'var(--green)', 'adverse-events', alertFlags > 0)}</div>
  </div>`;

  // ── Row A: Quick Actions + Clinic Queue ────────────────────────────────────
  const quickActions = [
    { icon: '◧', label: 'Start Session',  sub: 'Execute a treatment session',     page: 'session-execution', color: 'var(--teal)' },
    { icon: '◉', label: 'Add Patient',    sub: 'Register a new patient',           page: 'patients',          color: 'var(--blue)' },
    { icon: '◎', label: 'New Course',     sub: 'Create a treatment course',        page: 'protocol-wizard',   color: 'var(--violet)' },
    { icon: '◱', label: 'Review Queue',   sub: `${pendingQueue.length} pending`,   page: 'review-queue',      color: pendingQueue.length > 0 ? 'var(--amber)' : 'var(--text-secondary)' },
    { icon: '◫', label: 'Outcomes',       sub: `Responder rate: ${responderRate}`, page: 'outcomes',          color: 'var(--green)' },
    { icon: '⚡', label: 'Adverse Events', sub: `${openAEs.length} open`,          page: 'adverse-events',    color: openAEs.length > 0 ? 'var(--red)' : 'var(--text-secondary)' },
  ];

  const clinicQueueRows = [
    ...(activeCourses.length  ? [_dQueueSection('Active — In Treatment',    activeCourses.slice(0, 5).map(c  => _dCourseRowRich(c, 'active')))]           : []),
    ...(pausedCourses.length  ? [_dQueueSection('Paused — Needs Attention', pausedCourses.slice(0, 3).map(c  => _dCourseRowRich(c, 'paused')))]           : []),
    ...(pendingCourses.length ? [_dQueueSection('Awaiting Approval',        pendingCourses.slice(0, 3).map(c => _dCourseRowRich(c, 'pending_approval')))] : []),
  ];

  const rowA = `<div class="g2" style="margin-bottom:14px;align-items:start">
    <div class="card" style="overflow:hidden">
      <div style="padding:13px 16px 11px;border-bottom:1px solid var(--border)">
        <span style="font-weight:600;font-size:13px">Quick Actions</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:var(--border)">
        ${quickActions.map(a => `
          <div onclick="window._nav('${a.page}')" style="padding:14px 16px;background:var(--bg-card);cursor:pointer;transition:background 0.15s"
               onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background='var(--bg-card)'">
            <div style="font-size:20px;color:${a.color};margin-bottom:6px">${a.icon}</div>
            <div style="font-size:12.5px;font-weight:600;color:var(--text-primary);margin-bottom:2px">${a.label}</div>
            <div style="font-size:10.5px;color:var(--text-tertiary)">${a.sub}</div>
          </div>`).join('')}
      </div>
    </div>

    <div class="card" style="overflow:hidden">
      <div style="padding:13px 16px 11px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)">
        <span style="font-weight:600;font-size:13px">Clinic Queue</span>
        <button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('courses')">All Courses →</button>
      </div>
      ${clinicQueueRows.length
        ? clinicQueueRows.join('')
        : `<div style="padding:40px 16px;text-align:center">
            <div style="font-size:28px;margin-bottom:8px;opacity:0.3">◎</div>
            <div style="font-size:12.5px;color:var(--text-tertiary);margin-bottom:12px">No active courses yet</div>
            <button class="btn btn-primary btn-sm" onclick="window._nav('protocol-wizard')">Create First Course →</button>
          </div>`
      }
    </div>
  </div>`;

  // ── Row B: Active Patients + Governance ────────────────────────────────────
  const activePatientsHTML = activePatients.length === 0
    ? `<div style="padding:40px 16px;text-align:center">
        <div style="font-size:28px;margin-bottom:8px;opacity:0.3">◉</div>
        <div style="font-size:12.5px;color:var(--text-tertiary);margin-bottom:12px">No patients in active treatment</div>
        <button class="btn btn-sm" onclick="window._nav('patients')">Add Patient →</button>
      </div>`
    : activePatients.map(({ pt, courses }) => {
        const c0 = courses[0];
        const pct = c0?.planned_sessions_total > 0
          ? Math.min(100, Math.round((c0.sessions_delivered || 0) / c0.planned_sessions_total * 100)) : 0;
        const dotColor = { active: 'var(--teal)', paused: 'var(--amber)', pending_approval: 'var(--blue)' }[c0?.status] || 'var(--text-tertiary)';
        const av = initials(`${pt.first_name || ''} ${pt.last_name || ''}`);
        return `<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border);cursor:pointer"
                     onclick="window.openPatient('${pt.id}')"
                     onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background=''">
          <div class="avatar" style="width:32px;height:32px;font-size:11px;flex-shrink:0">${av}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${pt.first_name || ''} ${pt.last_name || ''}</div>
            <div style="font-size:10.5px;color:var(--text-tertiary)">
              ${c0?.condition_slug?.replace(/-/g, ' ') || pt.primary_condition || '—'} · <span style="color:var(--teal)">${c0?.modality_slug || '—'}</span>
            </div>
          </div>
          <div style="flex-shrink:0;min-width:80px">
            <div style="height:3px;border-radius:2px;background:var(--border);margin-bottom:3px">
              <div style="height:3px;border-radius:2px;background:${dotColor};width:${pct}%"></div>
            </div>
            <div style="font-size:10px;color:var(--text-tertiary);text-align:right">${c0?.sessions_delivered || 0}/${c0?.planned_sessions_total || '?'}</div>
          </div>
          ${courses.length > 1 ? `<span style="font-size:10px;color:var(--text-tertiary);flex-shrink:0">+${courses.length - 1}</span>` : ''}
          <span style="font-size:12px;color:var(--text-tertiary);flex-shrink:0">→</span>
        </div>`;
      }).join('');

  const activePatientsPanel = `<div class="card" style="overflow:hidden">
    <div style="padding:13px 16px 11px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)">
      <div>
        <span style="font-weight:600;font-size:13px">Active Patients</span>
        <span style="font-size:11px;color:var(--text-tertiary);margin-left:8px">${activePatients.length} in treatment</span>
      </div>
      <button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('patients')">All Patients →</button>
    </div>
    ${activePatientsHTML}
  </div>`;

  const governancePanel = `<div class="card" style="overflow:hidden">
    <div style="padding:13px 16px 11px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)">
      <span style="font-weight:600;font-size:13px">Review &amp; Governance</span>
      <button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('review-queue')">Queue →</button>
    </div>
    ${_dGovSection('Approvals Pending', pendingQueue.length,
      pendingQueue.length
        ? pendingQueue.slice(0, 5).map(item =>
            _dGovRow(
              item.condition_slug?.replace(/-/g, ' ') || `Course #${(item.course_id || item.id || '').slice(0, 8)}`,
              item.modality_slug || item.notes?.slice(0, 30) || '—',
              'pending',
              `window._nav('review-queue')`
            )).join('')
        : _dNoItems('Queue clear — no pending approvals'),
      'var(--amber)'
    )}
    ${_dGovSection('Open Adverse Events', openAEs.length,
      openAEs.length
        ? openAEs.slice(0, 4).map(ae =>
            _dGovRow(
              (ae.event_type || 'Event').replace(/_/g, ' '),
              ae.severity || '—',
              ae.severity === 'serious' || ae.severity === 'severe' ? ae.severity : (ae.severity || 'open'),
              `window._nav('adverse-events')`
            )).join('')
        : _dNoItems('No open adverse events'),
      openAEs.length > 0 ? 'var(--red)' : 'var(--green)'
    )}
    ${offLabelPending.length ? _dGovSection('Off-Label Requests', offLabelPending.length,
      offLabelPending.slice(0, 3).map(c =>
        _dGovRow(c.condition_slug?.replace(/-/g, ' ') || '—', c.modality_slug || '—', 'off-label', `window._openCourse('${c.id}')`)
      ).join(''),
      'var(--amber)'
    ) : ''}
    ${flaggedCourses.length ? _dGovSection('Safety Flags', flaggedCourses.length,
      flaggedCourses.slice(0, 3).map(c =>
        `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 16px;border-bottom:1px solid var(--border);cursor:pointer"
             onclick="window._openCourse('${c.id}')"
             onmouseover="this.style.background='rgba(255,107,107,0.04)'" onmouseout="this.style.background=''">
          <span style="color:var(--red);font-size:12px;flex-shrink:0;margin-top:1px">&#9888;</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:500">${c._patientName ? `<span style="color:var(--text-secondary)">${c._patientName} · </span>` : ''}${c.condition_slug?.replace(/-/g, ' ') || '—'}</div>
            <div style="font-size:10.5px;color:var(--red);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(c.governance_warnings || []).join(' · ')}</div>
          </div>
          <span style="font-size:10px;color:var(--text-tertiary)">→</span>
        </div>`
      ).join(''),
      'var(--red)'
    ) : ''}
    ${_dGovSection('Consent Alerts', consentAlertCount,
      consentAlertCount > 0
        ? `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px">
            <span style="font-size:12px;color:var(--amber)">${consentAlertCount} consent${consentAlertCount !== 1 ? 's' : ''} expiring or expired</span>
            <button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('patients')">Manage →</button>
          </div>`
        : _dNoItems('All consents valid'),
      consentAlertCount > 0 ? 'var(--amber)' : 'var(--green)'
    )}
    ${blindTreatments.length ? _dGovSection('Blind Treatment Risk', blindTreatments.length,
      `<div style="padding:8px 16px;display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:11.5px;color:var(--amber)">&#9888; ${blindTreatments.length} course${blindTreatments.length !== 1 ? 's' : ''} with 10+ sessions &amp; no outcome data</span>
        <button class="btn btn-sm" style="font-size:10.5px;margin-left:8px;flex-shrink:0" onclick="window._nav('outcomes')">Record →</button>
      </div>`,
      'var(--amber)'
    ) : ''}
  </div>`;

  const rowB = `<div class="g2" style="margin-bottom:14px;align-items:start">${activePatientsPanel}${governancePanel}</div>`;

  // ── Row C: Outcomes + Capacity ─────────────────────────────────────────────
  const rowC = `<div class="g2" style="margin-bottom:14px;align-items:start">
    <div class="card" style="overflow:hidden">
      <div style="padding:13px 16px 11px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)">
        <span style="font-weight:600;font-size:13px">Outcomes Snapshot</span>
        <button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('outcomes')">Full Outcomes →</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--border)">
        ${_dOutcomeCell('Responder Rate',     responderRate,              'var(--teal)',  '≥50% symptom reduction')}
        ${_dOutcomeCell('Assess. Completion', assessCompletionPct,        'var(--blue)',  'Assessment fill rate')}
        ${_dOutcomeCell('Courses Completed',  completedCourses.length,    'var(--green)', 'All time')}
        ${_dOutcomeCell('Paused / At Risk',   pausedCourses.length + atRiskCourses.length, pausedCourses.length + atRiskCourses.length > 0 ? 'var(--amber)' : 'var(--text-secondary)', 'Paused + high-risk')}
      </div>
      ${allCourses.length ? `<div style="padding:12px 14px">
        <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;color:var(--text-tertiary);font-weight:600;margin-bottom:10px">Course Status Breakdown</div>
        ${_dMiniBar('Active',    activeCourses.length,    allCourses.length, 'var(--teal)')}
        ${_dMiniBar('Completed', completedCourses.length, allCourses.length, 'var(--green)')}
        ${_dMiniBar('Pending',   pendingCourses.length,   allCourses.length, 'var(--amber)')}
        ${_dMiniBar('Paused',    pausedCourses.length,    allCourses.length, 'var(--blue)')}
      </div>` : ''}
    </div>

    <div class="card" style="overflow:hidden">
      <div style="padding:13px 16px 11px;border-bottom:1px solid var(--border)">
        <span style="font-weight:600;font-size:13px">Capacity &amp; Modality Mix</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--border)">
        ${_dOutcomeCell('Sessions / Week', sessionsPerWeek || 0,    'var(--teal)',   'Planned across active')}
        ${_dOutcomeCell('Total Delivered', totalDelivered,          'var(--blue)',   'All time')}
        ${_dOutcomeCell('Panel Size',      patCount,                'var(--violet)', 'Total patients')}
        ${_dOutcomeCell('In Active Tx',    activePatientIds.length, 'var(--teal)',   'Currently in treatment')}
      </div>
      ${topModalities.length
        ? `<div style="padding:12px 14px">
            <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;color:var(--text-tertiary);font-weight:600;margin-bottom:10px">Modality Load (Active Courses)</div>
            ${topModalities.map(([mod, count]) => _dMiniBar(mod, count, activeCourses.length, 'var(--teal)')).join('')}
          </div>`
        : `<div style="padding:14px 16px;font-size:11.5px;color:var(--text-tertiary)">No active courses yet.</div>`
      }
      ${approvedCourses.length > 0
        ? `<div style="padding:10px 14px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:11.5px;color:var(--text-secondary)">Approved, not yet started</span>
            <button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('courses')">${approvedCourses.length} ready →</button>
          </div>`
        : ''
      }
    </div>
  </div>`;

  // ── Protocol Recommendations ───────────────────────────────────────────────
  const recBlocks = uniqueConditions.map(condSlug => {
    const condLabel = condSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const matchedProtocols = allProtocols.filter(p => {
      const word = condSlug.toLowerCase().split('-')[0];
      return (p.condition_id || '').toLowerCase().includes(word) || (p.name || '').toLowerCase().includes(word);
    }).slice(0, 2);
    const protoRows = matchedProtocols.length
      ? matchedProtocols.map(p => {
          const pid = (p.id || '').replace(/['"]/g, '');
          return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
            ${evidenceBadge(p.evidence_grade)}
            <span style="font-size:12px;color:var(--text-primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name || p.id}</span>
            <button class="btn btn-sm" style="font-size:10px;padding:2px 7px;flex-shrink:0" onclick="window._wizardProtocolId='${pid}';window._nav('protocol-wizard')">Use →</button>
          </div>`;
        }).join('')
      : `<div style="font-size:11.5px;color:var(--text-tertiary);padding:6px 0">No protocols matched.</div>`;
    return `<div style="flex:1;min-width:200px;padding:12px;background:rgba(255,255,255,0.02);border-radius:6px;border:1px solid var(--border)">
      <div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">${condLabel}</div>
      ${protoRows}
    </div>`;
  }).join('');

  const rowRecommend = uniqueConditions.length === 0 ? '' : `<div class="card" style="overflow:hidden;margin-bottom:14px">
    <div style="padding:13px 16px 11px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)">
      <div>
        <span style="font-weight:600;font-size:13px">Protocol Recommendations</span>
        <span style="font-size:11px;color:var(--text-tertiary);margin-left:8px">Based on active conditions</span>
      </div>
      <button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('protocols-registry')">Browse Registry →</button>
    </div>
    <div style="padding:12px 14px;display:flex;gap:12px;flex-wrap:wrap">${recBlocks}</div>
  </div>`;

  // ── Recent Activity Table ──────────────────────────────────────────────────
  const rowD = `<div class="card" style="overflow:hidden">
    <div style="padding:13px 16px 11px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)">
      <span style="font-weight:600;font-size:13px">Recent Course Activity</span>
      <button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('courses')">All Courses →</button>
    </div>
    ${recentCourses.length === 0
      ? `<div style="padding:36px;text-align:center;color:var(--text-tertiary);font-size:12.5px">
          No courses yet.
          <button class="btn btn-sm" onclick="window._nav('protocol-wizard')" style="margin-left:6px">Create First Course →</button>
        </div>`
      : `<div style="overflow-x:auto"><table class="ds-table">
          <thead><tr>
            <th>Patient</th><th>Condition · Modality</th><th>Status</th><th>Evidence</th>
            <th style="min-width:110px">Progress</th><th>Sessions</th><th>Signals</th><th></th>
          </tr></thead>
          <tbody>
            ${recentCourses.map(c => {
              const sc = COURSE_STATUS_COLORS[c.status] || 'var(--text-tertiary)';
              const pct = c.planned_sessions_total > 0 ? Math.min(100, Math.round((c.sessions_delivered || 0) / c.planned_sessions_total * 100)) : 0;
              return `<tr style="cursor:pointer" onclick="window._openCourse('${c.id}')">
                <td style="white-space:nowrap">
                  ${c._patientName
                    ? `<div style="display:flex;align-items:center;gap:7px">
                        <div class="avatar" style="width:24px;height:24px;font-size:9px;flex-shrink:0">${initials(c._patientName)}</div>
                        <span style="font-size:12px;font-weight:500">${c._patientName}</span>
                      </div>`
                    : `<span style="font-size:11px;color:var(--text-tertiary)">—</span>`
                  }
                </td>
                <td>
                  <div style="font-size:12.5px;font-weight:500">${c.condition_slug?.replace(/-/g, ' ') || '—'}</div>
                  <div style="font-size:11px;color:var(--teal)">${c.modality_slug || '—'}</div>
                </td>
                <td>${approvalBadge(c.status)}</td>
                <td>${evidenceBadge(c.evidence_grade)}</td>
                <td>
                  <div style="height:4px;border-radius:2px;background:var(--border);margin-bottom:3px">
                    <div style="height:4px;border-radius:2px;background:${sc};width:${pct}%"></div>
                  </div>
                  <div style="font-size:10px;color:var(--text-tertiary)">${pct}%</div>
                </td>
                <td class="mono" style="font-size:12px">${c.sessions_delivered || 0}/${c.planned_sessions_total || '?'}</td>
                <td style="white-space:nowrap">
                  ${safetyBadge(c.governance_warnings)}
                  ${c.on_label === false ? labelBadge(false) : ''}
                </td>
                <td style="color:var(--text-tertiary);font-size:12px">→</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>`
    }
  </div>`;

  el.innerHTML = statBar + rowA + rowB + rowC + rowRecommend + rowD;
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

  let items = [], conditions = [], modalities = [];
  try {
    const [patientsRes, condRes, modRes] = await Promise.all([
      api.listPatients().catch(() => null),
      api.conditions().catch(() => null),
      api.modalities().catch(() => null),
    ]);
    items      = patientsRes?.items || [];
    conditions = condRes?.items     || [];
    modalities = modRes?.items      || [];
    if (!patientsRes) {
      el.innerHTML = `<div class="notice notice-warn">Could not load patients.</div>`;
      return;
    }
  } catch (e) {
    el.innerHTML = `<div class="notice notice-warn">Could not load patients: ${e.message}</div>`;
    return;
  }

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
      <div class="g2">
        <div>
          <div class="form-group"><label class="form-label">First Name</label><input id="np-first" class="form-control" placeholder="First name"></div>
          <div class="form-group"><label class="form-label">Last Name</label><input id="np-last" class="form-control" placeholder="Last name"></div>
          <div class="form-group"><label class="form-label">Date of Birth</label><input id="np-dob" class="form-control" type="date"></div>
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

  <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
    <input class="form-control" id="pt-search" placeholder="Search patients by name or condition…" style="flex:1;min-width:200px" oninput="window.filterPatients()">
    <select class="form-control" id="pt-status-filter" style="width:auto" onchange="window.filterPatients()">
      <option value="">All Status</option><option>active</option><option>pending</option><option>inactive</option>
    </select>
    <select class="form-control" id="pt-modality-filter" style="width:auto" onchange="window.filterPatients()">
      <option value="">All Modalities</option>
      ${FALLBACK_MODALITIES.map(m => `<option>${m}</option>`).join('')}
    </select>
    <span id="pt-count" style="font-size:11px;color:var(--text-tertiary);white-space:nowrap">${items.length} patients</span>
  </div>

  <div class="card" style="overflow-x:auto">
    ${items.length === 0
      ? emptyState('👥', 'No patients yet', 'Add your first patient to get started with protocol planning and treatment courses.' + (canAddPatient ? '' : ''), canAddPatient ? '+ Add Patient' : null, canAddPatient ? 'window.showAddPatient()' : null)
      : `<table class="ds-table" id="patients-table">
          <thead><tr>
            <th>Patient</th><th>Condition</th><th>Modality</th><th>Status</th><th>Courses</th><th>Consent</th><th></th>
          </tr></thead>
          <tbody id="patients-body">
            ${items.map(p => {
              const statusDot = p.status === 'active'
                ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--green);margin-right:5px;flex-shrink:0"></span>'
                : '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--text-tertiary);margin-right:5px;flex-shrink:0"></span>';
              return `<tr onclick="window.openPatient('${p.id}')">
                <td><div style="display:flex;align-items:center;gap:10px">
                  ${statusDot}
                  <div class="avatar" style="width:30px;height:30px;font-size:10.5px;flex-shrink:0">${initials((p.first_name || '') + ' ' + (p.last_name || ''))}</div>
                  <div>
                    <div style="font-weight:500">${p.first_name || ''} ${p.last_name || ''}</div>
                    <div style="font-size:10.5px;color:var(--text-tertiary)">${p.dob ? p.dob : 'DOB unknown'}</div>
                  </div>
                </div></td>
                <td style="color:var(--text-secondary)">${p.primary_condition || '—'}</td>
                <td><span class="tag">${p.primary_modality || '—'}</span></td>
                <td>${pillSt(p.status || 'pending')}</td>
                <td style="font-size:12px;color:var(--text-tertiary)">${p._activeCourseCount != null ? `<span style="color:var(--teal);font-weight:600">${p._activeCourseCount}</span> active` : '—'}</td>
                <td><span style="color:var(--text-tertiary);font-size:13px" title="Consent status — open patient profile to verify">&#9673;</span> ${p.consent_signed ? '<span style="color:var(--green);font-size:12px">&#10003; Signed</span>' : '<span style="color:var(--amber);font-size:12px">Pending</span>'}</td>
                <td style="display:flex;gap:4px">
                  <button class="btn btn-sm" onclick="event.stopPropagation();window.openPatient('${p.id}')">Open &#8594;</button>
                  <button class="btn btn-sm" style="color:var(--accent-teal,#00d4bc);border-color:rgba(0,212,188,0.3)" onclick="event.stopPropagation();window._profilePatientId='${p.id}';window._nav('patient-profile')">Profile &#8594;</button>
                  ${canTransfer ? `<button class="btn btn-sm" style="color:var(--violet);border-color:rgba(155,127,255,0.3)" onclick="event.stopPropagation();window._transferPatient('${p.id}','${((p.first_name || '') + ' ' + (p.last_name || '')).replace(/'/g,"\\'")}')">Transfer</button>` : ''}
                  <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();window.deletePatient('${p.id}')">&#10005;</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`
    }
  </div>

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

  window._patientsData = items;

  window.filterPatients = function() {
    const q = document.getElementById('pt-search').value.toLowerCase();
    const st = document.getElementById('pt-status-filter').value;
    const mod = document.getElementById('pt-modality-filter')?.value || '';
    const filtered = (window._patientsData || []).filter(p => {
      const name = `${p.first_name} ${p.last_name}`.toLowerCase();
      const matchQ = !q || name.includes(q) || (p.primary_condition || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q);
      const matchSt = !st || p.status === st;
      const matchMod = !mod || (p.primary_modality || '') === mod;
      return matchQ && matchSt && matchMod;
    });
    const countEl = document.getElementById('pt-count');
    if (countEl) countEl.textContent = filtered.length + ' patient' + (filtered.length !== 1 ? 's' : '');
    const tbody = document.getElementById('patients-body');
    if (!tbody) return;
    tbody.innerHTML = filtered.length === 0
      ? `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-tertiary)">No patients match filter.</td></tr>`
      : filtered.map(p => {
          const statusDot = p.status === 'active'
            ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--green);margin-right:5px;flex-shrink:0"></span>'
            : '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--text-tertiary);margin-right:5px;flex-shrink:0"></span>';
          return `<tr onclick="window.openPatient('${p.id}')">
            <td><div style="display:flex;align-items:center;gap:10px">
              ${statusDot}
              <div class="avatar" style="width:30px;height:30px;font-size:10.5px">${initials((p.first_name || '') + ' ' + (p.last_name || ''))}</div>
              <div><div style="font-weight:500">${p.first_name} ${p.last_name}</div><div style="font-size:10.5px;color:var(--text-tertiary)">${p.dob || ''}</div></div>
            </div></td>
            <td style="color:var(--text-secondary)">${p.primary_condition || '—'}</td>
            <td><span class="tag">${p.primary_modality || '—'}</span></td>
            <td>${pillSt(p.status || 'pending')}</td>
            <td style="font-size:12px;color:var(--text-tertiary)">${p._activeCourseCount != null ? `<span style="color:var(--teal);font-weight:600">${p._activeCourseCount}</span> active` : '—'}</td>
            <td><span style="color:var(--text-tertiary);font-size:13px" title="Consent status — open patient profile to verify">&#9673;</span> ${p.consent_signed ? '<span style="color:var(--green)">&#10003;</span>' : '<span style="color:var(--amber)">Pending</span>'}</td>
            <td style="display:flex;gap:4px">
              <button class="btn btn-sm" onclick="event.stopPropagation();window.openPatient('${p.id}')">Open &#8594;</button>
              ${canTransfer ? `<button class="btn btn-sm" style="color:var(--violet);border-color:rgba(155,127,255,0.3)" onclick="event.stopPropagation();window._transferPatient('${p.id}','${((p.first_name || '') + ' ' + (p.last_name || '')).replace(/'/g,"\\'")}')">Transfer</button>` : ''}
            </td>
          </tr>`;
        }).join('');
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
    navigate('profile');
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

  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let pt = null, sessions = [], courses = [];
  try {
    [pt, sessions, courses] = await Promise.all([
      api.getPatient(id),
      api.listSessions(id).then(r => r?.items || []),
      api.listCourses({ patient_id: id }).then(r => r?.items || []).catch(() => []),
    ]);
  } catch {}

  if (!pt) { el.innerHTML = `<div class="notice notice-warn">Could not load patient.</div>`; return; }

  const name = `${pt.first_name} ${pt.last_name}`;
  const done = sessions.filter(s => s.status === 'completed').length;
  const total = sessions.length;

  setTopbar(`${name}`,
    `<button class="btn btn-ghost btn-sm" onclick="window._nav('patients')">← Patients</button>
     <button class="btn btn-primary btn-sm" onclick="window.startNewCourse()">+ New Course</button>`
  );

  el.innerHTML = `
  <div class="card" style="margin-bottom:20px;background:linear-gradient(135deg,rgba(0,212,188,0.05),rgba(74,158,255,0.05))">
    <div class="card-body" style="display:flex;align-items:flex-start;gap:16px;padding:20px">
      <div class="avatar" style="width:56px;height:56px;font-size:20px;flex-shrink:0;border-radius:var(--radius-lg)">${initials(name)}</div>
      <div style="flex:1">
        <div style="font-family:var(--font-display);font-size:20px;font-weight:700;color:var(--text-primary)">${name}</div>
        <div style="font-size:12.5px;color:var(--text-secondary);margin-top:4px">
          ${pt.dob ? pt.dob + ' · ' : ''}${pt.gender || ''} · ${pt.primary_condition || 'No condition set'}
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          ${pt.primary_modality ? tag(pt.primary_modality) : ''}
          ${pt.consent_signed ? '<span class="tag" style="color:var(--green)">✓ Consent Signed</span>' : '<span class="tag" style="color:var(--amber)">Consent Pending</span>'}
          ${pt.primary_condition ? tag(pt.primary_condition) : ''}
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
    ${['overview', 'courses', 'sessions', 'outcomes', 'protocol', 'assessments', 'notes', 'phenotype', 'consent', 'monitoring'].map(t => {
      const labels = { monitoring: '◌ Monitoring' };
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
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.textContent.trim().startsWith(t)));
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
        ? emptyState('◎', 'No treatment courses yet. Click "+ New Treatment Course" to start.')
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
                ${(c.governance_warnings || []).map(w => `<div style="font-size:11px;color:var(--amber);margin-bottom:3px">⚠ ${w}</div>`).join('')}
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

  if (ptab === 'notes') return cardWrap('Session Notes', `
    <div class="form-group"><label class="form-label">Session type</label>
      <select class="form-control"><option>Session Note</option><option>Progress Note</option><option>Assessment Note</option></select>
    </div>
    <div class="form-group"><label class="form-label">Clinical note</label>
      <textarea class="form-control" style="height:120px" placeholder="Write session notes…"></textarea>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary btn-sm">Save Note</button>
    </div>
  `);

  if (ptab === 'billing') return cardWrap('Billing', `
    <div style="padding:24px;text-align:center;color:var(--text-tertiary)">
      <div style="font-size:12px">Session billing codes are managed per session. Go to <strong>Sessions</strong> tab to update billing.</div>
    </div>
  `);

  if (ptab === 'outcomes') return spinner();
  if (ptab === 'phenotype') return spinner();
  if (ptab === 'consent') return spinner();

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
      const errEl = document.getElementById('pheno-save-error');
      if (errEl) { errEl.textContent = e.message || 'Delete failed.'; errEl.style.display = ''; }
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
    try {
      await api.updateConsent(id, { signed: true });
      const consents = await api.listConsents({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []);
      document.getElementById('ptab-body').innerHTML = renderConsentTab(pt, consents);
      bindConsentActions(pt);
    } catch (e) {
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
    const timeStr = flag.triggered_at ? new Date(flag.triggered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--radius-md);background:${st.bg};border:1px solid ${st.color}33;margin-bottom:6px">
      <span style="color:${st.color};font-size:13px;flex-shrink:0">${st.icon}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12.5px;font-weight:600;color:${st.color}">${st.label}</div>
        ${flag.detail ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${flag.detail}</div>` : ''}
      </div>
      <div style="font-size:10.5px;color:var(--text-tertiary);white-space:nowrap;flex-shrink:0">${timeStr}</div>
      <button class="btn btn-sm" style="font-size:11px;flex-shrink:0" onclick="window._reviewFlag('${flag.id || ''}')">Review</button>
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
    ${alertFlags.length === 0
      ? `<div style="font-size:12.5px;color:var(--text-tertiary);padding:12px 0">No alert flags recorded.</div>`
      : alertFlags.map(f => flagRow(f)).join('')
    }
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
  const el = document.getElementById('content');
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
    <button class="btn btn-sm" onclick="window._nav('protocol-builder')" style="border-color:var(--teal,#00d4bc);color:var(--teal,#00d4bc)">⚡ Visual Builder →</button>
    <button class="btn btn-primary btn-sm" onclick="window._nav('handbooks')">Handbooks →</button>
  `);

  // Init state fresh only if not already on this page (step > 0 means we came via back)
  if (!window._wizState || window._wizState._fresh) {
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

// ── Assessments ───────────────────────────────────────────────────────────────
const ASSESS_TEMPLATES = [
  { id: 'PHQ-9', t: 'PHQ-9 Depression Scale', sub: 'Patient health questionnaire, 9-item', tags: ['depression', 'outcome'],
    max: 27, inline: true,
    questions: [
      'Little interest or pleasure in doing things',
      'Feeling down, depressed, or hopeless',
      'Trouble falling or staying asleep, or sleeping too much',
      'Feeling tired or having little energy',
      'Poor appetite or overeating',
      'Feeling bad about yourself — or that you are a failure',
      'Trouble concentrating on things',
      'Moving or speaking so slowly that other people could notice (or the opposite)',
      'Thoughts that you would be better off dead, or of hurting yourself',
    ],
    options: ['Not at all (0)', 'Several days (1)', 'More than half the days (2)', 'Nearly every day (3)'],
    interpret: (s) => s <= 4 ? { label: 'Minimal', color: 'var(--teal)' } : s <= 9 ? { label: 'Mild', color: '#60a5fa' } : s <= 14 ? { label: 'Moderate', color: '#f59e0b' } : s <= 19 ? { label: 'Moderately Severe', color: '#f97316' } : { label: 'Severe', color: 'var(--red)' },
  },
  { id: 'GAD-7', t: 'GAD-7 Anxiety Scale', sub: 'Generalised anxiety disorder, 7-item', tags: ['anxiety', 'outcome'],
    max: 21, inline: true,
    questions: [
      'Feeling nervous, anxious, or on edge',
      'Not being able to stop or control worrying',
      'Worrying too much about different things',
      'Trouble relaxing',
      'Being so restless that it is hard to sit still',
      'Becoming easily annoyed or irritable',
      'Feeling afraid as if something awful might happen',
    ],
    options: ['Not at all (0)', 'Several days (1)', 'More than half the days (2)', 'Nearly every day (3)'],
    interpret: (s) => s <= 4 ? { label: 'Minimal', color: 'var(--teal)' } : s <= 9 ? { label: 'Mild', color: '#60a5fa' } : s <= 14 ? { label: 'Moderate', color: '#f59e0b' } : { label: 'Severe', color: 'var(--red)' },
  },
  { id: 'ISI', t: 'Insomnia Severity Index', sub: 'Sleep quality assessment, 7-item', tags: ['insomnia', 'CES'],
    max: 28, inline: true,
    questions: [
      'Severity of sleep onset problem',
      'Severity of sleep maintenance problem',
      'Problem waking up too early',
      'How SATISFIED/dissatisfied are you with your current sleep pattern?',
      'How NOTICEABLE to others is your sleep problem?',
      'How WORRIED/distressed are you about your sleep problem?',
      'To what extent does your sleep problem INTERFERE with your daily functioning?',
    ],
    options: ['None/Very satisfied (0)', 'Mild (1)', 'Moderate (2)', 'Severe (3)', 'Very severe/Dissatisfied (4)'],
    interpret: (s) => s <= 7 ? { label: 'No clinically significant insomnia', color: 'var(--teal)' } : s <= 14 ? { label: 'Subthreshold insomnia', color: '#60a5fa' } : s <= 21 ? { label: 'Moderate clinical insomnia', color: '#f59e0b' } : { label: 'Severe clinical insomnia', color: 'var(--red)' },
  },
  { id: 'NRS-Pain', t: 'Numeric Pain Rating Scale', sub: 'Pain intensity 0–10', tags: ['pain', 'tDCS'],
    max: 10, inline: false },
  { id: 'PCL-5', t: 'PTSD Checklist (PCL-5)', sub: 'PTSD symptom scale, 20-item', tags: ['PTSD', 'taVNS'],
    max: 80, inline: false },
  { id: 'ADHD-RS-5', t: 'ADHD Rating Scale', sub: 'Executive function and attention assessment', tags: ['ADHD', 'NFB'],
    max: 54, inline: false },
  { id: 'DASS-21', t: 'DASS-21', sub: 'Depression, Anxiety and Stress Scales', tags: ['depression', 'anxiety'],
    max: 63, inline: false },
  { id: 'UPDRS-III', t: 'UPDRS-III Motor Assessment', sub: "Parkinson's motor function", tags: ['PD', 'TPS'],
    max: 108, inline: false },
];

export async function pgAssess(setTopbar) {
  setTopbar('Assessments', `<button class="btn btn-primary btn-sm" onclick="window.showAssessModal()">+ Run Assessment</button>`);
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let items = [];
  try { const res = await api.listAssessments(); items = res?.items || []; } catch {}

  const templates = ASSESS_TEMPLATES;

  el.innerHTML = `
  <div id="assess-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:200;display:none;align-items:center;justify-content:center">
    <div style="background:var(--navy-850);border:1px solid var(--border);border-radius:var(--radius-xl);padding:24px;width:440px;max-height:80vh;overflow-y:auto">
      <h3 style="font-family:var(--font-display);margin-bottom:16px">Run Assessment</h3>
      <div class="form-group"><label class="form-label">Template</label>
        <select id="assess-template" class="form-control">
          ${templates.map(t => `<option value="${t.id}">${t.t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Patient ID (optional)</label>
        <input id="assess-patient" class="form-control" placeholder="Patient ID or leave blank">
      </div>
      <div class="form-group"><label class="form-label">Score / Result</label>
        <input id="assess-score" class="form-control" type="number" placeholder="e.g. 14">
      </div>
      <div class="form-group"><label class="form-label">Notes</label>
        <textarea id="assess-notes" class="form-control" placeholder="Clinician notes…"></textarea>
      </div>
      <div id="assess-error" style="color:var(--red);font-size:12px;display:none;margin-bottom:8px"></div>
      <div style="display:flex;gap:8px">
        <button class="btn" onclick="document.getElementById('assess-modal').style.display='none'">Cancel</button>
        <button class="btn btn-primary" onclick="window.saveAssessment()">Save Assessment</button>
      </div>
    </div>
  </div>

  <div class="tab-bar" style="margin-bottom:20px">
    <button class="tab-btn active" id="tab-templates" onclick="window.switchAssessTab('templates')">Templates</button>
    <button class="tab-btn" id="tab-records" onclick="window.switchAssessTab('records')">Records (${items.length})</button>
  </div>

  <div id="assess-templates-view">
    <div class="g3">
      ${templates.map(a => `<div class="card" style="margin-bottom:0">
        <div class="card-body">
          <div style="font-family:var(--font-display);font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:5px">${a.t}</div>
          <div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:12px;line-height:1.55">${a.sub} · max ${a.max}</div>
          <div style="margin-bottom:12px">${a.tags.map(t => tag(t)).join('')}</div>
          <div style="display:flex;gap:6px">
            ${a.inline ? `<button class="btn btn-primary btn-sm" onclick="window.runInline('${a.id}')">Run Inline ↗</button>` : ''}
            <button class="btn btn-sm" onclick="window.runTemplate('${a.id}')">Enter Score</button>
          </div>
        </div>
      </div>`).join('')}
    </div>
  </div>

  <div id="assess-inline-view" style="display:none;max-width:680px">
    <div class="card">
      <div class="card-body">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
          <button class="btn btn-sm" onclick="window.switchAssessTab('templates')">← Back</button>
          <div id="inline-title" style="font-family:var(--font-display);font-size:15px;font-weight:600;flex:1"></div>
          <div id="inline-score-badge" style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:var(--teal);min-width:48px;text-align:right">0</div>
        </div>
        <div id="inline-interpret" style="font-size:12px;font-weight:600;margin-bottom:18px;padding:6px 10px;border-radius:var(--radius-sm);background:rgba(var(--teal-rgb,0,200,150),.08);display:inline-block"></div>
        <div id="inline-questions"></div>
        <div class="form-group" style="margin-top:16px"><label class="form-label">Patient ID (optional)</label>
          <input id="inline-patient" class="form-control" placeholder="Patient ID">
        </div>
        <div class="form-group"><label class="form-label">Clinician Notes</label>
          <textarea id="inline-notes" class="form-control" rows="2" placeholder="Optional notes…"></textarea>
        </div>
        <div id="inline-error" style="color:var(--red);font-size:12px;display:none;margin-bottom:8px"></div>
        <button class="btn btn-primary" onclick="window.saveInlineAssess()">Save Assessment →</button>
      </div>
    </div>
  </div>

  <div id="assess-records-view" style="display:none">
    ${items.length === 0
      ? emptyState('◧', 'No assessments recorded yet.')
      : cardWrap('Assessment Records', `<table class="ds-table">
        <thead><tr><th>Template</th><th>Date</th><th>Score</th><th>Status</th><th>Notes</th></tr></thead>
        <tbody>${items.map(a => `<tr>
          <td style="font-weight:500">${a.template_title || a.template_id}</td>
          <td style="color:var(--text-tertiary)">${a.created_at?.split('T')[0] || '—'}</td>
          <td class="mono" style="color:var(--teal)">${a.score ?? '—'}</td>
          <td>${pillSt(a.status)}</td>
          <td style="font-size:12px;color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.clinician_notes || '—'}</td>
        </tr>`).join('')}</tbody>
      </table>`)}
  </div>`;

  let _inlineTpl = null;
  let _inlineAnswers = [];

  window.showAssessModal = function() { document.getElementById('assess-modal').style.display = 'flex'; };
  window.runTemplate = function(id) {
    document.getElementById('assess-modal').style.display = 'flex';
    document.getElementById('assess-template').value = id;
  };
  window.switchAssessTab = function(tab) {
    document.getElementById('assess-templates-view').style.display = (tab === 'templates') ? '' : 'none';
    document.getElementById('assess-inline-view').style.display = (tab === 'inline') ? '' : 'none';
    document.getElementById('assess-records-view').style.display = (tab === 'records') ? '' : 'none';
    document.getElementById('tab-templates').classList.toggle('active', tab === 'templates');
    document.getElementById('tab-records').classList.toggle('active', tab === 'records');
  };
  window.runInline = function(id) {
    _inlineTpl = templates.find(t => t.id === id);
    if (!_inlineTpl) return;
    _inlineAnswers = new Array(_inlineTpl.questions.length).fill(0);
    document.getElementById('inline-title').textContent = _inlineTpl.t;
    document.getElementById('inline-error').style.display = 'none';
    document.getElementById('inline-patient').value = '';
    document.getElementById('inline-notes').value = '';
    const qEl = document.getElementById('inline-questions');
    qEl.innerHTML = _inlineTpl.questions.map((q, qi) => `
      <div style="margin-bottom:14px;padding:12px;background:rgba(0,0,0,0.2);border-radius:var(--radius-md);border:1px solid var(--border)">
        <div style="font-size:12.5px;color:var(--text-primary);margin-bottom:8px;line-height:1.5">
          <span style="color:var(--teal);font-weight:600;font-family:var(--font-mono)">${qi + 1}.</span> ${q}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${_inlineTpl.options.map((opt, vi) => `
            <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11.5px;padding:4px 8px;border-radius:var(--radius-sm);border:1px solid var(--border);background:rgba(0,0,0,0.15)">
              <input type="radio" name="q${qi}" value="${vi}" onchange="window._inlineChange(${qi},${vi})" ${vi === 0 ? 'checked' : ''}>
              ${opt}
            </label>`).join('')}
        </div>
      </div>`).join('');
    window._updateInlineScore();
    // switch views
    document.getElementById('assess-templates-view').style.display = 'none';
    document.getElementById('assess-inline-view').style.display = '';
    document.getElementById('assess-records-view').style.display = 'none';
    document.getElementById('tab-templates').classList.remove('active');
    document.getElementById('tab-records').classList.remove('active');
  };
  window._inlineChange = function(qi, val) {
    _inlineAnswers[qi] = val;
    window._updateInlineScore();
  };
  window._updateInlineScore = function() {
    if (!_inlineTpl) return;
    const total = _inlineAnswers.reduce((a, b) => a + b, 0);
    document.getElementById('inline-score-badge').textContent = total;
    const interp = _inlineTpl.interpret(total);
    const interpEl = document.getElementById('inline-interpret');
    interpEl.textContent = interp.label;
    interpEl.style.color = interp.color;
    interpEl.style.borderLeft = `3px solid ${interp.color}`;
    interpEl.style.background = `${interp.color}15`;
  };
  window.saveInlineAssess = async function() {
    const errEl = document.getElementById('inline-error');
    errEl.style.display = 'none';
    if (!_inlineTpl) return;
    const total = _inlineAnswers.reduce((a, b) => a + b, 0);
    const patientId = document.getElementById('inline-patient').value.trim() || null;
    const notes = document.getElementById('inline-notes').value.trim() || null;
    const interp = _inlineTpl.interpret(total);
    const data = {
      template_id: _inlineTpl.id,
      template_title: _inlineTpl.t,
      patient_id: patientId,
      data: Object.fromEntries(_inlineAnswers.map((v, i) => [`q${i + 1}`, v])),
      clinician_notes: notes ? `${interp.label} (${total}/${_inlineTpl.max}). ${notes}` : `${interp.label} (${total}/${_inlineTpl.max})`,
      score: String(total),
      status: 'completed',
    };
    try {
      const assessment = await api.createAssessment(data);
      if (patientId) {
        try {
          const coursesRes = await api.listCourses({ patient_id: patientId, status: 'active' });
          const activeCourses = coursesRes?.items || [];
          if (activeCourses.length > 0) {
            await api.recordOutcome({
              patient_id: patientId,
              course_id: activeCourses[0].id,
              template_id: _inlineTpl.id,
              template_title: _inlineTpl.t,
              score: String(total),
              score_numeric: total,
              measurement_point: 'mid',
              assessment_id: assessment?.id || null,
            });
          }
        } catch (_) { /* best-effort */ }
      }
      window._nav('assessments');
    } catch (e) { errEl.textContent = e.message; errEl.style.display = ''; }
  };
  window.saveAssessment = async function() {
    const errEl = document.getElementById('assess-error');
    errEl.style.display = 'none';
    const tid = document.getElementById('assess-template').value;
    const ttemplate = templates.find(t => t.id === tid);
    const patientId = document.getElementById('assess-patient').value || null;
    const scoreRaw = document.getElementById('assess-score').value;
    const scoreNum = parseFloat(scoreRaw) || null;
    const data = {
      template_id: tid,
      template_title: ttemplate?.t || tid,
      patient_id: patientId,
      data: {},
      clinician_notes: document.getElementById('assess-notes').value || null,
      score: scoreNum !== null ? String(scoreNum) : null,
      status: 'completed',
    };
    try {
      const assessment = await api.createAssessment(data);
      // Auto-link to active course if patient has one
      if (patientId && scoreNum !== null) {
        try {
          const coursesRes = await api.listCourses({ patient_id: patientId, status: 'active' });
          const activeCourses = coursesRes?.items || [];
          if (activeCourses.length > 0) {
            await api.recordOutcome({
              patient_id: patientId,
              course_id: activeCourses[0].id,
              template_id: tid,
              template_title: ttemplate?.t || tid,
              score: String(scoreNum),
              score_numeric: scoreNum,
              measurement_point: 'mid',
              assessment_id: assessment?.id || null,
            });
          }
        } catch (_) { /* outcome linkage is best-effort */ }
      }
      document.getElementById('assess-modal').style.display = 'none';
      window._nav('assessments');
    } catch (e) { errEl.textContent = e.message; errEl.style.display = ''; }
  };

  // Auto-launch inline assessment if navigated from patient profile
  if (window._assessPreFillTemplate && window._assessPreFillPatient) {
    const tplId = window._assessPreFillTemplate;
    const patId = window._assessPreFillPatient;
    window._assessPreFillTemplate = null;
    window._assessPreFillPatient = null;
    setTimeout(() => {
      window.runInline && window.runInline(tplId);
      const patientInput = document.getElementById('inline-patient');
      if (patientInput) patientInput.value = patId;
    }, 50);
  }
}

// ── AI Charting ───────────────────────────────────────────────────────────────
export function pgChart(setTopbar) {
  setTopbar('AI Charting', `<button class="btn btn-primary btn-sm">+ New Session Note</button>`);
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

export async function pgMessaging(setTopbar) {
  setTopbar('Messaging', 'Patient communications');
  const el = document.getElementById('content');
  if (!el) return;

  el.innerHTML = '<div class="page-loading"></div>';

  let patients = [];
  try { patients = await api.listPatients() || []; } catch {}

  window._msgSelectedPatientId = window._msgSelectedPatientId || (patients[0]?.id || null);

  await _renderMessaging(patients);
}

async function _renderMessaging(patients) {
  const el = document.getElementById('content');
  if (!el) return;

  let messages = [];
  if (window._msgSelectedPatientId) {
    try { messages = await api.getPatientMessages(window._msgSelectedPatientId) || []; } catch {}
  }

  const selectedPatient = patients.find(p => p.id === window._msgSelectedPatientId);

  el.innerHTML = `
    <div style="display:flex;flex-direction:column;height:calc(100vh - 120px);gap:0">
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <input id="msg-patient-search" type="text" placeholder="Search patients..."
          style="flex:1;min-width:160px" oninput="window._filterMsgPatients(this.value)">
        <button class="btn-secondary" onclick="window._showTemplates()" style="font-size:0.82rem">📋 Templates</button>
        <button class="btn-primary" onclick="window._showBulkMessage()" style="font-size:0.82rem">📢 Bulk Message</button>
      </div>
      <div style="display:grid;grid-template-columns:240px 1fr 240px;gap:12px;flex:1;overflow:hidden">
        <div style="background:var(--surface-1);border:1px solid var(--border);border-radius:12px;overflow-y:auto" id="msg-patient-list">
          ${patients.map(p => {
            const isSelected = p.id === window._msgSelectedPatientId;
            const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
            return `<div class="msg-patient-item ${isSelected ? 'active' : ''}" onclick="window._msgSelectPatient('${p.id}')">
              <div style="width:36px;height:36px;border-radius:50%;background:rgba(0,212,188,0.15);display:flex;align-items:center;justify-content:center;font-size:0.9rem;flex-shrink:0">
                ${name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
              </div>
              <div style="flex:1;min-width:0">
                <div style="font-size:0.85rem;font-weight:${isSelected?'600':'400'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
                <div style="font-size:0.72rem;color:var(--text-secondary)">${p.primary_condition || 'Patient'}</div>
              </div>
              ${isSelected ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--teal-400);flex-shrink:0"></span>' : ''}
            </div>`;
          }).join('') || '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:0.85rem">No patients</div>'}
        </div>
        <div style="background:var(--surface-1);border:1px solid var(--border);border-radius:12px;display:flex;flex-direction:column;overflow:hidden">
          ${selectedPatient ? `
            <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">
              <div style="font-weight:600">${selectedPatient.first_name} ${selectedPatient.last_name}</div>
              <div class="badge" style="font-size:0.72rem">${selectedPatient.primary_condition || ''}</div>
            </div>
            <div id="msg-thread" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px">
              ${messages.length === 0
                ? `<div style="text-align:center;color:var(--text-secondary);font-size:0.85rem;margin:auto">No messages yet. Send the first message below.</div>`
                : messages.map(m => {
                    const isClinicianMsg = m.sender_role !== 'patient';
                    return `<div style="display:flex;flex-direction:column;align-items:${isClinicianMsg?'flex-end':'flex-start'}">
                      <div style="max-width:70%;background:${isClinicianMsg?'var(--teal-500)':'var(--surface-2)'};color:${isClinicianMsg?'#000':'var(--text-primary)'};padding:10px 14px;border-radius:${isClinicianMsg?'14px 14px 4px 14px':'14px 14px 14px 4px'};font-size:0.875rem;line-height:1.5">
                        ${m.body || m.message || m.content || ''}
                      </div>
                      <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:3px">
                        ${m.created_at ? new Date(m.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : ''}
                        ${isClinicianMsg ? '· Sent \u2713' : ''}
                      </div>
                    </div>`;
                  }).join('')
              }
            </div>
            <div style="padding:12px;border-top:1px solid var(--border);display:flex;gap:8px">
              <textarea id="msg-input" placeholder="Type your message..." rows="2"
                style="flex:1;resize:none;padding:8px 12px;border-radius:8px"
                onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window._msgSend()}"></textarea>
              <div style="display:flex;flex-direction:column;gap:6px">
                <button class="btn-primary" onclick="window._msgSend()" style="padding:8px 14px">&#9658;</button>
                <button class="btn-secondary" onclick="window._msgInsertTemplate()" title="Use template" style="padding:6px;font-size:0.8rem">📋</button>
              </div>
            </div>`
          : `<div style="display:flex;align-items:center;justify-content:center;flex:1;color:var(--text-secondary);font-size:0.85rem">Select a patient to view messages</div>`}
        </div>
        <div style="background:var(--surface-1);border:1px solid var(--border);border-radius:12px;overflow-y:auto;padding:12px" id="msg-templates-sidebar">
          <div style="font-size:0.78rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-secondary);margin-bottom:10px">Message Templates</div>
          ${MESSAGE_TEMPLATES.map(t => `
            <div class="template-item" onclick="window._applyTemplate('${t.id}')" title="${t.name}">
              <span style="font-size:1rem">${t.icon}</span>
              <span style="font-size:0.82rem">${t.name}</span>
            </div>`).join('')}
          <button onclick="window._newTemplate()" style="width:100%;margin-top:10px;background:none;border:1px dashed var(--border);border-radius:8px;padding:8px;color:var(--text-secondary);cursor:pointer;font-size:0.8rem">+ New Template</button>
        </div>
      </div>
    </div>`;

  setTimeout(() => {
    const thread = document.getElementById('msg-thread');
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, 100);
}

window._msgSelectPatient = async function(patientId) {
  window._msgSelectedPatientId = patientId;
  let patients = [];
  try { patients = await api.listPatients() || []; } catch {}
  await _renderMessaging(patients);
};

window._msgSend = async function() {
  const input = document.getElementById('msg-input');
  const msg = input?.value?.trim();
  if (!msg || !window._msgSelectedPatientId) return;
  input.value = '';
  input.disabled = true;
  try {
    await api.sendPatientMessage(window._msgSelectedPatientId, msg);
    const thread = document.getElementById('msg-thread');
    if (thread) {
      const div = document.createElement('div');
      div.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end';
      div.innerHTML = `<div style="max-width:70%;background:var(--teal-500);color:#000;padding:10px 14px;border-radius:14px 14px 4px 14px;font-size:0.875rem;line-height:1.5">${msg}</div>
        <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:3px">${new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})} \u00b7 Sending...</div>`;
      thread.appendChild(div);
      thread.scrollTop = thread.scrollHeight;
    }
  } catch (e) {
    input.value = msg;
    alert('Failed to send message: ' + e.message);
  } finally {
    input.disabled = false;
    input.focus();
  }
};

window._applyTemplate = function(templateId) {
  const t = MESSAGE_TEMPLATES.find(t => t.id === templateId);
  if (!t) return;
  const input = document.getElementById('msg-input');
  if (input) {
    let body = t.body
      .replace(/\{\{patient_name\}\}/g, '[Patient Name]')
      .replace(/\{\{clinician_name\}\}/g, '[Your Name]')
      .replace(/\{\{date\}\}/g, '[Date]')
      .replace(/\{\{time\}\}/g, '[Time]')
      .replace(/\{\{session_count\}\}/g, '[#]')
      .replace(/\{\{clinic_name\}\}/g, '[Clinic Name]');
    input.value = body;
    input.focus();
  }
};

window._showBulkMessage = async function() {
  let patients = [];
  try { patients = await api.listPatients() || []; } catch {}
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `<div class="modal-card" style="max-width:520px;width:100%">
    <h3 style="margin-bottom:16px">📢 Bulk Message</h3>
    <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:16px">Send a message to multiple patients at once.</p>
    <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px;margin-bottom:12px">
      ${patients.map(p => `<label style="display:flex;align-items:center;gap:8px;padding:6px;cursor:pointer">
        <input type="checkbox" class="bulk-patient-check" value="${p.id}">
        <span style="font-size:0.85rem">${p.first_name} ${p.last_name} \u00b7 ${p.primary_condition || ''}</span>
      </label>`).join('')}
    </div>
    <div style="margin-bottom:12px">
      <button onclick="document.querySelectorAll('.bulk-patient-check').forEach(c=>c.checked=true)" class="btn-secondary" style="font-size:0.78rem;margin-right:6px">Select All</button>
      <button onclick="document.querySelectorAll('.bulk-patient-check').forEach(c=>c.checked=false)" class="btn-secondary" style="font-size:0.78rem">Clear</button>
    </div>
    <textarea id="bulk-msg-text" placeholder="Type your message..." rows="4" style="width:100%;resize:none;margin-bottom:12px"></textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      <button class="btn-primary" onclick="window._sendBulkMessage()">Send to Selected \u2192</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
};

window._sendBulkMessage = async function() {
  const selected = [...document.querySelectorAll('.bulk-patient-check:checked')].map(c => c.value);
  const msg = document.getElementById('bulk-msg-text')?.value?.trim();
  if (selected.length === 0 || !msg) { alert('Select patients and type a message'); return; }
  document.querySelector('.modal-overlay')?.remove();
  let sent = 0;
  for (const pid of selected) {
    try { await api.sendPatientMessage(pid, msg); sent++; } catch {}
  }
  window._showNotifToast?.({ title: 'Bulk Message Sent', body: `Sent to ${sent}/${selected.length} patients`, severity: 'success' });
};

window._filterMsgPatients = function(query) {
  document.querySelectorAll('.msg-patient-item').forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(query.toLowerCase()) ? '' : 'none';
  });
};

window._msgInsertTemplate = function() {
  const sidebar = document.getElementById('msg-templates-sidebar');
  if (sidebar) sidebar.scrollIntoView({ behavior: 'smooth' });
};

window._newTemplate = function() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `<div class="modal-card">
    <h3 style="margin-bottom:16px">New Message Template</h3>
    <label style="display:block;margin-bottom:4px;font-size:0.85rem">Template Name</label>
    <input id="tpl-name" type="text" placeholder="e.g. Follow-up Check-in" style="width:100%;margin-bottom:12px">
    <label style="display:block;margin-bottom:4px;font-size:0.85rem">Message Body</label>
    <textarea id="tpl-body" rows="6" placeholder="Use {{patient_name}}, {{clinician_name}}, {{date}} as placeholders" style="width:100%;resize:vertical;margin-bottom:12px"></textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      <button class="btn-primary" onclick="window._saveNewTemplate()">Save Template</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
};

window._saveNewTemplate = function() {
  const name = document.getElementById('tpl-name')?.value?.trim();
  const body = document.getElementById('tpl-body')?.value?.trim();
  if (!name || !body) { alert('Please fill in all fields'); return; }
  MESSAGE_TEMPLATES.push({ id: `custom-${Date.now()}`, name, icon: '💬', subject: name, body });
  document.querySelector('.modal-overlay')?.remove();
  window._announce?.(`Template "${name}" saved`);
  const sidebar = document.getElementById('msg-templates-sidebar');
  if (sidebar) {
    sidebar.innerHTML = `<div style="font-size:0.78rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-secondary);margin-bottom:10px">Message Templates</div>
      ${MESSAGE_TEMPLATES.map(t => `<div class="template-item" onclick="window._applyTemplate('${t.id}')"><span>${t.icon}</span><span style="font-size:0.82rem">${t.name}</span></div>`).join('')}
      <button onclick="window._newTemplate()" style="width:100%;margin-top:10px;background:none;border:1px dashed var(--border);border-radius:8px;padding:8px;color:var(--text-secondary);cursor:pointer;font-size:0.8rem">+ New Template</button>`;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
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
        <span style="font-size:0.78rem;color:var(--text-secondary);margin-left:8px" id="builder-status"></span>
      </div>
      <div style="display:grid;grid-template-columns:220px 1fr;gap:16px">
        <div style="background:var(--bg-card,#0e1628);border:1px solid var(--border);border-radius:12px;padding:16px;overflow-y:auto;max-height:540px">
          ${_renderBuilderPalette()}
        </div>
        <div id="builder-main">
          ${_renderBuilderCanvas()}
          ${_renderBuilderProps()}
        </div>
      </div>
    </div>`;

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
  const tabs = ['demographics', 'insurance', 'medications', 'allergies', 'history', 'notes'];
  const labels = { demographics: 'Demographics', insurance: 'Insurance', medications: 'Medications', allergies: 'Allergies', history: 'Treatment History', notes: 'Notes' };
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

function _ppRenderTab(profile, tab, editMode) {
  switch (tab) {
    case 'demographics': return _ppRenderDemographics(profile, editMode);
    case 'insurance':    return _ppRenderInsurance(profile, editMode);
    case 'medications':  return _ppRenderMedications(profile, editMode);
    case 'allergies':    return _ppRenderAllergies(profile, editMode);
    case 'history':      return _ppRenderHistory(profile, editMode);
    case 'notes':        return _ppRenderNotes(profile, editMode);
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

  const requestedId = window._profilePatientId || null;
  const profiles    = getPatientProfiles();
  const profile     = (requestedId ? getPatientProfile(requestedId) : null) || profiles[0];

  if (!profile) {
    document.getElementById('content').innerHTML = `<div style="padding:48px;text-align:center;color:var(--text-tertiary)">No patient profile found.</div>`;
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
        (name === 'notes' && btn.textContent === 'Notes');
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
  return `<svg width="${W}" height="${H}" style="overflow:visible">
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
