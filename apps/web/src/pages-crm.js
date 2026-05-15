// ─────────────────────────────────────────────────────────────────────────────
// pages-crm.js — DeepSynaps CRM Frontend (Super-Admin CRM Dashboard)
//
// Complete super-admin CRM dashboard with 9 modules:
//   1. Executive Dashboard      5. Support Centre
//   2. Clinic Directory         6. Platform Ops
//   3. Clinic Detail            7. Compliance Dashboard
//   4. AI Ops Dashboard         8. Finance Dashboard
//                              9. Research Analytics
//
// Entry gate: admin / supervisor only. No PHI without break-glass.
// Clinic data ownership respected. All actions audited.
// ─────────────────────────────────────────────────────────────────────────────

import { api } from './api.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDateOnly(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtNumber(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString();
}

function fmtCurrency(n) {
  if (n == null) return '—';
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDuration(ms) {
  if (ms == null || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function statusBadge(status, opts = {}) {
  const { size = '11px', padding = '2px 8px' } = opts;
  const colors = {
    active: ['rgba(34,197,94,0.12)', 'var(--green)'],
    inactive: ['rgba(148,163,184,0.12)', 'var(--text-tertiary)'],
    pending: ['rgba(245,158,11,0.12)', 'var(--amber)'],
    flagged: ['rgba(239,68,68,0.12)', 'var(--red)'],
    complete: ['rgba(59,130,246,0.12)', 'var(--blue)'],
    trial: ['rgba(139,92,246,0.12)', 'var(--purple)'],
    churned: ['rgba(239,68,68,0.12)', 'var(--red)'],
    suspended: ['rgba(245,158,11,0.12)', 'var(--amber)'],
    open: ['rgba(245,158,11,0.12)', 'var(--amber)'],
    resolved: ['rgba(34,197,94,0.12)', 'var(--green)'],
    escalated: ['rgba(239,68,68,0.12)', 'var(--red)'],
    critical: ['rgba(239,68,68,0.12)', 'var(--red)'],
    warning: ['rgba(245,158,11,0.12)', 'var(--amber)'],
    healthy: ['rgba(34,197,94,0.12)', 'var(--green)'],
    degraded: ['rgba(245,158,11,0.12)', 'var(--amber)'],
    down: ['rgba(239,68,68,0.12)', 'var(--red)'],
    granted: ['rgba(34,197,94,0.12)', 'var(--green)'],
    revoked: ['rgba(239,68,68,0.12)', 'var(--red)'],
    missing: ['rgba(245,158,11,0.12)', 'var(--amber)'],
  };
  const [bg, fg] = colors[status] || colors.inactive;
  return `<span style="background:${bg};color:${fg};font-size:${size};font-weight:600;padding:${padding};border-radius:4px;text-transform:capitalize;white-space:nowrap" data-test="badge-${esc(status || 'unknown')}">${esc(status || '—')}</span>`;
}

function healthDot(health, opts = {}) {
  const { size = 8 } = opts;
  const colors = {
    healthy: 'var(--green)',
    degraded: 'var(--amber)',
    down: 'var(--red)',
    unknown: 'var(--text-tertiary)',
  };
  const color = colors[health] || colors.unknown;
  return `<span title="${esc(health || 'unknown')}" style="width:${size}px;height:${size}px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0" data-test="health-dot-${esc(health || 'unknown')}"></span>`;
}

function kpiCard(label, value, opts = {}) {
  const { subtitle = '', color = 'var(--text-primary)', trend = '', action = '', testId = '' } = opts;
  const trendHtml = trend
    ? `<span style="font-size:11px;color:${trend.startsWith('+') ? 'var(--green)' : trend.startsWith('-') ? 'var(--red)' : 'var(--text-tertiary)'};margin-left:6px">${esc(trend)}</span>`
    : '';
  return `
  <div class="ch-card" data-test="kpi-${testId || esc(label.toLowerCase().replace(/\s+/g, '-'))}" style="padding:14px 16px;display:flex;flex-direction:column;gap:4px;min-width:150px;flex:1">
    <div style="font-size:10.5px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.6px">${esc(label)}</div>
    <div style="font-size:22px;font-weight:700;color:${color};font-variant-numeric:tabular-nums">${esc(String(value))}${trendHtml}</div>
    ${subtitle ? `<div style="font-size:11px;color:var(--text-tertiary)">${esc(subtitle)}</div>` : ''}
    ${action}
  </div>`;
}

function spinner(text = 'Loading...') {
  return `<span style="display:inline-flex;align-items:center;gap:8px;color:var(--text-tertiary);font-size:12px"><span class="spinner" style="width:16px;height:16px;border:2px solid var(--border);border-top-color:var(--teal);border-radius:50%;display:inline-block;animation:spin 0.7s linear infinite"></span>${esc(text)}</span>`;
}

function emptyState(icon, title, subtitle, action = '') {
  return `
  <div style="padding:48px 24px;text-align:center;color:var(--text-tertiary)" data-test="empty-state">
    <div style="font-size:48px;margin-bottom:12px;opacity:0.35">${icon}</div>
    <div style="font-size:14px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">${esc(title)}</div>
    <div style="font-size:12px;line-height:1.5;max-width:400px;margin:0 auto">${esc(subtitle)}</div>
    ${action}
  </div>`;
}

function errorState(message, retryAction = '') {
  return `
  <div style="padding:32px 24px;text-align:center;color:var(--red)" data-test="error-state">
    <div style="font-size:32px;margin-bottom:8px">⚠</div>
    <div style="font-size:13px;font-weight:600;margin-bottom:4px">Something went wrong</div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">${esc(message)}</div>
    ${retryAction}
  </div>`;
}

// ── CSS Chart Helpers ────────────────────────────────────────────────────────

function cssBarChart(bars, opts = {}) {
  const { height = 120, barColor = 'var(--teal)', showLabels = true, showValues = true } = opts;
  if (!bars || bars.length === 0) return '<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:11px">No data</div>';
  const maxValue = Math.max(...bars.map(b => b.value || 0), 1);
  const barEls = bars.map((bar, i) => {
    const h = ((bar.value || 0) / maxValue) * (height - 24);
    const label = showLabels ? `<div style="font-size:9px;color:var(--text-tertiary);text-align:center;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60px">${esc(bar.label)}</div>` : '';
    const value = showValues ? `<div style="font-size:9px;color:var(--text-secondary);text-align:center;margin-bottom:2px">${esc(String(bar.value))}</div>` : '';
    return `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;min-width:24px;max-width:80px">
      ${value}
      <div style="width:calc(100% - 4px);min-width:8px;height:${Math.max(h, 2)}px;background:${bar.color || barColor};border-radius:3px 3px 0 0;opacity:${0.6 + (i % 3) * 0.15}"></div>
      ${label}
    </div>`;
  }).join('');
  return `<div style="display:flex;align-items:flex-end;gap:2px;height:${height}px;padding:8px 4px" data-test="bar-chart">${barEls}</div>`;
}

function cssLineChart(points, opts = {}) {
  const { height = 120, lineColor = 'var(--teal)', areaColor = 'rgba(0,212,188,0.08)' } = opts;
  if (!points || points.length === 0) return '<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:11px">No data</div>';
  const values = points.map(p => p.value || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 100;
  const h = 100;
  const stepX = w / (points.length - 1 || 1);
  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = h - ((p.value - min) / range) * (h - 10) - 5;
    return `${x},${y}`;
  }).join(' ');
  const areaCoords = `0,${h} ${coords} ${w},${h}`;
  const labels = points.length <= 12 ? points.map((p, i) => {
    const x = (i / (points.length - 1 || 1)) * 100;
    return `<text x="${x}%" y="${h - 2}" style="font-size:7px;fill:var(--text-tertiary)">${esc(p.label)}</text>`;
  }).join('') : '';
  return `
  <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:${height}px;overflow:visible" data-test="line-chart">
    <polygon points="${areaCoords}" fill="${areaColor}" />
    <polyline points="${coords}" fill="none" stroke="${lineColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    ${points.map((p, i) => {
      const x = i * stepX;
      const y = h - ((p.value - min) / range) * (h - 10) - 5;
      return `<circle cx="${x}" cy="${y}" r="2" fill="${lineColor}" />`;
    }).join('')}
    ${labels}
  </svg>`;
}

function cssGauge(value, max, opts = {}) {
  const { label = '', color = 'var(--teal)' } = opts;
  const pct = Math.min(Math.max((value || 0) / (max || 1), 0), 1);
  const angle = pct * 180;
  return `
  <div style="text-align:center" data-test="gauge">
    <svg viewBox="0 0 100 60" style="width:120px;height:72px;margin:0 auto">
      <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="var(--border)" stroke-width="8" stroke-linecap="round" />
      <path d="M 10 50 A 40 40 0 0 1 ${10 + 40 + 40 * Math.cos((180 - angle) * Math.PI / 180)} ${50 - 40 * Math.sin((180 - angle) * Math.PI / 180)}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" />
      <text x="50" y="48" text-anchor="middle" style="font-size:14px;font-weight:700;fill:var(--text-primary)">${esc(String(value))}</text>
    </svg>
    ${label ? `<div style="font-size:10px;color:var(--text-tertiary)">${esc(label)}</div>` : ''}
  </div>`;
}

// ── Trend indicator component ────────────────────────────────────────────────

function trendIndicator(current, previous, opts = {}) {
  const { size = '11px' } = opts;
  if (current == null || previous == null || previous === 0) return '';
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const isUp = pct >= 0;
  const color = isUp ? 'var(--green)' : 'var(--red)';
  const arrow = isUp ? '▲' : '▼';
  return `<span style="font-size:${size};color:${color};font-weight:600;white-space:nowrap" data-test="trend-indicator">${arrow} ${Math.abs(pct).toFixed(1)}%</span>`;
}

// ── Percentage bar ───────────────────────────────────────────────────────────

function pctBar(label, value, max, opts = {}) {
  const { barColor = 'var(--teal)', showPct = true } = opts;
  const pct = Math.min(Math.max(((value || 0) / (max || 1)) * 100, 0), 100);
  return `
  <div style="margin-bottom:8px" data-test="pct-bar">
    <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
      <span style="color:var(--text-secondary)">${esc(label)}</span>
      <span style="color:var(--text-primary);font-weight:600">${fmtNumber(value || 0)}${showPct ? ` (${pct.toFixed(1)}%)` : ''}</span>
    </div>
    <div style="width:100%;height:6px;background:var(--surface-1);border-radius:3px;overflow:hidden">
      <div style="width:${pct}%;height:100%;background:${barColor};border-radius:3px;transition:width 0.4s ease"></div>
    </div>
  </div>`;
}

// ── Mobile responsive CSS ────────────────────────────────────────────────────

function _injectCRMStyles() {
  if (document.getElementById('crm-styles')) return;
  const style = document.createElement('style');
  style.id = 'crm-styles';
  style.textContent = `
    @keyframes crm-spin { to { transform: rotate(360deg); } }
    .crm-spinner { animation: crm-spin 0.7s linear infinite; }
    @media (max-width: 768px) {
      [data-test="crm-tabs"] { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      [data-test="dashboard-kpis"],
      [data-test="clinic-overview-kpis"],
      [data-test="ai-ops-kpis"],
      [data-test="support-stats"],
      [data-test="ops-kpis"],
      [data-test="compliance-kpis"],
      [data-test="finance-kpis"],
      [data-test="research-kpis"] { flex-direction: column !important; }
      [data-test="service-status-grid"] { grid-template-columns: 1fr !important; }
      [data-test="clinic-cards"] { grid-template-columns: 1fr !important; }
      .ch-card { margin-left: -8px; margin-right: -8px; border-radius: 0; }
    }
    @media (max-width: 480px) {
      [data-test="bar-chart"] { height: 100px !important; }
      [data-test="line-chart"] { height: 100px !important; }
    }
  `;
  document.head.appendChild(style);
}

// ── Auto-inject styles on first render ───────────────────────────────────────

let _stylesInjected = false;
function _ensureStyles() {
  if (!_stylesInjected) {
    _injectCRMStyles();
    _stylesInjected = true;
  }
}

// ── Pagination helper ────────────────────────────────────────────────────────

function pagination(currentPage, totalPages, baseUrl, opts = {}) {
  const { testId = 'pagination' } = opts;
  if (totalPages <= 1) return '';
  const pages = [];
  const maxVisible = 5;
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

  for (let i = start; i <= end; i++) {
    const isActive = i === currentPage;
    pages.push(`<a href="${esc(baseUrl)}&p=${i}" style="min-width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:${isActive ? 700 : 500};color:${isActive ? '#fff' : 'var(--text-secondary)'};background:${isActive ? 'var(--teal)' : 'transparent'};border-radius:6px;text-decoration:none;margin:0 1px" data-test="${testId}-page-${i}">${i}</a>`);
  }

  return `
  <div style="display:flex;align-items:center;justify-content:center;gap:4px;padding:12px 0" data-test="${testId}">
    ${currentPage > 1 ? `<a href="${esc(baseUrl)}&p=${currentPage - 1}" style="font-size:11px;color:var(--text-secondary);text-decoration:none;padding:4px 8px" data-test="${testId}-prev">← Prev</a>` : ''}
    ${pages.join('')}
    ${currentPage < totalPages ? `<a href="${esc(baseUrl)}&p=${currentPage + 1}" style="font-size:11px;color:var(--text-secondary);text-decoration:none;padding:4px 8px" data-test="${testId}-next">Next →</a>` : ''}
  </div>`;
}

// ── CSV export helper ────────────────────────────────────────────────────────

function csvDownloadLink(rows, filename, opts = {}) {
  const { label = 'Download CSV' } = opts;
  if (!rows || rows.length === 0) return '';
  const escapeCsv = (v) => {
    const s = String(v ?? '').replace(/"/g, '""');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s}"`;
    return s;
  };
  const csv = rows.map(r => r.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  return `<a href="${url}" download="${esc(filename)}" style="font-size:11px;color:var(--teal);text-decoration:none;display:inline-flex;align-items:center;gap:4px" data-test="csv-download">⬇️ ${esc(label)}</a>`;
}

// ── Responsive grid wrapper ──────────────────────────────────────────────────

function responsiveGrid(content, opts = {}) {
  const { minWidth = '300px', gap = '16px', testId = 'responsive-grid' } = opts;
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(${minWidth}, 1fr));gap:${gap}" data-test="${testId}">${content}</div>`;
}

// ── Page Layout ──────────────────────────────────────────────────────────────

function crmShell(content, opts = {}) {
  const { title = 'CRM', subtitle = '', tabs = '', activeTab = '' } = opts;
  return `
  <div data-test="crm-shell" style="padding:0 0 24px">
    <div style="margin-bottom:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:4px">
        <div>
          <div style="font-size:18px;font-weight:700;color:var(--text-primary)">${esc(title)}</div>
          ${subtitle ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${esc(subtitle)}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:11px;color:var(--text-tertiary)">Super-Admin</span>
          <span style="padding:2px 8px;border-radius:99px;background:rgba(239,68,68,0.12);color:var(--red);font-size:10px;font-weight:600">BREAK-GLASS</span>
        </div>
      </div>
      ${tabs}
    </div>
    ${content}
  </div>`;
}

function crmTabs(tabs, active) {
  const items = tabs.map(([id, label]) => {
    const isActive = id === active;
    return `<a href="?page=${esc(id)}" style="padding:8px 14px;font-size:12px;font-weight:${isActive ? 600 : 500};color:${isActive ? 'var(--teal)' : 'var(--text-secondary)'};border-bottom:2px solid ${isActive ? 'var(--teal)' : 'transparent'};text-decoration:none;white-space:nowrap;display:inline-block;transition:color 0.15s" data-test="crm-tab-${esc(id)}">${esc(label)}</a>`;
  }).join('');
  return `<div style="display:flex;gap:4px;border-bottom:1px solid var(--border);overflow-x:auto;margin-top:12px" data-test="crm-tabs">${items}</div>`;
}

// ── Break-glass gate ─────────────────────────────────────────────────────────

let _breakGlassActive = false;

function breakGlassPanel(reason) {
  return `
  <div class="ch-card" style="padding:16px 18px;margin-bottom:16px;border-left:3px solid var(--red);background:rgba(239,68,68,0.06)" data-test="break-glass-panel">
    <div style="font-size:12px;font-weight:700;color:var(--red);margin-bottom:6px">🔒 PHI Access Gate</div>
    <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.55;margin-bottom:10px">
      ${esc(reason)} This view may contain Protected Health Information.
      All access is audited. You must explicitly enable break-glass mode to view clinic-level patient data.
    </div>
    <button type="button" class="btn btn-sm" style="font-size:11px;background:var(--red);color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-weight:600" onclick="window.__crmEnableBreakGlass && window.__crmEnableBreakGlass()">
      Enable Break-Glass Mode
    </button>
    <div style="font-size:10px;color:var(--text-tertiary);margin-top:6px">Clicking enables audited access to PHI for this session.</div>
  </div>`;
}

// ── Data Fetching ────────────────────────────────────────────────────────────

async function fetchCRMOverview() {
  try {
    const resp = await api.adminCRMOverview?.() || null;
    if (resp) return resp;
  } catch (e) {
    console.warn('CRM overview API unavailable:', e.message);
  }
  return null;
}

async function fetchCRMClinics(query = '') {
  try {
    const resp = await api.adminCRMClinics?.(query) || null;
    if (resp) return Array.isArray(resp) ? resp : (resp.items || []);
  } catch (e) {
    console.warn('CRM clinics API unavailable:', e.message);
  }
  return [];
}

async function fetchCRMClinicDetail(clinicId) {
  try {
    const resp = await api.adminCRMClinicDetail?.(clinicId) || null;
    if (resp) return resp;
  } catch (e) {
    console.warn('CRM clinic detail API unavailable:', e.message);
  }
  return null;
}

async function fetchCRMAIOps() {
  try {
    const resp = await api.adminCRMAIOps?.() || null;
    if (resp) return resp;
  } catch (e) {
    console.warn('CRM AI ops API unavailable:', e.message);
  }
  return null;
}

async function fetchCRMSupportTickets() {
  try {
    const resp = await api.adminCRMSupportTickets?.() || null;
    if (resp) return Array.isArray(resp) ? resp : (resp.items || []);
  } catch (e) {
    console.warn('CRM support API unavailable:', e.message);
  }
  return [];
}

async function fetchCRMPlatformStatus() {
  try {
    const resp = await api.adminCRMPlatformStatus?.() || null;
    if (resp) return resp;
  } catch (e) {
    console.warn('CRM platform API unavailable:', e.message);
  }
  return null;
}

async function fetchCRMCompliance() {
  try {
    const resp = await api.adminCRMCompliance?.() || null;
    if (resp) return resp;
  } catch (e) {
    console.warn('CRM compliance API unavailable:', e.message);
  }
  return null;
}

async function fetchCRMFinance() {
  try {
    const resp = await api.adminCRMFinance?.() || null;
    if (resp) return resp;
  } catch (e) {
    console.warn('CRM finance API unavailable:', e.message);
  }
  return null;
}

async function fetchCRMResearch() {
  try {
    const resp = await api.adminCRMResearch?.() || null;
    if (resp) return resp;
  } catch (e) {
    console.warn('CRM research API unavailable:', e.message);
  }
  return null;
}

async function fetchCRMActivity(limit = 20) {
  try {
    const resp = await api.adminCRMActivity?.(limit) || null;
    if (resp) return Array.isArray(resp) ? resp : (resp.items || []);
  } catch (e) {
    console.warn('CRM activity API unavailable:', e.message);
  }
  return [];
}

// ── Activity Rendering ───────────────────────────────────────────────────────

function activityIcon(type) {
  const icons = {
    clinic_created: '🏥', clinic_updated: '🏥', clinic_churned: '⚠️',
    patient_created: '👤', patient_updated: '👤', patient_accessed: '🔍',
    ai_run: '🤖', ai_failed: '❌', ai_approved: '✅',
    ticket_created: '🎫', ticket_resolved: '✅', ticket_escalated: '🔥',
    billing_payment: '💳', billing_failed: '❌', billing_invoice: '📄',
    compliance_alert: '🚨', compliance_phi_access: '🔒', compliance_violation: '⛔',
    user_login: '🔑', user_created: '👤', user_role_changed: '⚡',
    export_download: '⬇️', consent_granted: '✅', consent_revoked: '❌',
  };
  return icons[type] || '📝';
}

function renderActivityFeed(events, opts = {}) {
  const { maxItems = 20, emptyTitle = 'No recent activity' } = opts;
  const display = (events || []).slice(0, maxItems);
  if (display.length === 0) {
    return emptyState('📝', emptyTitle, 'Activity will appear here as the platform is used.');
  }
  const rows = display.map((evt, i) => `
    <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid ${i < display.length - 1 ? 'var(--border)' : 'transparent'}" data-test="activity-item">
      <div style="font-size:16px;flex-shrink:0;width:24px;text-align:center">${activityIcon(evt.type)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:11.5px;color:var(--text-primary);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(evt.description || evt.message || evt.type)}</div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-top:1px">
          ${esc(evt.actor || evt.actor_id || 'system')} · ${esc(evt.clinic || evt.clinic_id || '—')}
          ${evt.patient || evt.patient_id ? `· patient: <code style="font-size:10px">${esc(evt.patient || evt.patient_id)}</code>` : ''}
        </div>
      </div>
      <div style="font-size:10px;color:var(--text-tertiary);white-space:nowrap;flex-shrink:0">${fmtDate(evt.timestamp || evt.created_at)}</div>
    </div>
  `).join('');
  return `<div data-test="activity-feed" style="max-height:480px;overflow-y:auto">${rows}</div>`;
}

// ── Table Component ──────────────────────────────────────────────────────────

function dataTable(headers, rows, opts = {}) {
  const { testId = 'data-table', emptyText = 'No data available' } = opts;
  if (!rows || rows.length === 0) {
    return `<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:12px" data-test="${testId}-empty">${esc(emptyText)}</div>`;
  }
  const thead = `<thead><tr>${headers.map(h => `<th style="font-size:10.5px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px;text-align:left;padding:8px 10px;border-bottom:1px solid var(--border);white-space:nowrap">${esc(h.label)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map((row, i) => `<tr style="border-bottom:1px solid ${i < rows.length - 1 ? 'var(--border)' : 'transparent'}" data-test="${testId}-row-${i}">${row.map(c => `<td style="font-size:11.5px;padding:8px 10px;color:var(--text-primary);vertical-align:middle">${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `
  <div style="overflow-x:auto" data-test="${testId}">
    <table style="width:100%;border-collapse:collapse">${thead}${tbody}</table>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 1 — EXECUTIVE DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

function _renderCRMDashboard(setTopbar, api) {
  setTopbar('CRM Executive Dashboard', '');
  const el = document.getElementById('content');
  if (!el) return;

  el.innerHTML = spinner('Loading executive dashboard...');

  const tabs = crmTabs([
    ['crm/dashboard', 'Dashboard'],
    ['crm/clinics', 'Clinics'],
    ['crm/ai-ops', 'AI Ops'],
    ['crm/support', 'Support'],
    ['crm/ops', 'Platform'],
    ['crm/compliance', 'Compliance'],
    ['crm/finance', 'Finance'],
    ['crm/research', 'Research'],
  ], '/crm/dashboard');

  _loadDashboard(el, tabs);
}

async function _loadDashboard(el, tabs) {
  try {
    const [overview, activity] = await Promise.all([
      fetchCRMOverview(),
      fetchCRMActivity(20),
    ]);

    if (!overview) {
      el.innerHTML = crmShell(
        errorState('CRM overview data is unavailable. The API endpoint may not be deployed yet.', `
          <button class="btn btn-sm btn-secondary" style="margin-top:8px" onclick="window.__crmRefresh && window.__crmRefresh()">Retry</button>
        `),
        { title: 'CRM Executive Dashboard', subtitle: 'Super-admin overview of the DeepSynaps platform', tabs }
      );
      return;
    }

    const kpis = [
      kpiCard('MRR', fmtCurrency(overview.mrr), { subtitle: 'Monthly Recurring Revenue', trend: overview.mrr_trend || '', color: 'var(--teal)', testId: 'mrr' }),
      kpiCard('ARR', fmtCurrency(overview.arr), { subtitle: 'Annual Recurring Revenue', color: 'var(--teal)', testId: 'arr' }),
      kpiCard('Clinics', fmtNumber(overview.total_clinics), { subtitle: `${fmtNumber(overview.active_clinics)} active · ${fmtNumber(overview.trial_clinics)} trial · ${fmtNumber(overview.churned_clinics)} churned`, color: 'var(--blue)', testId: 'clinics' }),
      kpiCard('Patients', fmtNumber(overview.total_patients), { subtitle: 'Across all clinics', color: 'var(--purple)', testId: 'patients' }),
      kpiCard('Clinicians', fmtNumber(overview.active_clinicians), { subtitle: 'Active clinical staff', color: 'var(--cyan)', testId: 'clinicians' }),
      kpiCard('AI Runs Today', fmtNumber(overview.ai_runs_today), { subtitle: `This week: ${fmtNumber(overview.ai_runs_week)}`, color: 'var(--green)', testId: 'ai-runs' }),
      kpiCard('Alerts', fmtNumber(overview.critical_alerts), { subtitle: `${fmtNumber(overview.warning_alerts)} warnings`, color: overview.critical_alerts > 0 ? 'var(--red)' : 'var(--amber)', testId: 'alerts' }),
      kpiCard('Infra Health', overview.infra_health || 'Unknown', { subtitle: 'Platform status', color: overview.infra_health === 'healthy' ? 'var(--green)' : overview.infra_health === 'degraded' ? 'var(--amber)' : 'var(--red)', testId: 'infra-health' }),
    ];

    const clinicGrowthBars = (overview.clinic_growth || []).map(g => ({
      label: g.month || g.period || '',
      value: g.count || g.clinics || 0,
      color: 'var(--blue)',
    }));

    const mrrTrendPoints = (overview.mrr_trend_series || []).map(t => ({
      label: t.month || t.period || '',
      value: t.mrr || t.value || 0,
    }));

    const aiUsageBars = (overview.ai_usage_by_clinic || []).map(u => ({
      label: u.clinic_name || u.clinic_id || '',
      value: u.runs || u.count || 0,
      color: 'var(--green)',
    }));

    el.innerHTML = crmShell(`
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px" data-test="dashboard-kpis">
        ${kpis.join('')}
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:16px;margin-bottom:20px">
        <div class="ch-card" data-test="chart-clinic-growth">
          <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Clinic Growth</div>
          ${clinicGrowthBars.length > 0 ? cssBarChart(clinicGrowthBars, { height: 160 }) : emptyState('📊', 'No growth data', 'Clinic growth trends will appear here.')}
        </div>
        <div class="ch-card" data-test="chart-mrr-trend">
          <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">MRR Trend</div>
          ${mrrTrendPoints.length > 0 ? cssLineChart(mrrTrendPoints, { height: 160, lineColor: 'var(--teal)' }) : emptyState('📈', 'No MRR data', 'Revenue trends will appear here.')}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:16px;margin-bottom:20px">
        <div class="ch-card" data-test="chart-ai-usage">
          <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">AI Usage by Clinic (Top 10)</div>
          ${aiUsageBars.length > 0 ? cssBarChart(aiUsageBars, { height: 160, barColor: 'var(--green)' }) : emptyState('🤖', 'No AI usage data', 'AI usage by clinic will appear here.')}
        </div>
        <div class="ch-card" data-test="activity-feed-panel">
          <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Recent Activity</div>
          <div style="padding:8px 14px">
            ${renderActivityFeed(activity)}
          </div>
        </div>
      </div>
    `, { title: 'CRM Executive Dashboard', subtitle: 'Super-admin overview of the DeepSynaps platform', tabs });
  } catch (err) {
    el.innerHTML = crmShell(
      errorState(`Failed to load dashboard: ${err.message}`),
      { title: 'CRM Executive Dashboard', subtitle: 'Super-admin overview of the DeepSynaps platform', tabs }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 2 — CLINIC DIRECTORY
// ═══════════════════════════════════════════════════════════════════════════════

function _renderClinicDirectory(setTopbar, api, query) {
  setTopbar('Clinic Directory', '');
  const el = document.getElementById('content');
  if (!el) return;

  const currentFilter = (query?.status || 'all').toLowerCase();
  const searchTerm = (query?.search || '').trim();

  const tabs = crmTabs([
    ['crm/dashboard', 'Dashboard'],
    ['crm/clinics', 'Clinics'],
    ['crm/ai-ops', 'AI Ops'],
    ['crm/support', 'Support'],
    ['crm/ops', 'Platform'],
    ['crm/compliance', 'Compliance'],
    ['crm/finance', 'Finance'],
    ['crm/research', 'Research'],
  ], '/crm/clinics');

  el.innerHTML = spinner('Loading clinic directory...');
  _loadClinicDirectory(el, tabs, currentFilter, searchTerm);
}

async function _loadClinicDirectory(el, tabs, filter, search) {
  try {
    const clinics = await fetchCRMClinics(search);

    const filterTabs = [
      ['all', 'All'],
      ['active', 'Active'],
      ['trial', 'Trial'],
      ['churned', 'Churned'],
      ['suspended', 'Suspended'],
    ].map(([key, label]) => {
      const isActive = filter === key;
      const count = key === 'all' ? clinics.length : clinics.filter(c => (c.status || '').toLowerCase() === key).length;
      return `<a href="?page=crm/clinics&status=${esc(key)}" style="padding:6px 12px;font-size:11px;font-weight:${isActive ? 600 : 500};color:${isActive ? 'var(--teal)' : 'var(--text-secondary)'};background:${isActive ? 'rgba(0,212,188,0.08)' : 'transparent'};border-radius:6px;text-decoration:none;white-space:nowrap;display:inline-flex;align-items:center;gap:4px" data-test="clinic-filter-${esc(key)}">${esc(label)} <span style="font-size:10px;color:var(--text-tertiary);background:var(--surface-1);padding:1px 5px;border-radius:99px">${count}</span></a>`;
    }).join('');

    const filtered = filter === 'all'
      ? clinics
      : clinics.filter(c => (c.status || '').toLowerCase() === filter);

    const searchBar = `
      <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap" data-test="clinic-search">
        <input type="text" id="crm-clinic-search" placeholder="Search clinics by name or ID..."
          value="${esc(search)}"
          style="flex:1;min-width:200px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--surface-1);color:var(--text-primary)"
          onkeydown="if(event.key==='Enter'){const v=this.value.trim();window._nav('crm/clinics'+(v?'&search='+encodeURIComponent(v):''))}" />
        <button type="button" class="btn btn-sm" style="font-size:11px;padding:8px 14px" onclick="const v=document.getElementById('crm-clinic-search').value.trim();window._nav('crm/clinics'+(v?'&search='+encodeURIComponent(v):''))">Search</button>
      </div>`;

    const tableHeaders = [
      { label: 'Name' }, { label: 'Plan' }, { label: 'Patients' },
      { label: 'Clinicians' }, { label: 'MRR' }, { label: 'Health' },
      { label: 'Status' }, { label: 'Actions' },
    ];

    const tableRows = filtered.map(c => [
      `<div style="display:flex;flex-direction:column;gap:1px">
        <a href="?page=crm/clinics/${esc(c.id || '')}" style="font-weight:600;font-size:12px;color:var(--teal);text-decoration:none" data-test="clinic-link-${esc(c.id || '')}">${esc(c.name || 'Unnamed Clinic')}</a>
        <code style="font-size:10px;color:var(--text-tertiary)">${esc(c.id || '—')}</code>
      </div>`,
      statusBadge(c.plan || '—'),
      fmtNumber(c.patient_count || c.patients || 0),
      fmtNumber(c.clinician_count || c.clinicians || 0),
      fmtCurrency(c.mrr),
      `<div style="display:flex;align-items:center;gap:6px">${healthDot(c.health_status)}<span style="font-size:11px;text-transform:capitalize">${esc(c.health_status || 'unknown')}</span></div>`,
      statusBadge(c.status),
      `<a href="?page=crm/clinics/${esc(c.id || '')}" style="font-size:11px;color:var(--teal);text-decoration:none">View →</a>`,
    ]);

    const clinicCards = filtered.map(c => `
      <div class="ch-card" style="padding:14px 16px;display:flex;flex-direction:column;gap:8px" data-test="clinic-card-${esc(c.id || '')}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between">
          <div>
            <a href="?page=crm/clinics/${esc(c.id || '')}" style="font-size:13px;font-weight:700;color:var(--text-primary);text-decoration:none">${esc(c.name || 'Unnamed Clinic')}</a>
            <div style="font-size:10px;color:var(--text-tertiary);margin-top:1px">${esc(c.id || '—')}</div>
          </div>
          ${statusBadge(c.plan || '—')}
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--text-secondary)">
          <span><strong>${fmtNumber(c.patient_count || c.patients || 0)}</strong> patients</span>
          <span><strong>${fmtNumber(c.clinician_count || c.clinicians || 0)}</strong> clinicians</span>
          <span>${fmtCurrency(c.mrr)} MRR</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;font-size:10px;color:var(--text-tertiary)">
          <span>Last activity: ${fmtDate(c.last_activity)}</span>
          <span>Health: ${healthDot(c.health_status)} ${esc(c.health_status || 'unknown')}</span>
        </div>
        <div style="display:flex;gap:6px;margin-top:2px">
          ${c.compliance_status === 'compliant'
            ? '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(34,197,94,0.12);color:var(--green)">Compliant</span>'
            : '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(245,158,11,0.12);color:var(--amber)">Needs Attention</span>'}
        </div>
      </div>
    `).join('');

    el.innerHTML = crmShell(`
      ${searchBar}
      <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap" data-test="clinic-filters">
        ${filterTabs}
      </div>
      <div class="ch-card" style="margin-bottom:16px;overflow:hidden" data-test="clinic-table-card">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Clinics (${filtered.length})</div>
        ${dataTable(tableHeaders, tableRows, { testId: 'clinic-table' })}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:12px" data-test="clinic-cards">
        ${clinicCards || emptyState('🏥', 'No clinics found', 'No clinics match the current filter.')}
      </div>
    `, { title: 'Clinic Directory', subtitle: `${clinics.length} clinics across the platform`, tabs });
  } catch (err) {
    el.innerHTML = crmShell(
      errorState(`Failed to load clinic directory: ${err.message}`),
      { title: 'Clinic Directory', tabs }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 3 — CLINIC DETAIL
// ═══════════════════════════════════════════════════════════════════════════════

function _renderClinicDetail(setTopbar, api, params) {
  const clinicId = params?.clinicId || '';
  setTopbar('Clinic Detail', clinicId);
  const el = document.getElementById('content');
  if (!el) return;

  const query = new URLSearchParams(window.location.search);
  const detailTab = query.get('tab') || 'overview';

  el.innerHTML = spinner('Loading clinic detail...');
  _loadClinicDetail(el, clinicId, detailTab);
}

async function _loadClinicDetail(el, clinicId, activeTab) {
  try {
    const detail = await fetchCRMClinicDetail(clinicId);

    if (!detail) {
      el.innerHTML = crmShell(
        errorState(`Clinic ${clinicId} not found or API unavailable.`, `
          <button class="btn btn-sm btn-secondary" style="margin-top:8px" onclick="window._nav('crm/clinics')">← Back to Directory</button>
        `),
        { title: 'Clinic Detail', subtitle: clinicId }
      );
      return;
    }

    const detailTabs = crmTabs([
      [`crm/clinics/${clinicId}?tab=overview`, 'Overview'],
      [`crm/clinics/${clinicId}?tab=analytics`, 'Analytics'],
      [`crm/clinics/${clinicId}?tab=users`, 'Users'],
      [`crm/clinics/${clinicId}?tab=ai-usage`, 'AI Usage'],
      [`crm/clinics/${clinicId}?tab=tickets`, 'Tickets'],
      [`crm/clinics/${clinicId}?tab=audit`, 'Audit'],
      [`crm/clinics/${clinicId}?tab=billing`, 'Billing'],
    ], `crm/clinics/${clinicId}?tab=${activeTab}`);

    const clinic = detail.clinic || detail;
    const header = `
      <div class="ch-card" style="padding:16px 18px;margin-bottom:16px" data-test="clinic-detail-header">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div>
            <div style="font-size:16px;font-weight:700;color:var(--text-primary)">${esc(clinic.name || 'Unnamed Clinic')}</div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">
              <code>${esc(clinicId)}</code> · Created ${fmtDate(clinic.created_at)}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            ${statusBadge(clinic.plan || '—')}
            ${statusBadge(clinic.status)}
            <div style="display:flex;align-items:center;gap:6px;font-size:11px">
              ${healthDot(clinic.health_status)} Health: ${esc(clinic.health_status || 'unknown')}
            </div>
          </div>
        </div>
      </div>`;

    let tabContent = '';
    switch (activeTab) {
      case 'overview':
        tabContent = _clinicOverviewTab(detail, clinic);
        break;
      case 'analytics':
        tabContent = _clinicAnalyticsTab(detail, clinic);
        break;
      case 'users':
        tabContent = _clinicUsersTab(detail, clinic);
        break;
      case 'ai-usage':
        tabContent = _clinicAIUsageTab(detail, clinic);
        break;
      case 'tickets':
        tabContent = _clinicTicketsTab(detail, clinic);
        break;
      case 'audit':
        tabContent = _clinicAuditTab(detail, clinic);
        break;
      case 'billing':
        tabContent = _clinicBillingTab(detail, clinic);
        break;
      default:
        tabContent = _clinicOverviewTab(detail, clinic);
    }

    el.innerHTML = crmShell(`${header}${tabContent}`, {
      title: clinic.name || 'Clinic Detail',
      subtitle: clinicId,
      tabs: detailTabs,
    });
  } catch (err) {
    el.innerHTML = crmShell(
      errorState(`Failed to load clinic detail: ${err.message}`),
      { title: 'Clinic Detail', subtitle: clinicId }
    );
  }
}

function _clinicOverviewTab(detail, clinic) {
  const kpis = [
    kpiCard('Patients', fmtNumber(clinic.patient_count || clinic.patients || 0), { color: 'var(--purple)', testId: 'clinic-patients' }),
    kpiCard('Clinicians', fmtNumber(clinic.clinician_count || clinic.clinicians || 0), { color: 'var(--cyan)', testId: 'clinic-clinicians' }),
    kpiCard('qEEG Scans', fmtNumber(detail.qeeg_count || 0), { color: 'var(--teal)', testId: 'clinic-qeeg' }),
    kpiCard('MRI Scans', fmtNumber(detail.mri_count || 0), { color: 'var(--blue)', testId: 'clinic-mri' }),
    kpiCard('Storage', detail.storage_used || '—', { color: 'var(--amber)', testId: 'clinic-storage' }),
    kpiCard('Consent Status', detail.consent_status || '—', { color: detail.consent_status === 'complete' ? 'var(--green)' : 'var(--amber)', testId: 'clinic-consent' }),
  ];

  const consentBreakdown = (detail.consent_breakdown || []).map(c => `
    <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:11px">
      <span style="color:var(--text-secondary)">${esc(c.type || '—')}</span>
      <span style="font-weight:600;color:${c.granted ? 'var(--green)' : 'var(--red)'}">${c.granted ? 'Granted' : 'Missing'}</span>
    </div>
  `).join('') || '<div style="font-size:11px;color:var(--text-tertiary);padding:8px 0">No consent data available</div>';

  return `
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px" data-test="clinic-overview-kpis">
      ${kpis.join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:16px">
      <div class="ch-card" data-test="clinic-consent-panel">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Consent Overview</div>
        <div style="padding:12px 14px">${consentBreakdown}</div>
      </div>
      <div class="ch-card" data-test="clinic-recent-activity">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Recent Clinic Activity</div>
        <div style="padding:8px 14px">${renderActivityFeed(detail.recent_activity || [], { maxItems: 10 })}</div>
      </div>
    </div>`;
}

function _clinicAnalyticsTab(detail, clinic) {
  const usageBars = (detail.usage_by_feature || []).map(u => ({
    label: u.feature || '',
    value: u.count || 0,
    color: 'var(--teal)',
  }));

  const adoptionBars = (detail.feature_adoption || []).map(a => ({
    label: a.feature || '',
    value: a.adoption_rate || 0,
    color: 'var(--blue)',
  }));

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:16px">
      <div class="ch-card" data-test="clinic-usage-chart">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Usage by Feature</div>
        ${usageBars.length > 0 ? cssBarChart(usageBars, { height: 180 }) : emptyState('📊', 'No usage data', 'Feature usage analytics will appear here.')}
      </div>
      <div class="ch-card" data-test="clinic-adoption-chart">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Feature Adoption Rate (%)</div>
        ${adoptionBars.length > 0 ? cssBarChart(adoptionBars, { height: 180, barColor: 'var(--blue)' }) : emptyState('📈', 'No adoption data', 'Feature adoption metrics will appear here.')}
      </div>
    </div>`;
}

function _clinicUsersTab(detail, clinic) {
  const users = detail.users || [];
  const headers = [
    { label: 'Name' }, { label: 'Role' }, { label: 'Email' },
    { label: 'Last Login' }, { label: 'Status' },
  ];
  const rows = users.map(u => [
    esc(u.name || u.full_name || '—'),
    esc(u.role || '—'),
    esc(u.email || '—'),
    fmtDate(u.last_login),
    statusBadge(u.status || 'active'),
  ]);
  return `
    <div class="ch-card" data-test="clinic-users-table">
      <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Clinic Users (${users.length})</div>
      ${dataTable(headers, rows, { testId: 'clinic-users', emptyText: 'No users found for this clinic.' })}
    </div>`;
}

function _clinicAIUsageTab(detail, clinic) {
  const runs = detail.ai_runs || [];
  const headers = [
    { label: 'Agent' }, { label: 'Runs' }, { label: 'Cost' },
    { label: 'Tool Calls' }, { label: 'Status' },
  ];
  const rows = runs.map(r => [
    esc(r.agent || r.agent_name || '—'),
    fmtNumber(r.runs || 0),
    fmtCurrency(r.cost),
    fmtNumber(r.tool_calls || 0),
    statusBadge(r.status || 'active'),
  ]);

  const costPoints = (detail.ai_cost_series || []).map(c => ({
    label: c.period || '',
    value: c.cost || 0,
  }));

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:16px;margin-bottom:16px">
      <div class="ch-card" data-test="clinic-ai-cost-chart">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">AI Cost Trend</div>
        ${costPoints.length > 0 ? cssLineChart(costPoints, { height: 160 }) : emptyState('💰', 'No cost data', 'AI cost trends will appear here.')}
      </div>
      <div class="ch-card" data-test="clinic-ai-summary">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">AI Summary</div>
        <div style="padding:14px;display:flex;flex-direction:column;gap:8px">
          ${kpiCard('Total Runs', fmtNumber(detail.ai_total_runs || 0), { color: 'var(--green)', testId: 'clinic-ai-total-runs' })}
          ${kpiCard('Total Cost', fmtCurrency(detail.ai_total_cost), { color: 'var(--amber)', testId: 'clinic-ai-total-cost' })}
          ${kpiCard('Failed Runs', fmtNumber(detail.ai_failed_runs || 0), { color: 'var(--red)', testId: 'clinic-ai-failed' })}
        </div>
      </div>
    </div>
    <div class="ch-card" data-test="clinic-ai-runs-table">
      <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">AI Agent Runs</div>
      ${dataTable(headers, rows, { testId: 'clinic-ai-runs', emptyText: 'No AI runs recorded for this clinic.' })}
    </div>`;
}

function _clinicTicketsTab(detail, clinic) {
  const tickets = detail.tickets || [];
  const headers = [
    { label: 'ID' }, { label: 'Subject' }, { label: 'Priority' },
    { label: 'Status' }, { label: 'Assignee' }, { label: 'Created' },
  ];
  const rows = tickets.map(t => [
    `<code style="font-size:10px">${esc(t.id || '—')}</code>`,
    esc(t.subject || '—'),
    statusBadge(t.priority || 'normal'),
    statusBadge(t.status || 'open'),
    esc(t.assignee || 'Unassigned'),
    fmtDate(t.created_at),
  ]);
  return `
    <div class="ch-card" data-test="clinic-tickets-table">
      <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Support Tickets (${tickets.length})</div>
      ${dataTable(headers, rows, { testId: 'clinic-tickets', emptyText: 'No support tickets for this clinic.' })}
    </div>`;
}

function _clinicAuditTab(detail, clinic) {
  const events = detail.audit_log || [];
  const headers = [
    { label: 'Time' }, { label: 'Actor' }, { label: 'Action' },
    { label: 'Resource' }, { label: 'Result' }, { label: 'Reason' },
  ];
  const rows = events.map(e => [
    `<span style="font-size:10px;white-space:nowrap">${fmtDate(e.timestamp)}</span>`,
    esc(e.actor || e.actor_id || '—'),
    esc(e.action || '—'),
    `<code style="font-size:10px">${esc(e.resource_type || '—')}</code>`,
    `<span style="color:${e.result === 'success' ? 'var(--green)' : e.result === 'failure' ? 'var(--red)' : 'var(--amber)'};font-weight:600">${esc(e.result || '—')}</span>`,
    esc(e.reason || '—'),
  ]);
  return `
    <div class="ch-card" data-test="clinic-audit-table">
      <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Audit Log (${events.length} events)</div>
      ${dataTable(headers, rows, { testId: 'clinic-audit', emptyText: 'No audit events for this clinic.' })}
    </div>`;
}

function _clinicBillingTab(detail, clinic) {
  const subscription = detail.subscription || {};
  const invoices = detail.invoices || [];
  const payments = detail.payments || [];

  const invoiceHeaders = [
    { label: 'Invoice #' }, { label: 'Amount' }, { label: 'Status' },
    { label: 'Date' }, { label: 'Due' },
  ];
  const invoiceRows = invoices.map(inv => [
    `<code style="font-size:10px">${esc(inv.id || '—')}</code>`,
    fmtCurrency(inv.amount),
    statusBadge(inv.status),
    fmtDate(inv.date || inv.created_at),
    fmtDate(inv.due_date),
  ]);

  const paymentHeaders = [
    { label: 'Date' }, { label: 'Amount' }, { label: 'Method' }, { label: 'Status' },
  ];
  const paymentRows = payments.map(p => [
    fmtDate(p.date || p.created_at),
    fmtCurrency(p.amount),
    esc(p.method || '—'),
    statusBadge(p.status),
  ]);

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:16px;margin-bottom:16px">
      <div class="ch-card" data-test="clinic-subscription">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Subscription</div>
        <div style="padding:14px;display:flex;flex-direction:column;gap:8px;font-size:12px">
          <div style="display:flex;justify-content:space-between"><span style="color:var(--text-secondary)">Plan</span><strong>${esc(subscription.plan || clinic.plan || '—')}</strong></div>
          <div style="display:flex;justify-content:space-between"><span style="color:var(--text-secondary)">Status</span>${statusBadge(subscription.status || 'active')}</div>
          <div style="display:flex;justify-content:space-between"><span style="color:var(--text-secondary)">MRR</span><strong>${fmtCurrency(subscription.mrr || clinic.mrr)}</strong></div>
          <div style="display:flex;justify-content:space-between"><span style="color:var(--text-secondary)">Renewal</span><strong>${fmtDate(subscription.renewal_date)}</strong></div>
          <div style="display:flex;justify-content:space-between"><span style="color:var(--text-secondary)">Seats</span><strong>${fmtNumber(subscription.seats || clinic.clinician_count || 0)}</strong></div>
        </div>
      </div>
      <div class="ch-card" data-test="clinic-payment-methods">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Payment Summary</div>
        <div style="padding:14px;display:flex;flex-direction:column;gap:8px">
          ${kpiCard('Total Paid YTD', fmtCurrency(detail.total_paid_ytd), { color: 'var(--green)', testId: 'clinic-paid-ytd' })}
          ${kpiCard('Outstanding', fmtCurrency(detail.outstanding_balance), { color: detail.outstanding_balance > 0 ? 'var(--red)' : 'var(--text-primary)', testId: 'clinic-outstanding' })}
          ${kpiCard('Failed Payments', fmtNumber(detail.failed_payment_count || 0), { color: 'var(--red)', testId: 'clinic-failed-payments' })}
        </div>
      </div>
    </div>
    <div class="ch-card" style="margin-bottom:16px" data-test="clinic-invoices-table">
      <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Invoices (${invoices.length})</div>
      ${dataTable(invoiceHeaders, invoiceRows, { testId: 'clinic-invoices', emptyText: 'No invoices for this clinic.' })}
    </div>
    <div class="ch-card" data-test="clinic-payments-table">
      <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Payment History (${payments.length})</div>
      ${dataTable(paymentHeaders, paymentRows, { testId: 'clinic-payments', emptyText: 'No payment history for this clinic.' })}
    </div>`;
}


// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 4 — AI OPS DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

function _renderAIOpsDashboard(setTopbar, api) {
  setTopbar('AI Ops Dashboard', '');
  const el = document.getElementById('content');
  if (!el) return;

  const tabs = crmTabs([
    ['crm/dashboard', 'Dashboard'],
    ['crm/clinics', 'Clinics'],
    ['crm/ai-ops', 'AI Ops'],
    ['crm/support', 'Support'],
    ['crm/ops', 'Platform'],
    ['crm/compliance', 'Compliance'],
    ['crm/finance', 'Finance'],
    ['crm/research', 'Research'],
  ], '/crm/ai-ops');

  el.innerHTML = spinner('Loading AI Ops dashboard...');
  _loadAIOpsDashboard(el, tabs);
}

async function _loadAIOpsDashboard(el, tabs) {
  try {
    const data = await fetchCRMAIOps();

    if (!data) {
      el.innerHTML = crmShell(
        errorState('AI Ops data is unavailable. The API endpoint may not be deployed yet.'),
        { title: 'AI Ops Dashboard', subtitle: 'Agent usage, costs, and health', tabs }
      );
      return;
    }

    const kpis = [
      kpiCard('Active Agents', fmtNumber(data.active_agents), { color: 'var(--green)', testId: 'ai-active-agents' }),
      kpiCard('Runs Today', fmtNumber(data.runs_today), { subtitle: `This week: ${fmtNumber(data.runs_week)}`, color: 'var(--teal)', testId: 'ai-runs-today' }),
      kpiCard('Failed Runs', fmtNumber(data.failed_runs_today || 0), { subtitle: `${((data.failed_runs_today || 0) / (data.runs_today || 1) * 100).toFixed(1)}% failure rate`, color: (data.failed_runs_today || 0) > 0 ? 'var(--red)' : 'var(--text-primary)', testId: 'ai-failed-runs' }),
      kpiCard('Approval Queue', fmtNumber(data.approval_queue_depth || 0), { color: (data.approval_queue_depth || 0) > 5 ? 'var(--amber)' : 'var(--text-primary)', testId: 'ai-approval-queue' }),
    ];

    const agentHeaders = [
      { label: 'Agent' }, { label: 'Clinic' }, { label: 'Runs' },
      { label: 'Cost' }, { label: 'Status' },
    ];
    const agentRows = (data.agent_usage || []).map(a => [
      esc(a.agent_name || a.agent || '—'),
      esc(a.clinic_name || a.clinic_id || '—'),
      fmtNumber(a.runs || 0),
      fmtCurrency(a.cost),
      statusBadge(a.status || 'active'),
    ]);

    const runHeaders = [
      { label: 'Agent' }, { label: 'Clinic' }, { label: 'Status' },
      { label: 'Duration' }, { label: 'Timestamp' },
    ];
    const runRows = (data.run_history || []).map(r => [
      esc(r.agent_name || r.agent || '—'),
      esc(r.clinic_name || r.clinic_id || '—'),
      statusBadge(r.status || 'completed'),
      fmtDuration(r.duration_ms),
      fmtDate(r.timestamp || r.created_at),
    ]);

    const costBars = (data.cost_breakdown_by_clinic || []).map(c => ({
      label: c.clinic_name || c.clinic_id || '',
      value: c.cost || 0,
      color: 'var(--amber)',
    }));

    const toolBars = (data.tool_usage || []).map(t => ({
      label: t.tool || '',
      value: t.calls || 0,
      color: 'var(--teal)',
    }));

    const errors = data.error_log || [];
    const errorRows = errors.slice(0, 20).map(e => `
      <div style="padding:8px 0;border-bottom:1px solid var(--border);font-family:var(--font-mono);font-size:10.5px" data-test="ai-error-item">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:2px">
          <span style="color:var(--red);font-weight:600">[${esc(e.severity || 'ERROR')}]</span>
          <span style="color:var(--text-tertiary)">${fmtDate(e.timestamp)}</span>
          <code style="font-size:10px;color:var(--text-secondary)">${esc(e.agent || e.agent_id || '—')}</code>
        </div>
        <div style="color:var(--text-secondary);margin-left:4px">${esc(e.message || '—')}</div>
      </div>
    `).join('') || '<div style="padding:12px;color:var(--text-tertiary);font-size:11px">No errors in current window</div>';

    el.innerHTML = crmShell(`
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px" data-test="ai-ops-kpis">
        ${kpis.join('')}
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:16px;margin-bottom:16px">
        <div class="ch-card" data-test="ai-cost-breakdown">
          <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Cost by Clinic</div>
          ${costBars.length > 0 ? cssBarChart(costBars, { height: 160 }) : emptyState('💰', 'No cost data', 'Clinic cost breakdown will appear here.')}
        </div>
        <div class="ch-card" data-test="ai-tool-usage">
          <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Tool Usage</div>
          ${toolBars.length > 0 ? cssBarChart(toolBars, { height: 160 }) : emptyState('🔧', 'No tool data', 'Tool usage statistics will appear here.')}
        </div>
      </div>

      <div class="ch-card" style="margin-bottom:16px" data-test="ai-agent-usage-table">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Agent Usage</div>
        ${dataTable(agentHeaders, agentRows, { testId: 'ai-agent-usage', emptyText: 'No agent usage data.' })}
      </div>

      <div class="ch-card" style="margin-bottom:16px" data-test="ai-run-history-table">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Run History</div>
        ${dataTable(runHeaders, runRows, { testId: 'ai-run-history', emptyText: 'No run history available.' })}
      </div>

      <div class="ch-card" data-test="ai-error-log">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Error Log (${errors.length})</div>
        <div style="padding:8px 14px;max-height:400px;overflow-y:auto">${errorRows}</div>
      </div>
    `, { title: 'AI Ops Dashboard', subtitle: 'Agent usage, costs, and health', tabs });
  } catch (err) {
    el.innerHTML = crmShell(
      errorState(`Failed to load AI Ops dashboard: ${err.message}`),
      { title: 'AI Ops Dashboard', subtitle: 'Agent usage, costs, and health', tabs }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 5 — SUPPORT CENTRE
// ═══════════════════════════════════════════════════════════════════════════════

function _renderSupportCentre(setTopbar, api) {
  setTopbar('Support Centre', '');
  const el = document.getElementById('content');
  if (!el) return;

  const query = new URLSearchParams(window.location.search);
  const ticketFilter = query.get('ticket_status') || 'open';

  const tabs = crmTabs([
    ['crm/dashboard', 'Dashboard'],
    ['crm/clinics', 'Clinics'],
    ['crm/ai-ops', 'AI Ops'],
    ['crm/support', 'Support'],
    ['crm/ops', 'Platform'],
    ['crm/compliance', 'Compliance'],
    ['crm/finance', 'Finance'],
    ['crm/research', 'Research'],
  ], '/crm/support');

  el.innerHTML = spinner('Loading support centre...');
  _loadSupportCentre(el, tabs, ticketFilter);
}

async function _loadSupportCentre(el, tabs, ticketFilter) {
  try {
    const tickets = await fetchCRMSupportTickets();

    const openCount = tickets.filter(t => (t.status || '').toLowerCase() === 'open').length;
    const inProgressCount = tickets.filter(t => (t.status || '').toLowerCase() === 'in_progress').length;
    const resolvedCount = tickets.filter(t => (t.status || '').toLowerCase() === 'resolved').length;
    const escalatedCount = tickets.filter(t => (t.status || '').toLowerCase() === 'escalated').length;

    const avgResolution = tickets.length > 0
      ? fmtDuration(tickets.reduce((sum, t) => sum + (t.resolution_ms || 0), 0) / tickets.filter(t => t.resolution_ms).length)
      : '—';
    const escalationRate = tickets.length > 0 ? `${((escalatedCount / tickets.length) * 100).toFixed(1)}%` : '—';

    const filterButtons = [
      ['open', 'Open', openCount],
      ['in_progress', 'In Progress', inProgressCount],
      ['resolved', 'Resolved', resolvedCount],
      ['escalated', 'Escalated', escalatedCount],
    ].map(([key, label, count]) => {
      const isActive = ticketFilter === key;
      return `<a href="?page=crm/support&ticket_status=${esc(key)}" style="padding:6px 12px;font-size:11px;font-weight:${isActive ? 600 : 500};color:${isActive ? 'var(--teal)' : 'var(--text-secondary)'};background:${isActive ? 'rgba(0,212,188,0.08)' : 'transparent'};border-radius:6px;text-decoration:none;white-space:nowrap" data-test="ticket-filter-${esc(key)}">${esc(label)} (${count})</a>`;
    }).join('');

    const filtered = ticketFilter === 'all'
      ? tickets
      : tickets.filter(t => (t.status || '').toLowerCase() === ticketFilter);

    const headers = [
      { label: 'Priority' }, { label: 'Status' }, { label: 'Subject' },
      { label: 'Clinic' }, { label: 'Assignee' }, { label: 'Created' },
      { label: 'Actions' },
    ];
    const rows = filtered.map(t => [
      statusBadge(t.priority || 'normal'),
      statusBadge(t.status || 'open'),
      `<div style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(t.subject || '')}">${esc(t.subject || '—')}</div>`,
      esc(t.clinic_name || t.clinic_id || '—'),
      esc(t.assignee || 'Unassigned'),
      fmtDate(t.created_at),
      `<a href="?page=crm/support&ticket=${esc(t.id || '')}" style="font-size:11px;color:var(--teal);text-decoration:none" data-test="ticket-view-${esc(t.id || '')}">View</a>`,
    ]);

    el.innerHTML = crmShell(`
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px" data-test="support-stats">
        ${kpiCard('Open', openCount, { color: openCount > 0 ? 'var(--amber)' : 'var(--text-primary)', testId: 'support-open' })}
        ${kpiCard('Avg Resolution', avgResolution, { color: 'var(--blue)', testId: 'support-avg-resolution' })}
        ${kpiCard('Escalation Rate', escalationRate, { color: escalatedCount > 0 ? 'var(--red)' : 'var(--green)', testId: 'support-escalation-rate' })}
        ${kpiCard('Escalated', escalatedCount, { color: 'var(--red)', testId: 'support-escalated' })}
      </div>

      <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap" data-test="ticket-filters">
        ${filterButtons}
      </div>

      <div class="ch-card" data-test="ticket-inbox">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Ticket Inbox (${filtered.length})</div>
        ${dataTable(headers, rows, { testId: 'ticket-table', emptyText: 'No tickets match the current filter.' })}
      </div>
    `, { title: 'Support Centre', subtitle: `${tickets.length} total tickets`, tabs });
  } catch (err) {
    el.innerHTML = crmShell(
      errorState(`Failed to load support centre: ${err.message}`),
      { title: 'Support Centre', tabs }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 6 — PLATFORM OPS
// ═══════════════════════════════════════════════════════════════════════════════

function _renderPlatformOps(setTopbar, api) {
  setTopbar('Platform Ops', '');
  const el = document.getElementById('content');
  if (!el) return;

  const tabs = crmTabs([
    ['crm/dashboard', 'Dashboard'],
    ['crm/clinics', 'Clinics'],
    ['crm/ai-ops', 'AI Ops'],
    ['crm/support', 'Support'],
    ['crm/ops', 'Platform'],
    ['crm/compliance', 'Compliance'],
    ['crm/finance', 'Finance'],
    ['crm/research', 'Research'],
  ], '/crm/ops');

  el.innerHTML = spinner('Loading platform ops...');
  _loadPlatformOps(el, tabs);
}

async function _loadPlatformOps(el, tabs) {
  try {
    const data = await fetchCRMPlatformStatus();

    if (!data) {
      el.innerHTML = crmShell(
        errorState('Platform status data is unavailable. The API endpoint may not be deployed yet.'),
        { title: 'Platform Ops', subtitle: 'Infrastructure health and metrics', tabs }
      );
      return;
    }

    const services = [
      { key: 'api', label: 'API Gateway' },
      { key: 'database', label: 'Database' },
      { key: 'queue', label: 'Job Queue' },
      { key: 'storage', label: 'Object Storage' },
      { key: 'evidence_db', label: 'Evidence DB' },
      { key: 'mri_pipeline', label: 'MRI Pipeline' },
      { key: 'qeeg_pipeline', label: 'qEEG Pipeline' },
    ];

    const statusGrid = services.map(s => {
      const svc = data.services?.[s.key] || data[s.key] || {};
      const health = svc.status || svc.health || 'unknown';
      const uptime = svc.uptime_pct || '—';
      const latency = svc.latency_ms || svc.latency || '—';
      const color = health === 'healthy' ? 'var(--green)' : health === 'degraded' ? 'var(--amber)' : health === 'down' ? 'var(--red)' : 'var(--text-tertiary)';
      return `
        <div class="ch-card" style="padding:14px 16px;display:flex;flex-direction:column;gap:6px" data-test="service-status-${esc(s.key)}">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:12px;font-weight:600;color:var(--text-primary)">${esc(s.label)}</span>
            ${healthDot(health, { size: 10 })}
          </div>
          <div style="font-size:11px;color:var(--text-secondary)">Status: <strong style="color:${color};text-transform:capitalize">${esc(health)}</strong></div>
          <div style="font-size:10px;color:var(--text-tertiary)">Uptime: ${esc(String(uptime))}${typeof uptime === 'number' ? '%' : ''} · Latency: ${esc(String(latency))}ms</div>
        </div>
      `;
    }).join('');

    const kpis = [
      kpiCard('Uptime', `${data.overall_uptime_pct ?? '—'}%`, { color: (data.overall_uptime_pct || 0) >= 99.9 ? 'var(--green)' : 'var(--amber)', testId: 'ops-uptime' }),
      kpiCard('Requests/min', fmtNumber(data.requests_per_min), { color: 'var(--blue)', testId: 'ops-rpm' }),
      kpiCard('Avg Latency', `${data.avg_latency_ms ?? '—'}ms`, { color: (data.avg_latency_ms || 0) < 200 ? 'var(--green)' : 'var(--amber)', testId: 'ops-latency' }),
      kpiCard('Error Rate', `${data.error_rate_pct ?? '—'}%`, { color: (data.error_rate_pct || 0) < 1 ? 'var(--green)' : 'var(--red)', testId: 'ops-error-rate' }),
    ];

    const queueBars = (data.queue_depth_history || []).map(q => ({
      label: q.time || q.period || '',
      value: q.depth || 0,
      color: (q.depth || 0) > 100 ? 'var(--red)' : (q.depth || 0) > 50 ? 'var(--amber)' : 'var(--green)',
    }));

    const storageGauge = data.storage?.used != null && data.storage?.total != null
      ? cssGauge(data.storage.used, data.storage.total, { label: `${((data.storage.used / data.storage.total) * 100).toFixed(1)}% used`, color: (data.storage.used / data.storage.total) > 0.85 ? 'var(--red)' : 'var(--teal)' })
      : emptyState('💾', 'No storage data', 'Storage metrics will appear here.');

    const alerts = data.recent_alerts || [];
    const alertFeed = alerts.slice(0, 15).map((a, i) => `
      <div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid ${i < alerts.length - 1 ? 'var(--border)' : 'transparent'}" data-test="ops-alert-item">
        ${healthDot(a.severity || 'warning', { size: 8 })}
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;color:var(--text-primary);font-weight:500">${esc(a.message || a.title || '—')}</div>
          <div style="font-size:10px;color:var(--text-tertiary)">${esc(a.service || '—')} · ${fmtDate(a.timestamp || a.created_at)}</div>
        </div>
      </div>
    `).join('') || '<div style="padding:12px;color:var(--text-tertiary);font-size:11px">No recent alerts</div>';

    el.innerHTML = crmShell(`
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px" data-test="ops-kpis">
        ${kpis.join('')}
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:12px;margin-bottom:16px" data-test="service-status-grid">
        ${statusGrid}
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:16px;margin-bottom:16px">
        <div class="ch-card" data-test="ops-queue-chart">
          <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Queue Depth</div>
          ${queueBars.length > 0 ? cssBarChart(queueBars, { height: 160 }) : emptyState('📊', 'No queue data', 'Queue depth history will appear here.')}
        </div>
        <div class="ch-card" data-test="ops-storage-gauge">
          <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Storage Usage</div>
          <div style="padding:16px;display:flex;justify-content:center">${storageGauge}</div>
        </div>
      </div>

      <div class="ch-card" data-test="ops-alerts-feed">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Recent Alerts (${alerts.length})</div>
        <div style="padding:8px 14px;max-height:400px;overflow-y:auto">${alertFeed}</div>
      </div>
    `, { title: 'Platform Ops', subtitle: 'Infrastructure health and metrics', tabs });
  } catch (err) {
    el.innerHTML = crmShell(
      errorState(`Failed to load platform ops: ${err.message}`),
      { title: 'Platform Ops', subtitle: 'Infrastructure health and metrics', tabs }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 7 — COMPLIANCE DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

function _renderComplianceDashboard(setTopbar, api) {
  setTopbar('Compliance Dashboard', '');
  const el = document.getElementById('content');
  if (!el) return;

  const tabs = crmTabs([
    ['crm/dashboard', 'Dashboard'],
    ['crm/clinics', 'Clinics'],
    ['crm/ai-ops', 'AI Ops'],
    ['crm/support', 'Support'],
    ['crm/ops', 'Platform'],
    ['crm/compliance', 'Compliance'],
    ['crm/finance', 'Finance'],
    ['crm/research', 'Research'],
  ], '/crm/compliance');

  el.innerHTML = spinner('Loading compliance dashboard...');
  _loadComplianceDashboard(el, tabs);
}

async function _loadComplianceDashboard(el, tabs) {
  try {
    const data = await fetchCRMCompliance();

    if (!data) {
      el.innerHTML = crmShell(
        errorState('Compliance data is unavailable. The API endpoint may not be deployed yet.'),
        { title: 'Compliance Dashboard', subtitle: 'PHI access, audit, and violations', tabs }
      );
      return;
    }

    const kpis = [
      kpiCard('PHI Alerts', fmtNumber(data.phi_alert_count || 0), { color: (data.phi_alert_count || 0) > 0 ? 'var(--red)' : 'var(--green)', testId: 'comp-phi-alerts' }),
      kpiCard('Suspicious Activity', fmtNumber(data.suspicious_activity_count || 0), { color: (data.suspicious_activity_count || 0) > 0 ? 'var(--red)' : 'var(--green)', testId: 'comp-suspicious' }),
      kpiCard('Cross-Clinic Violations', fmtNumber(data.cross_clinic_violations || 0), { color: (data.cross_clinic_violations || 0) > 0 ? 'var(--red)' : 'var(--green)', testId: 'comp-violations' }),
      kpiCard('Consent Issues', fmtNumber(data.consent_issue_count || 0), { color: (data.consent_issue_count || 0) > 0 ? 'var(--amber)' : 'var(--green)', testId: 'comp-consent-issues' }),
    ];

    const phiHeatmap = _renderPHIHeatmap(data.phi_access_heatmap);

    const suspiciousRows = (data.suspicious_activity || []).slice(0, 20).map(a => `
      <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)" data-test="suspicious-activity-item">
        <div style="font-size:11px;flex:1">
          <div style="font-weight:600;color:var(--text-primary)">${esc(a.description || a.type || '—')}</div>
          <div style="color:var(--text-tertiary);margin-top:1px">${esc(a.actor || '—')} · ${esc(a.clinic || '—')}</div>
        </div>
        <div style="font-size:10px;color:var(--text-tertiary);white-space:nowrap">${fmtDate(a.timestamp)}</div>
      </div>
    `).join('') || '<div style="padding:12px;color:var(--text-tertiary);font-size:11px">No suspicious activity detected</div>';

    const exportLogHeaders = [
      { label: 'Time' }, { label: 'Actor' }, { label: 'Type' },
      { label: 'Scope' }, { label: 'Records' }, { label: 'Status' },
    ];
    const exportLogRows = (data.export_activity || []).map(e => [
      fmtDate(e.timestamp),
      esc(e.actor || '—'),
      esc(e.type || '—'),
      esc(e.scope || '—'),
      fmtNumber(e.record_count),
      statusBadge(e.status || 'complete'),
    ]);

    const failedAuth = (data.failed_auth_attempts || []);
    const failedAuthBars = failedAuth.slice(0, 24).map((f, i) => ({
      label: f.hour || String(i),
      value: f.count || 0,
      color: (f.count || 0) > 10 ? 'var(--red)' : 'var(--amber)',
    }));

    const auditIntegrity = data.audit_log_integrity || {};
    const integrityStatus = auditIntegrity.verified
      ? `<div style="display:flex;align-items:center;gap:8px;font-size:12px"><span style="font-size:16px">✅</span> <strong style="color:var(--green)">Audit log integrity verified</strong> · ${esc(auditIntegrity.algorithm || 'SHA-256')} · Last check: ${fmtDate(auditIntegrity.last_check)}</div>`
      : `<div style="display:flex;align-items:center;gap:8px;font-size:12px"><span style="font-size:16px">⚠️</span> <strong style="color:var(--amber)">Audit log integrity not verified</strong></div>`;

    el.innerHTML = crmShell(`
      ${breakGlassPanel('Compliance data includes PHI access patterns and audit logs.')}

      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px" data-test="compliance-kpis">
        ${kpis.join('')}
      </div>

      <div class="ch-card" style="margin-bottom:16px" data-test="phi-heatmap">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">PHI Access Heatmap (Clinic × Time)</div>
        <div style="padding:14px">
          ${phiHeatmap}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:16px;margin-bottom:16px">
        <div class="ch-card" data-test="suspicious-activity">
          <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Suspicious Activity Alerts</div>
          <div style="padding:8px 14px;max-height:300px;overflow-y:auto">${suspiciousRows}</div>
        </div>
        <div class="ch-card" data-test="failed-auth-chart">
          <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Failed Auth Attempts (24h)</div>
          ${failedAuthBars.length > 0 ? cssBarChart(failedAuthBars, { height: 160, barColor: 'var(--red)' }) : emptyState('🔐', 'No failed auth data', 'Failed authentication attempts will appear here.')}
        </div>
      </div>

      <div class="ch-card" style="margin-bottom:16px" data-test="export-log-table">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Export Activity Log</div>
        ${dataTable(exportLogHeaders, exportLogRows, { testId: 'export-log', emptyText: 'No export activity recorded.' })}
      </div>

      <div class="ch-card" data-test="audit-integrity">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Audit Log Integrity</div>
        <div style="padding:14px">
          ${integrityStatus}
          ${auditIntegrity.chain_length ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:6px">Chain length: ${fmtNumber(auditIntegrity.chain_length)} entries · Hash: <code style="font-size:10px">${esc(auditIntegrity.latest_hash?.slice(0, 16) || '—')}...</code></div>` : ''}
        </div>
      </div>
    `, { title: 'Compliance Dashboard', subtitle: 'PHI access, audit, and violations', tabs });
  } catch (err) {
    el.innerHTML = crmShell(
      errorState(`Failed to load compliance dashboard: ${err.message}`),
      { title: 'Compliance Dashboard', subtitle: 'PHI access, audit, and violations', tabs }
    );
  }
}

function _renderPHIHeatmap(heatmapData) {
  if (!heatmapData || !heatmapData.rows || heatmapData.rows.length === 0) {
    return emptyState('🔥', 'No PHI access data', 'PHI access patterns will appear here as clinics access patient data.');
  }
  const rows = heatmapData.rows;
  const columns = heatmapData.columns || [];
  const maxValue = Math.max(...rows.flatMap(r => r.values || []), 1);

  const headerRow = `<div style="display:flex;gap:2px;margin-bottom:2px">
    <div style="width:100px;flex-shrink:0"></div>
    ${columns.map(c => `<div style="flex:1;font-size:9px;color:var(--text-tertiary);text-align:center;transform:rotate(-45deg);transform-origin:center;white-space:nowrap;height:40px;display:flex;align-items:flex-end;justify-content:center">${esc(c)}</div>`).join('')}
  </div>`;

  const dataRows = rows.map(r => `
    <div style="display:flex;gap:2px;margin-bottom:2px;align-items:center">
      <div style="width:100px;flex-shrink:0;font-size:10px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(r.clinic_name || r.clinic_id || '')}">${esc(r.clinic_name || r.clinic_id || '—')}</div>
      ${(r.values || []).map(v => {
        const intensity = (v || 0) / maxValue;
        const bg = intensity > 0.7 ? 'rgba(239,68,68,0.7)' : intensity > 0.4 ? 'rgba(245,158,11,0.6)' : intensity > 0.1 ? 'rgba(0,212,188,0.4)' : 'rgba(148,163,184,0.12)';
        return `<div style="flex:1;height:20px;background:${bg};border-radius:2px;position:relative" title="${fmtNumber(v || 0)} accesses">
          ${v > 0 ? `<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:9px;color:${intensity > 0.4 ? '#fff' : 'var(--text-secondary)'};font-weight:600">${v > 99 ? '99+' : (v || '')}</span>` : ''}
        </div>`;
      }).join('')}
    </div>
  `).join('');

  return `<div style="overflow-x:auto;padding:4px 0">${headerRow}${dataRows}</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 8 — FINANCE DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

function _renderFinanceDashboard(setTopbar, api) {
  setTopbar('Finance Dashboard', '');
  const el = document.getElementById('content');
  if (!el) return;

  const tabs = crmTabs([
    ['crm/dashboard', 'Dashboard'],
    ['crm/clinics', 'Clinics'],
    ['crm/ai-ops', 'AI Ops'],
    ['crm/support', 'Support'],
    ['crm/ops', 'Platform'],
    ['crm/compliance', 'Compliance'],
    ['crm/finance', 'Finance'],
    ['crm/research', 'Research'],
  ], '/crm/finance');

  el.innerHTML = spinner('Loading finance dashboard...');
  _loadFinanceDashboard(el, tabs);
}

async function _loadFinanceDashboard(el, tabs) {
  try {
    const data = await fetchCRMFinance();

    if (!data) {
      el.innerHTML = crmShell(
        errorState('Finance data is unavailable. The API endpoint may not be deployed yet.'),
        { title: 'Finance Dashboard', subtitle: 'Revenue, subscriptions, and costs', tabs }
      );
      return;
    }

    const kpis = [
      kpiCard('MRR', fmtCurrency(data.mrr), { subtitle: 'Monthly Recurring Revenue', trend: data.mrr_trend || '', color: 'var(--teal)', testId: 'fin-mrr' }),
      kpiCard('ARR', fmtCurrency(data.arr), { subtitle: 'Annual Recurring Revenue', trend: data.arr_trend || '', color: 'var(--teal)', testId: 'fin-arr' }),
      kpiCard('Total Invoiced', fmtCurrency(data.total_invoiced_ytd), { subtitle: 'Year to date', color: 'var(--blue)', testId: 'fin-invoiced' }),
      kpiCard('Outstanding', fmtCurrency(data.outstanding_balance), { color: (data.outstanding_balance || 0) > 0 ? 'var(--red)' : 'var(--text-primary)', testId: 'fin-outstanding' }),
    ];

    const revenueBars = (data.revenue_by_clinic || []).map(r => ({
      label: r.clinic_name || r.clinic_id || '',
      value: r.revenue || r.mrr || 0,
      color: 'var(--teal)',
    }));

    const planDist = (data.plan_distribution || []).map(p => ({
      label: p.plan || '',
      value: p.count || 0,
      color: 'var(--blue)',
    }));

    const failedPayments = data.failed_payments || [];
    const failedHeaders = [
      { label: 'Date' }, { label: 'Clinic' }, { label: 'Amount' },
      { label: 'Reason' }, { label: 'Attempts' },
    ];
    const failedRows = failedPayments.map(p => [
      fmtDate(p.date || p.created_at),
      esc(p.clinic_name || p.clinic_id || '—'),
      fmtCurrency(p.amount),
      esc(p.reason || '—'),
      fmtNumber(p.attempts || 1),
    ]);

    const invoiceHeaders = [
      { label: 'Invoice #' }, { label: 'Clinic' }, { label: 'Amount' },
      { label: 'Status' }, { label: 'Date' }, { label: 'Due' },
    ];
    const invoiceRows = (data.invoices || []).map(inv => [
      `<code style="font-size:10px">${esc(inv.id || '—')}</code>`,
      esc(inv.clinic_name || inv.clinic_id || '—'),
      fmtCurrency(inv.amount),
      statusBadge(inv.status),
      fmtDate(inv.date || inv.created_at),
      fmtDate(inv.due_date),
    ]);

    const costBars = (data.cost_breakdown || []).map(c => ({
      label: c.category || '',
      value: c.amount || 0,
      color: c.category === 'infrastructure' ? 'var(--blue)' : c.category === 'ai' ? 'var(--green)' : c.category === 'storage' ? 'var(--amber)' : 'var(--purple)',
    }));

    el.innerHTML = crmShell(`
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px" data-test="finance-kpis">
        ${kpis.join('')}
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:16px;margin-bottom:16px">
        <div class="ch-card" data-test="fin-revenue-chart">
          <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Revenue by Clinic</div>
          ${revenueBars.length > 0 ? cssBarChart(revenueBars, { height: 180 }) : emptyState('💰', 'No revenue data', 'Clinic revenue breakdown will appear here.')}
        </div>
        <div class="ch-card" data-test="fin-plan-dist">
          <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Subscription Plans</div>
          ${planDist.length > 0 ? cssBarChart(planDist, { height: 180, barColor: 'var(--blue)' }) : emptyState('📊', 'No plan data', 'Plan distribution will appear here.')}
        </div>
      </div>

      <div class="ch-card" style="margin-bottom:16px" data-test="fin-failed-payments">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Failed Payments (${failedPayments.length})</div>
        ${dataTable(failedHeaders, failedRows, { testId: 'fin-failed', emptyText: 'No failed payments. All payments are processing normally.' })}
      </div>

      <div class="ch-card" style="margin-bottom:16px" data-test="fin-invoice-table">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Invoice History</div>
        ${dataTable(invoiceHeaders, invoiceRows, { testId: 'fin-invoices', emptyText: 'No invoice history available.' })}
      </div>

      <div class="ch-card" data-test="fin-cost-breakdown">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Cost Breakdown</div>
        ${costBars.length > 0 ? cssBarChart(costBars, { height: 180 }) : emptyState('💸', 'No cost data', 'Infrastructure cost breakdown will appear here.')}
      </div>
    `, { title: 'Finance Dashboard', subtitle: 'Revenue, subscriptions, and costs', tabs });
  } catch (err) {
    el.innerHTML = crmShell(
      errorState(`Failed to load finance dashboard: ${err.message}`),
      { title: 'Finance Dashboard', subtitle: 'Revenue, subscriptions, and costs', tabs }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 9 — RESEARCH ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════════

function _renderResearchAnalytics(setTopbar, api) {
  setTopbar('Research Analytics', '');
  const el = document.getElementById('content');
  if (!el) return;

  const tabs = crmTabs([
    ['crm/dashboard', 'Dashboard'],
    ['crm/clinics', 'Clinics'],
    ['crm/ai-ops', 'AI Ops'],
    ['crm/support', 'Support'],
    ['crm/ops', 'Platform'],
    ['crm/compliance', 'Compliance'],
    ['crm/finance', 'Finance'],
    ['crm/research', 'Research'],
  ], '/crm/research');

  el.innerHTML = spinner('Loading research analytics...');
  _loadResearchAnalytics(el, tabs);
}

async function _loadResearchAnalytics(el, tabs) {
  try {
    const data = await fetchCRMResearch();

    if (!data) {
      el.innerHTML = crmShell(
        errorState('Research analytics data is unavailable. The API endpoint may not be deployed yet.'),
        { title: 'Research Analytics', subtitle: 'Evidence DB and research usage metrics', tabs }
      );
      return;
    }

    const kpis = [
      kpiCard('Evidence DB Size', fmtNumber(data.evidence_db_papers), { subtitle: 'Total papers indexed', color: 'var(--purple)', testId: 'res-evidence-size' }),
      kpiCard('Searches Today', fmtNumber(data.searches_today), { subtitle: `This week: ${fmtNumber(data.searches_week)}`, color: 'var(--blue)', testId: 'res-searches' }),
      kpiCard('Papers Ingested', fmtNumber(data.papers_ingested_this_month), { subtitle: 'This month', color: 'var(--teal)', testId: 'res-ingested' }),
      kpiCard('Citation Updates', fmtNumber(data.citation_updates_this_month), { subtitle: 'This month', color: 'var(--green)', testId: 'res-citations' }),
    ];

    const evidenceBars = (data.evidence_usage_by_clinic || []).map(u => ({
      label: u.clinic_name || u.clinic_id || '',
      value: u.queries || u.count || 0,
      color: 'var(--purple)',
    }));

    const searchTrendPoints = (data.search_volume_series || []).map(s => ({
      label: s.period || s.date || '',
      value: s.count || 0,
    }));

    const ingestionPoints = (data.paper_ingestion_series || []).map(s => ({
      label: s.period || s.date || '',
      value: s.count || 0,
    }));

    const biomarkerBars = (data.biomarker_evidence_usage || []).map(b => ({
      label: b.biomarker || b.category || '',
      value: b.queries || b.count || 0,
      color: 'var(--teal)',
    }));

    const protocolBars = (data.protocol_evidence_usage || []).map(p => ({
      label: p.protocol || p.category || '',
      value: p.queries || p.count || 0,
      color: 'var(--blue)',
    }));

    el.innerHTML = crmShell(`
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px" data-test="research-kpis">
        ${kpis.join('')}
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:16px;margin-bottom:16px">
        <div class="ch-card" data-test="res-evidence-usage">
          <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Evidence DB Usage by Clinic</div>
          ${evidenceBars.length > 0 ? cssBarChart(evidenceBars, { height: 180 }) : emptyState('📚', 'No usage data', 'Evidence DB usage by clinic will appear here.')}
        </div>
        <div class="ch-card" data-test="res-search-trend">
          <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Search Query Volume</div>
          ${searchTrendPoints.length > 0 ? cssLineChart(searchTrendPoints, { height: 180, lineColor: 'var(--blue)' }) : emptyState('🔍', 'No search data', 'Search volume trends will appear here.')}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:16px;margin-bottom:16px">
        <div class="ch-card" data-test="res-ingestion-rate">
          <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Paper Ingestion Rate</div>
          ${ingestionPoints.length > 0 ? cssLineChart(ingestionPoints, { height: 180, lineColor: 'var(--teal)' }) : emptyState('📄', 'No ingestion data', 'Paper ingestion trends will appear here.')}
        </div>
        <div class="ch-card" data-test="res-citation-freq">
          <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Citation Update Frequency</div>
          ${data.citation_update_series?.length > 0
            ? cssLineChart(data.citation_update_series.map(s => ({ label: s.period || '', value: s.count || 0 })), { height: 180, lineColor: 'var(--green)' })
            : emptyState('📎', 'No citation data', 'Citation update trends will appear here.')}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:16px">
        <div class="ch-card" data-test="res-protocol-usage">
          <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Protocol Evidence Usage</div>
          ${protocolBars.length > 0 ? cssBarChart(protocolBars, { height: 180 }) : emptyState('📋', 'No protocol data', 'Protocol evidence usage will appear here.')}
        </div>
        <div class="ch-card" data-test="res-biomarker-usage">
          <div style="font-size:12px;font-weight:700;color:var(--text-primary);padding:12px 14px;border-bottom:1px solid var(--border)">Biomarker Evidence Usage</div>
          ${biomarkerBars.length > 0 ? cssBarChart(biomarkerBars, { height: 180, barColor: 'var(--teal)' }) : emptyState('🧬', 'No biomarker data', 'Biomarker evidence usage will appear here.')}
        </div>
      </div>
    `, { title: 'Research Analytics', subtitle: 'Evidence DB and research usage metrics', tabs });
  } catch (err) {
    el.innerHTML = crmShell(
      errorState(`Failed to load research analytics: ${err.message}`),
      { title: 'Research Analytics', subtitle: 'Evidence DB and research usage metrics', tabs }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNAUTHORIZED FALLBACK
// ═══════════════════════════════════════════════════════════════════════════════

function _renderCRMUnauthorized(setTopbar) {
  setTopbar('CRM', 'Restricted');
  const el = document.getElementById('content');
  if (!el) return;

  el.innerHTML = `
    <div style="padding:48px 24px;max-width:600px;margin:0 auto" data-test="crm-unauthorized">
      <div class="ch-card" style="padding:24px 28px;border-left:3px solid var(--amber)">
        <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:10px">🔒 Super-Admin Access Required</div>
        <p style="font-size:12.5px;color:var(--text-secondary);line-height:1.6;margin:0 0 12px">
          The CRM dashboard is restricted to admin and supervisor roles only.
          This workspace contains sensitive platform data including revenue, PHI access patterns, and clinic-level analytics.
        </p>
        <p style="font-size:11.5px;color:var(--text-tertiary);line-height:1.55;margin:0 0 16px">
          Your current role does not have permission to access this area.
          Contact your platform administrator if you require CRM access.
        </p>
        <button type="button" class="btn btn-primary" style="font-size:12px" onclick="window._nav('dashboard')">Go to Dashboard</button>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BREAK-GLASS HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

function _enableBreakGlass() {
  _breakGlassActive = true;
  const panels = document.querySelectorAll('[data-break-glass-content]');
  panels.forEach(p => {
    p.style.display = '';
  });
  const gates = document.querySelectorAll('[data-test="break-glass-panel"]');
  gates.forEach(g => {
    g.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--red)">
        <span>🔓</span>
        <strong>Break-glass mode active</strong> — PHI is visible. All access is being audited.
      </div>`;
  });
  console.warn('[CRM] Break-glass mode enabled. PHI access logged.');
}

window.__crmEnableBreakGlass = _enableBreakGlass;
window.__crmRefresh = () => {
  const params = new URLSearchParams(window.location.search);
  const page = params.get('page') || 'crm/dashboard';
  window._nav(page);
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY
// ═══════════════════════════════════════════════════════════════════════════════

export function renderPage({ route, params, query, ctx, api }) {
  const setTopbar = ctx.setTopbar || (() => {});
  const nav = ctx.nav || { currentUser: null };

  // Super-admin gate
  const role = nav.currentUser?.role;
  if (role !== 'admin' && role !== 'supervisor') {
    return _renderCRMUnauthorized(setTopbar);
  }

  // Route dispatch
  if (route === '/crm' || route === '/crm/dashboard') {
    return _renderCRMDashboard(setTopbar, api);
  }
  if (route === '/crm/clinics') {
    return _renderClinicDirectory(setTopbar, api, query);
  }
  if (route === '/crm/clinics/:clinicId') {
    return _renderClinicDetail(setTopbar, api, params);
  }
  if (route === '/crm/ai-ops') {
    return _renderAIOpsDashboard(setTopbar, api);
  }
  if (route === '/crm/support') {
    return _renderSupportCentre(setTopbar, api);
  }
  if (route === '/crm/ops') {
    return _renderPlatformOps(setTopbar, api);
  }
  if (route === '/crm/compliance') {
    return _renderComplianceDashboard(setTopbar, api);
  }
  if (route === '/crm/finance') {
    return _renderFinanceDashboard(setTopbar, api);
  }
  if (route === '/crm/research') {
    return _renderResearchAnalytics(setTopbar, api);
  }

  // Default fallback
  return _renderCRMDashboard(setTopbar, api);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST API — exposes all views for testing
// ═══════════════════════════════════════════════════════════════════════════════

export const __crmTestApi__ = {
  renderPage,
  helpers: {
    esc,
    fmtDate,
    fmtDateOnly,
    fmtNumber,
    fmtCurrency,
    fmtDuration,
    statusBadge,
    healthDot,
    kpiCard,
    spinner,
    emptyState,
    errorState,
    cssBarChart,
    cssLineChart,
    cssGauge,
    crmShell,
    crmTabs,
    dataTable,
    renderActivityFeed,
    breakGlassPanel,
    activityIcon,
    _renderPHIHeatmap,
  },
  views: {
    _renderCRMDashboard,
    _renderClinicDirectory,
    _renderClinicDetail,
    _renderAIOpsDashboard,
    _renderSupportCentre,
    _renderPlatformOps,
    _renderComplianceDashboard,
    _renderFinanceDashboard,
    _renderResearchAnalytics,
    _renderCRMUnauthorized,
  },
  state: {
    get breakGlassActive() { return _breakGlassActive; },
    set breakGlassActive(v) { _breakGlassActive = v; },
  },
  internals: {
    _loadDashboard,
    _loadClinicDirectory,
    _loadClinicDetail,
    _loadAIOpsDashboard,
    _loadSupportCentre,
    _loadPlatformOps,
    _loadComplianceDashboard,
    _loadFinanceDashboard,
    _loadResearchAnalytics,
    _enableBreakGlass,
    _clinicOverviewTab,
    _clinicAnalyticsTab,
    _clinicUsersTab,
    _clinicAIUsageTab,
    _clinicTicketsTab,
    _clinicAuditTab,
    _clinicBillingTab,
    fetchCRMOverview,
    fetchCRMClinics,
    fetchCRMClinicDetail,
    fetchCRMAIOps,
    fetchCRMSupportTickets,
    fetchCRMPlatformStatus,
    fetchCRMCompliance,
    fetchCRMFinance,
    fetchCRMResearch,
    fetchCRMActivity,
  },
};
