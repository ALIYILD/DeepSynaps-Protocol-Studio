import { api } from './api.js';

/* ── Helpers ───────────────────────────────────────────────────────────────── */
function esc(v) { return v == null ? '' : String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtNum(n, d = 1) { return n == null ? '—' : Number(n).toFixed(d); }
function fmtInt(n) { return n == null ? '—' : Math.round(n).toLocaleString(); }
function fmtDate(iso) { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function fmtDateTime(iso) { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function fmtAgo(iso) {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60000) return 'just now';
  if (ms < 3600000) return Math.floor(ms / 60000) + 'm ago';
  if (ms < 86400000) return Math.floor(ms / 3600000) + 'h ago';
  return Math.floor(ms / 86400000) + 'd ago';
}

function _isDemoMode() {
  try { return !!(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1'); } catch { return false; }
}

/* ── Provider metadata ─────────────────────────────────────────────────────── */
const PROVIDER_META = {
  apple_healthkit:  { label: 'Apple Health',          icon: '\uD83C\uDF4F', color: '#30d158' },
  google_health:    { label: 'Google Health Connect',  icon: '\uD83E\uDD16', color: '#4285f4' },
  fitbit:           { label: 'Fitbit',                 icon: '\u231A',       color: '#00b0b9' },
  garmin_connect:   { label: 'Garmin Connect',         icon: '\uD83C\uDFD4\uFE0F', color: '#007cc3' },
  oura_ring:        { label: 'Oura Ring',              icon: '\uD83D\uDCAD', color: '#c4b5fd' },
  whoop:            { label: 'WHOOP',                  icon: '\uD83D\uDCAA', color: '#e63946' },
};

function providerMeta(src) {
  return PROVIDER_META[src] || { label: src, icon: '\u2699\uFE0F', color: '#64748b' };
}

/* ── SVG sparkline (matches codebase pattern) ──────────────────────────────── */
function sparklineSVG(values, { w = 220, h = 48, color = '#4cc9f0', label = '' } = {}) {
  if (!values || values.length < 2) return `<div class="dd-spark-empty">No data</div>`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg class="dd-sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>${label ? `<span class="dd-spark-label">${esc(label)}</span>` : ''}`;
}

/* ── Bar chart SVG ─────────────────────────────────────────────────────────── */
function barChartSVG(data, { w = 400, h = 160, color = '#4cc9f0', labelKey = 'date', valueKey = 'value', unit = '' } = {}) {
  if (!data || data.length === 0) return `<div class="dd-chart-empty">No data available</div>`;
  const max = Math.max(...data.map(d => d[valueKey] ?? 0)) || 1;
  const barW = Math.max(6, Math.min(24, (w - 40) / data.length - 2));
  const gap = 2;
  const chartW = data.length * (barW + gap);
  const bars = data.map((d, i) => {
    const val = d[valueKey] ?? 0;
    const barH = Math.max(1, (val / max) * (h - 30));
    const x = i * (barW + gap);
    const y = h - 20 - barH;
    const lbl = d[labelKey] ? fmtDate(d[labelKey]) : '';
    return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="2" fill="${color}" opacity="0.85">
      <title>${lbl}: ${fmtNum(val)} ${unit}</title>
    </rect>`;
  }).join('');
  return `<svg class="dd-barchart" viewBox="0 0 ${chartW} ${h}" preserveAspectRatio="none">${bars}</svg>`;
}

/* ── Line chart SVG ────────────────────────────────────────────────────────── */
function lineChartSVG(series, { w = 500, h = 180, labels = [] } = {}) {
  if (!series || series.length === 0) return `<div class="dd-chart-empty">No data available</div>`;
  const allVals = series.flatMap(s => s.values || []);
  if (allVals.length < 2) return `<div class="dd-chart-empty">Insufficient data</div>`;
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;
  const len = Math.max(...series.map(s => (s.values || []).length));

  const lines = series.map(s => {
    const pts = (s.values || []).map((v, i) => {
      const x = (i / (len - 1)) * w;
      const y = h - 24 - ((v - min) / range) * (h - 32);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${s.color || '#4cc9f0'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');

  // Grid lines
  const gridY = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const y = h - 24 - f * (h - 32);
    const val = min + f * range;
    return `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
      <text x="-4" y="${y + 3}" fill="rgba(255,255,255,0.35)" font-size="9" text-anchor="end">${fmtNum(val, 0)}</text>`;
  }).join('');

  return `<svg class="dd-linechart" viewBox="-30 0 ${w + 30} ${h}" preserveAspectRatio="none">${gridY}${lines}</svg>`;
}

/* ── Demo data generator (client-side fallback) ────────────────────────────── */
function demoDashboardData(connectionId, provider, days) {
  const base = {
    apple_healthkit: { rhr: 62, hrv: 48, sleep: 7.2, steps: 8500, spo2: 97.5, readiness: 78 },
    google_health:   { rhr: 68, hrv: 42, sleep: 6.8, steps: 7200, spo2: 97.0, readiness: 72 },
    fitbit:          { rhr: 65, hrv: 45, sleep: 7.0, steps: 9100, spo2: 97.2, readiness: 75 },
    garmin_connect:  { rhr: 58, hrv: 55, sleep: 7.5, steps: 11000, spo2: 98.0, readiness: 82 },
    oura_ring:       { rhr: 60, hrv: 52, sleep: 7.8, steps: 6000, spo2: 97.8, readiness: 85 },
    whoop:           { rhr: 55, hrv: 58, sleep: 7.1, steps: 7500, spo2: 97.6, readiness: 80 },
  }[provider] || { rhr: 65, hrv: 45, sleep: 7.0, steps: 8000, spo2: 97.0, readiness: 75 };

  const summaries = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const jitter = () => (Math.random() - 0.5) * 0.2;
    summaries.push({
      date: d.toISOString().slice(0, 10),
      rhr_bpm: +(base.rhr * (1 + jitter())).toFixed(1),
      hrv_ms: +(base.hrv * (1 + jitter())).toFixed(1),
      sleep_duration_h: +(base.sleep * (1 + jitter() * 0.5)).toFixed(2),
      steps: Math.round(base.steps * (1 + jitter())),
      spo2_pct: +(base.spo2 * (1 + jitter() * 0.05)).toFixed(1),
      readiness_score: Math.round(base.readiness * (1 + jitter() * 0.3)),
    });
  }

  const syncEvents = [];
  for (let i = 0; i < 10; i++) {
    const t = new Date(now - i * 3600000 * 4);
    syncEvents.push({
      id: `sync-${i}`,
      occurred_at: t.toISOString(),
      event_type: i === 3 ? 'sync_error' : 'sync_success',
      records_synced: i === 3 ? 0 : Math.floor(Math.random() * 50) + 10,
      detail: i === 3 ? 'Rate limit exceeded — retrying in 5m' : null,
    });
  }

  const latest = summaries[summaries.length - 1] || {};
  return {
    _demo: true,
    connection: {
      id: connectionId,
      source: provider,
      display_name: providerMeta(provider).label,
      status: 'active',
      last_sync_at: new Date(now - 1200000).toISOString(),
      patient_id: 'pt-demo-001',
      patient_name: 'James Morrison',
    },
    kpis: {
      rhr_bpm: latest.rhr_bpm,
      hrv_ms: latest.hrv_ms,
      sleep_h: latest.sleep_duration_h,
      steps: latest.steps,
      spo2_pct: latest.spo2_pct,
      readiness: latest.readiness_score,
    },
    summaries,
    sync_events: syncEvents,
    trends: {
      rhr: summaries.map(s => s.rhr_bpm),
      hrv: summaries.map(s => s.hrv_ms),
      sleep: summaries.map(s => s.sleep_duration_h),
      steps: summaries.map(s => s.steps),
    },
  };
}

/* ── State ─────────────────────────────────────────────────────────────────── */
let _state = {};
function state() { return _state; }

/* ── KPI tiles ─────────────────────────────────────────────────────────────── */
function renderKpis(data) {
  const k = data.kpis || {};
  const tiles = [
    { label: 'Resting HR', value: fmtNum(k.rhr_bpm, 0), unit: 'bpm', color: '#ef4444', trend: data.trends?.rhr },
    { label: 'HRV',        value: fmtNum(k.hrv_ms, 0),  unit: 'ms',  color: '#8b5cf6', trend: data.trends?.hrv },
    { label: 'Sleep',      value: fmtNum(k.sleep_h, 1), unit: 'hrs', color: '#3b82f6', trend: data.trends?.sleep },
    { label: 'Steps',      value: fmtInt(k.steps),      unit: '',    color: '#10b981', trend: data.trends?.steps },
    { label: 'SpO2',       value: fmtNum(k.spo2_pct, 1), unit: '%', color: '#f59e0b', trend: null },
    { label: 'Readiness',  value: fmtNum(k.readiness, 0), unit: '/100', color: '#06b6d4', trend: null },
  ];
  return `<section class="dd-kpi-grid">${tiles.map(t =>
    `<article class="dd-kpi-tile">
      <div class="dd-kpi-label">${esc(t.label)}</div>
      <div class="dd-kpi-value" style="color:${t.color}">${t.value}<span class="dd-kpi-unit">${esc(t.unit)}</span></div>
      ${t.trend ? `<div class="dd-kpi-spark">${sparklineSVG(t.trend.slice(-14), { w: 120, h: 32, color: t.color })}</div>` : ''}
    </article>`
  ).join('')}</section>`;
}

/* ── Trend charts ──────────────────────────────────────────────────────────── */
function renderTrendCharts(data) {
  const s = data.summaries || [];
  if (s.length < 2) return '<div class="dd-chart-empty">Insufficient data for trends</div>';

  const charts = [
    {
      title: 'Heart Rate & HRV',
      series: [
        { label: 'Resting HR', values: s.map(d => d.rhr_bpm), color: '#ef4444' },
        { label: 'HRV', values: s.map(d => d.hrv_ms), color: '#8b5cf6' },
      ]
    },
    {
      title: 'Sleep Duration',
      series: [
        { label: 'Sleep', values: s.map(d => d.sleep_duration_h), color: '#3b82f6' },
      ]
    },
    {
      title: 'Daily Steps',
      bars: s.map(d => ({ date: d.date, value: d.steps })),
      color: '#10b981',
      unit: 'steps'
    },
  ];

  return `<section class="dd-charts-grid">${charts.map(c => {
    const inner = c.bars
      ? barChartSVG(c.bars, { color: c.color, unit: c.unit, valueKey: 'value', labelKey: 'date' })
      : lineChartSVG(c.series);
    return `<article class="dd-chart-card">
      <h4 class="dd-chart-title">${esc(c.title)}</h4>
      <div class="dd-chart-body">${inner}</div>
      ${c.series ? `<div class="dd-chart-legend">${c.series.map(s =>
        `<span class="dd-legend-item"><span class="dd-legend-dot" style="background:${s.color}"></span>${esc(s.label)}</span>`
      ).join('')}</div>` : ''}
    </article>`;
  }).join('')}</section>`;
}

/* ── Sync history table ────────────────────────────────────────────────────── */
function renderSyncHistory(data) {
  const events = data.sync_events || [];
  if (events.length === 0) return '<div class="dd-section"><p class="dd-muted">No sync events yet.</p></div>';
  return `<section class="dd-section">
    <h3 class="dd-section-title">Sync History</h3>
    <div class="dd-table-wrap">
      <table class="dd-table">
        <thead><tr><th>Time</th><th>Status</th><th>Records</th><th>Detail</th></tr></thead>
        <tbody>${events.map(e => {
          const isErr = e.event_type?.includes('error') || e.event_type?.includes('fail');
          return `<tr>
            <td>${esc(fmtDateTime(e.occurred_at))}</td>
            <td><span class="dd-badge dd-badge--${isErr ? 'error' : 'ok'}">${isErr ? 'Error' : 'Success'}</span></td>
            <td>${e.records_synced ?? '—'}</td>
            <td class="dd-muted">${esc(e.detail || '—')}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
  </section>`;
}

/* ── Connection info header ────────────────────────────────────────────────── */
function renderConnectionHeader(data) {
  const conn = data.connection || {};
  const meta = providerMeta(conn.source);
  const statusClass = conn.status === 'active' ? 'ok' : conn.status === 'error' ? 'error' : 'warn';
  const isDemo = !!data._demo;
  return `<div class="dd-conn-header">
    <div class="dd-conn-icon" style="color:${meta.color}">${meta.icon}</div>
    <div class="dd-conn-info">
      <h2 class="dd-conn-name">${esc(meta.label)}</h2>
      <div class="dd-conn-meta">
        <span class="dd-badge dd-badge--${isDemo ? 'warn' : statusClass}">${esc(isDemo ? 'demo data' : (conn.status || 'unknown'))}</span>
        <span class="dd-muted">Last sync: ${esc(fmtAgo(conn.last_sync_at))}</span>
        ${conn.patient_name ? `<span class="dd-muted">Patient: <strong>${esc(conn.patient_name)}</strong></span>` : ''}
      </div>
      ${isDemo ? `<div class="dd-muted" style="margin-top:8px;max-width:720px">This dashboard is showing generated sample device data because a live device-sync backend was not available. Sync actions on this page refresh demo data only.</div>` : ''}
    </div>
    <div class="dd-conn-actions">
      <button class="btn btn-sm btn-primary" onclick="window._ddTriggerSync()">${isDemo ? 'Refresh Demo Data' : 'Sync Now'}</button>
      <select class="dd-range-select" onchange="window._ddSetRange(this.value)">
        <option value="7" ${state().days === 7 ? 'selected' : ''}>7 days</option>
        <option value="14" ${state().days === 14 ? 'selected' : ''}>14 days</option>
        <option value="30" ${state().days === 30 ? 'selected' : ''}>30 days</option>
        <option value="90" ${state().days === 90 ? 'selected' : ''}>90 days</option>
      </select>
    </div>
  </div>`;
}

/* ── Daily summaries table ─────────────────────────────────────────────────── */
function renderDailyTable(data) {
  const s = (data.summaries || []).slice().reverse().slice(0, 14);
  if (s.length === 0) return '';
  return `<section class="dd-section">
    <h3 class="dd-section-title">Daily Summaries (last ${s.length} days)</h3>
    <div class="dd-table-wrap">
      <table class="dd-table">
        <thead><tr><th>Date</th><th>RHR</th><th>HRV</th><th>Sleep</th><th>Steps</th><th>SpO2</th><th>Readiness</th></tr></thead>
        <tbody>${s.map(d => `<tr>
          <td>${esc(fmtDate(d.date))}</td>
          <td>${fmtNum(d.rhr_bpm, 0)} bpm</td>
          <td>${fmtNum(d.hrv_ms, 0)} ms</td>
          <td>${fmtNum(d.sleep_duration_h, 1)} h</td>
          <td>${fmtInt(d.steps)}</td>
          <td>${fmtNum(d.spo2_pct, 1)}%</td>
          <td>${fmtNum(d.readiness_score, 0)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
  </section>`;
}

/* ── Main render ───────────────────────────────────────────────────────────── */
function render() {
  const s = state();
  const el = document.getElementById('content');
  if (!el) return;

  if (s.loading) {
    el.innerHTML = `<div class="dd-shell"><div class="dd-loading">Loading device dashboard...</div></div>`;
    return;
  }
  if (s.error) {
    el.innerHTML = `<div class="dd-shell"><div class="dd-error">
      <h3>Failed to load device data</h3>
      <p>${esc(s.error)}</p>
      <button class="btn btn-sm" onclick="window._nav('monitor')">Back to Devices</button>
    </div></div>`;
    return;
  }

  const d = s.data || {};
  el.innerHTML = `<div class="dd-shell">
    <div class="dd-topbar">
      <button class="dd-back-btn" onclick="window._nav('monitor')">\u2190 Back to Devices</button>
    </div>
    ${renderConnectionHeader(d)}
    ${renderKpis(d)}
    ${renderTrendCharts(d)}
    ${renderDailyTable(d)}
    ${renderSyncHistory(d)}
  </div>`;
}

/* ── Data loading ──────────────────────────────────────────────────────────── */
async function loadDashboard() {
  const s = state();
  s.loading = true;
  render();

  try {
    const data = await api.deviceSyncDashboard(s.connectionId, s.days);
    if (data && (data.kpis || data.summaries)) {
      s.data = data;
      s.error = null;
    }
  } catch (err) {
    // API not available — use demo fallback
  }

  if (!s.data && _isDemoMode()) {
    s.data = demoDashboardData(s.connectionId, s.provider, s.days);
  }

  if (!s.data) {
    s.error = 'No data available. Connect the device and sync first.';
  }

  s.loading = false;
  render();
}

/* ── Page entry point ──────────────────────────────────────────────────────── */
export async function pgDeviceDashboard(setTopbar) {
  const connectionId = window._deviceDashConnectionId || 'demo-conn-001';
  const provider = window._deviceDashProvider || 'apple_healthkit';
  const meta = providerMeta(provider);

  setTopbar(`${meta.label} Dashboard`, `<span class="monitor-topbar-pill">${meta.icon} Device</span>`);

  _state = {
    connectionId,
    provider,
    days: 30,
    data: null,
    loading: false,
    error: null,
  };

  render();
  await loadDashboard();

  window._ddTriggerSync = async function() {
    if (state().data?._demo || typeof api.deviceSyncTrigger !== 'function') {
      state().data = null;
      await loadDashboard();
      window._dsToast?.({
        title: 'Demo data refreshed',
        body: 'Live device sync is not available in this environment yet.',
        severity: 'warn'
      });
      return;
    }
    try {
      await api.deviceSyncTrigger(state().connectionId);
    } catch {}
    await loadDashboard();
  };

  window._ddSetRange = function(val) {
    const s = state();
    s.days = parseInt(val, 10) || 30;
    s.data = null;
    loadDashboard();
  };
}
