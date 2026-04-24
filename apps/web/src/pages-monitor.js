import { api } from './api.js';
import { currentUser } from './auth.js';

const TAB_KEY = 'monitor_tab';
const STATE_KEY = '__ds_monitor_state';
const RETRY_MS = [1000, 2000, 4000, 8000, 16000, 30000];

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function role() {
  return String(currentUser?.role || 'guest').toLowerCase();
}

function canSeeIntegrations() {
  return new Set(['admin', 'reviewer']).has(role());
}

function canWriteIntegrations() {
  return role() === 'admin';
}

function fmtAgo(v) {
  if (!v) return 'never';
  const ms = Date.now() - new Date(v).getTime();
  if (!Number.isFinite(ms)) return '—';
  if (ms < 60000) return 'just now';
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`;
  return `${Math.floor(ms / 86400000)}d ago`;
}

function fmtNum(v) {
  return v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString();
}

function fmtPct(v) {
  return v == null || Number.isNaN(Number(v)) ? '—' : `${Math.round(Number(v))}%`;
}

function tone(v) {
  if (v === 'red' || v === 'error') return 'red';
  if (v === 'orange' || v === 'warn' || v === 'warning') return 'orange';
  if (v === 'yellow') return 'yellow';
  return 'green';
}

function state() {
  if (!window[STATE_KEY]) {
    const storedTab = localStorage.getItem(TAB_KEY);
    window[STATE_KEY] = {
      tab: storedTab === 'integrations' && canSeeIntegrations() ? 'integrations' : 'live',
      live: null,
      integrations: null,
      dq: null,
      socket: null,
      retryIndex: 0,
    };
  }
  return window[STATE_KEY];
}

function openPatient(patientId, reasonText) {
  if (!patientId) return;
  window._selectedPatientId = patientId;
  window._profilePatientId = patientId;
  window._profileMonitorHandoff = { source: 'monitor', tab: 'monitoring', reason_text: reasonText || null };
  window._nav?.('patient-profile');
}

function renderKpis(live) {
  const k = live?.kpis || {};
  const cards = [
    ['Red', k.red, 'red'],
    ['Orange', k.orange, 'orange'],
    ['Yellow', k.yellow, 'yellow'],
    ['Green', k.green, 'green'],
    ['Open crises', k.open_crises, 'red'],
    ['Wearable uptime', fmtPct(k.wearable_uptime_pct), 'green'],
    ['PROM compliance', fmtPct(k.prom_compliance_pct), 'blue'],
  ];
  return `<section class="monitor-kpi-strip">${cards.map(([label, value, color]) => `
    <article class="monitor-kpi-card monitor-kpi-card--${color}">
      <div class="monitor-kpi-label">${esc(label)}</div>
      <div class="monitor-kpi-value">${esc(value)}</div>
    </article>`).join('')}</section>`;
}

function renderLive(live) {
  const crises = Array.isArray(live?.crises) ? live.crises : [];
  const rows = Array.isArray(live?.caseload) ? live.caseload : [];
  return `
    <section class="monitor-panel">
      <div class="monitor-panel-head"><h3>Caseload grid</h3><span>${rows.length} active rows</span></div>
      ${rows.length ? `<div class="monitor-table-wrap"><table class="monitor-table"><thead>
        <tr><th>Patient</th><th>Tier</th><th>Drivers</th><th>HRV</th><th>Sleep</th><th>PROM Δ</th><th>Adherence</th><th>Last signal</th></tr>
      </thead><tbody>
        ${rows.map((row) => `<tr onclick="window._monitorOpenPatient('${esc(row.patient_id)}', '${esc((row.risk_drivers || []).join(', '))}')">
          <td><div class="monitor-patient-name">${esc(row.display_name)}</div><div class="monitor-muted">${esc(row.patient_id)}</div></td>
          <td><span class="monitor-badge monitor-badge--${tone(row.risk_tier)}">${esc(row.risk_tier)}</span></td>
          <td>${esc((row.risk_drivers || []).join(', ') || 'stable')}</td>
          <td>${fmtNum(row.hrv_last)}</td>
          <td>${fmtNum(row.sleep_last)}</td>
          <td>${fmtNum(row.prom_delta)}</td>
          <td>${fmtPct(row.adherence_pct)}</td>
          <td>${esc(fmtAgo(row.last_feature_at))}</td>
        </tr>`).join('')}
      </tbody></table></div>` : `<div class="monitor-empty-inline">No active caseload rows.</div>`}
    </section>
    <section class="monitor-panel monitor-panel--crisis">
      <div class="monitor-panel-head"><h3>Crisis queue</h3><span>${crises.length} open</span></div>
      ${crises.length ? crises.map((item) => `<button class="monitor-crisis-item" onclick="window._monitorOpenPatient('${esc(item.patient_id)}', '${esc(item.reason_text || '')}')">
        <div class="monitor-crisis-item__row"><strong>${esc(item.display_name)}</strong><span class="monitor-badge monitor-badge--red">${Math.round(Number(item.score || 0) * 100)}%</span></div>
        <div class="monitor-crisis-item__sub">${esc(item.reason_text || item.top_driver || 'Immediate review required.')}</div>
      </button>`).join('') : `<div class="monitor-empty-inline monitor-empty-inline--ok">No open crises right now.</div>`}
    </section>`;
}

function renderIntegrations(data) {
  const groups = Object.entries(data?.groups || {});
  const configured = new Map((data?.configured || []).map((item) => [item.connector_id, item]));
  const writable = canWriteIntegrations();
  return `<section class="monitor-panel">
    <div class="monitor-panel-head"><h3>Integrations</h3><span>${configured.size} configured</span></div>
    ${groups.map(([kind, items]) => `<div class="monitor-integration-group">
      <div class="monitor-group-title">${esc(kind.replace(/_/g, ' '))}</div>
      <div class="monitor-card-grid">
        ${(items || []).map((item) => {
          const active = configured.get(item.id);
          const targetId = active?.id || item.id;
          return `<article class="monitor-integration-card">
            <div class="monitor-integration-head"><strong>${esc(item.display_name)}</strong><span class="monitor-badge monitor-badge--${tone(active?.status || 'green')}">${esc(active?.status || 'disconnected')}</span></div>
            <div class="monitor-muted">${esc(item.auth_method || 'managed')} · ${(active?.patient_count ?? 0)} patients</div>
            <div class="monitor-muted">${active?.last_sync_at ? `Last sync ${esc(fmtAgo(active.last_sync_at))}` : 'Not yet connected'}</div>
            ${active?.last_error ? `<div class="monitor-inline-error">${esc(active.last_error)}</div>` : ''}
            <div class="monitor-inline-actions">
              ${active
                ? `<button class="btn btn-sm" onclick="window._monitorSyncIntegration('${esc(targetId)}')">Sync</button>
                   <button class="btn btn-sm" ${writable ? `onclick="window._monitorDisconnectIntegration('${esc(targetId)}')"` : 'disabled'}>Disconnect</button>`
                : `<button class="btn btn-sm btn-primary" ${writable ? `onclick="window._monitorConnectIntegration('${esc(item.id)}')"` : 'disabled'}>Connect</button>`}
            </div>
          </article>`;
        }).join('')}
      </div>
    </div>`).join('')}
  </section>`;
}

function renderDq(dq) {
  const issues = Array.isArray(dq?.issues) ? dq.issues : [];
  return `<section class="monitor-panel">
    <div class="monitor-panel-head"><h3>Data quality</h3><span>${issues.length} issues</span></div>
    ${issues.length ? issues.map((item) => `<div class="monitor-issue monitor-issue--${tone(item.severity)}">
      <div class="monitor-issue-head"><strong>${esc(item.title)}</strong><span class="monitor-badge monitor-badge--${tone(item.severity)}">${esc(item.severity)}</span></div>
      <div class="monitor-muted">${esc(item.detail || '')}</div>
      ${item.suggested_fix ? `<div class="monitor-issue-fix">${esc(item.suggested_fix)}</div>` : ''}
      ${canWriteIntegrations() ? `<div class="monitor-inline-actions"><button class="btn btn-sm" onclick="window._monitorResolveIssue('${esc(item.id)}')">Resolve</button></div>` : ''}
    </div>`).join('') : `<div class="monitor-empty-inline monitor-empty-inline--ok">No data-quality issues.</div>`}
  </section>`;
}

function render() {
  const s = state();
  const live = s.live || { kpis: {}, crises: [], caseload: [] };
  const integrations = s.integrations || { groups: {}, configured: [] };
  const dq = s.dq || { issues: [] };
  const el = document.getElementById('content');
  if (!el) return;
  el.innerHTML = `<div class="monitor-shell">
    <div class="monitor-hero">
      <div><div class="monitor-kicker">Between-session triage</div><h1>Monitor</h1><p>One page for live caseload risk, connected data pipes, and clinic device health.</p></div>
      <div class="monitor-tabs" role="tablist">
        <button class="monitor-tab ${s.tab === 'live' ? 'is-active' : ''}" onclick="window._monitorSetTab('live')">Live</button>
        ${canSeeIntegrations() ? `<button class="monitor-tab ${s.tab === 'integrations' ? 'is-active' : ''}" onclick="window._monitorSetTab('integrations')">Integrations</button>` : ''}
      </div>
    </div>
    ${renderKpis(live)}
    <div class="monitor-main-grid">
      <div class="monitor-main-col">
        ${s.tab === 'integrations' ? renderIntegrations(integrations) : renderLive(live)}
        ${renderDq(dq)}
      </div>
    </div>
  </div>`;
}

async function loadLive() {
  const s = state();
  try { s.live = await api.monitorLiveSnapshot(); } catch {}
  render();
}

async function loadIntegrations() {
  const s = state();
  if (!canSeeIntegrations()) return;
  try { s.integrations = await api.monitorIntegrations(); } catch {}
  render();
}

async function loadDq() {
  const s = state();
  try { s.dq = await api.monitorDataQualityIssues(); } catch {}
  render();
}

function connectLiveStream() {
  const s = state();
  if (s.socket) {
    try { s.socket.close(); } catch {}
  }
  try {
    s.socket = new WebSocket(api.monitorLiveStreamUrl());
    s.socket.onopen = function () { s.retryIndex = 0; };
    s.socket.onmessage = function (event) {
      try {
        const payload = JSON.parse(event.data);
        if (payload && payload.caseload && payload.kpis) {
          s.live = payload;
          render();
        }
      } catch {}
    };
    s.socket.onclose = function () {
      const wait = RETRY_MS[Math.min(s.retryIndex, RETRY_MS.length - 1)];
      s.retryIndex += 1;
      window.setTimeout(connectLiveStream, wait);
    };
  } catch {}
}

export async function pgMonitor(setTopbar) {
  setTopbar('Monitor', '<span class="monitor-topbar-pill">Live + Integrations</span>');
  const s = state();
  render();
  await Promise.all([loadLive(), loadDq(), s.tab === 'integrations' ? loadIntegrations() : Promise.resolve()]);
  connectLiveStream();
  window._monitorSetTab = function (tab) {
    s.tab = tab === 'integrations' && canSeeIntegrations() ? 'integrations' : 'live';
    localStorage.setItem(TAB_KEY, s.tab);
    render();
    if (s.tab === 'integrations') void loadIntegrations();
  };
  window._monitorOpenPatient = openPatient;
  window._monitorConnectIntegration = function (connectorId) { (async function () { try { await api.monitorConnectIntegration(connectorId, {}); } catch {} await loadIntegrations(); })(); };
  window._monitorSyncIntegration = function (integrationId) { (async function () { try { await api.monitorSyncIntegration(integrationId); } catch {} await loadIntegrations(); })(); };
  window._monitorDisconnectIntegration = function (integrationId) { (async function () { try { await api.monitorDisconnectIntegration(integrationId); } catch {} await loadIntegrations(); })(); };
  window._monitorResolveIssue = function (issueId) { (async function () { try { await api.monitorResolveDataQualityIssue(issueId, {}); } catch {} await loadDq(); })(); };
}
