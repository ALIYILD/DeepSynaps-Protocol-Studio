// ─────────────────────────────────────────────────────────────────────────────
// pages-monitoring.js — Monitoring & System Health Dashboard
// API latency, DB status, evidence pipeline, session feed, usage analytics,
// error log viewer, uptime chart.
// ─────────────────────────────────────────────────────────────────────────────

import { spinner } from './helpers.js';

/* ── Design-v2 tokens (matches pages-brainmap.js pattern) ─────────────────── */
const T = {
  bg:       'var(--dv2-bg-base, var(--bg-base, #04121c))',
  panel:    'var(--dv2-bg-panel, var(--bg-panel, #0a1d29))',
  surface:  'var(--dv2-bg-surface, var(--bg-surface, rgba(255,255,255,0.04)))',
  surface2: 'var(--dv2-bg-surface-2, rgba(255,255,255,0.07))',
  card:     'var(--dv2-bg-card, rgba(14,22,40,0.8))',
  border:   'var(--dv2-border, var(--border, rgba(255,255,255,0.08)))',
  t1:       'var(--dv2-text-primary, var(--text-primary, #e2e8f0))',
  t2:       'var(--dv2-text-secondary, var(--text-secondary, #94a3b8))',
  t3:       'var(--dv2-text-tertiary, var(--text-tertiary, #64748b))',
  teal:     'var(--dv2-teal, var(--teal, #00d4bc))',
  blue:     'var(--dv2-blue, var(--blue, #4a9eff))',
  amber:    'var(--dv2-amber, var(--amber, #ffb547))',
  rose:     'var(--dv2-rose, var(--rose, #ff6b9d))',
  violet:   'var(--dv2-violet, var(--violet, #9b7fff))',
  green:    'var(--green, #22c55e)',
  red:      'var(--red, #ef4444)',
  fdisp:    'var(--dv2-font-display, var(--font-display, "Outfit", system-ui, sans-serif))',
  fbody:    'var(--dv2-font-body, var(--font-body, "DM Sans", system-ui, sans-serif))',
  fmono:    'var(--dv2-font-mono, "JetBrains Mono", ui-monospace, monospace)',
};

/* ── Tiny helpers ─────────────────────────────────────────────────────────── */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const fmt = n => Number(n).toLocaleString();
const ago = ts => {
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60000) return 'just now';
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
};

/* ── SVG sparkline generator ──────────────────────────────────────────────── */
function sparkline(data, color = T.teal, w = 80, h = 24) {
  if (!data || !data.length) return '';
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:${w}px;height:${h}px;flex-shrink:0" preserveAspectRatio="none">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/* ── Gauge arc (semi-circle) ──────────────────────────────────────────────── */
function gaugeArc(value, max, label, unit, thresholds) {
  const pct = Math.min(value / max, 1);
  const color = value <= thresholds[0] ? T.green
    : value <= thresholds[1] ? T.amber : T.red;
  const r = 40, cx = 50, cy = 48;
  const startAngle = Math.PI;
  const endAngle = Math.PI + Math.PI * pct;
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = pct > 0.5 ? 1 : 0;
  return `<div style="text-align:center">
    <svg viewBox="0 0 100 55" style="width:100%;max-width:120px;height:auto">
      <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}"
            fill="none" stroke="${T.border}" stroke-width="6" stroke-linecap="round"/>
      <path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}"
            fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"/>
      <text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="${T.t1}" font-size="14" font-weight="700" font-family="${T.fmono}">${value}${unit}</text>
    </svg>
    <div style="font-size:11px;color:${T.t3};margin-top:-2px">${esc(label)}</div>
  </div>`;
}

/* ── Status dot ───────────────────────────────────────────────────────────── */
function statusDot(status) {
  const color = status === 'healthy' || status === 'connected' || status === 'ok' ? T.green
    : status === 'degraded' || status === 'warning' ? T.amber : T.red;
  return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};box-shadow:0 0 6px ${color};flex-shrink:0"></span>`;
}

/* ── Tab meta ─────────────────────────────────────────────────────────────── */
const TAB_META = {
  overview:  { label: 'Health Overview',   color: T.teal },
  activity:  { label: 'Session Activity',  color: T.blue },
  analytics: { label: 'Usage Analytics',   color: T.violet },
  errors:    { label: 'Error Log',         color: T.rose },
  pipeline:  { label: 'Evidence Pipeline', color: T.amber },
};

/* ── Demo data generators ─────────────────────────────────────────────────── */
function demoHealth() {
  return {
    api_latency_ms: 42 + Math.floor(Math.random() * 30),
    db_status: 'connected',
    db_pool_used: 8,
    db_pool_max: 20,
    evidence_pipeline: 'idle',
    worker_queue_depth: Math.floor(Math.random() * 5),
    uptime_pct: 99.94,
    memory_mb: 412 + Math.floor(Math.random() * 100),
    memory_max_mb: 1024,
    cpu_pct: 12 + Math.floor(Math.random() * 20),
    services: [
      { name: 'API Server',          status: 'healthy',  latency: 42 },
      { name: 'PostgreSQL',          status: 'connected', latency: 3 },
      { name: 'Redis Cache',         status: 'connected', latency: 1 },
      { name: 'Evidence Pipeline',   status: 'idle',     latency: null },
      { name: 'Worker Queue',        status: 'healthy',  latency: null },
      { name: 'File Storage (S3)',   status: 'healthy',  latency: 18 },
    ],
  };
}

function demoActivity() {
  const actions = [
    { type: 'protocol_created', user: 'Dr. Sarah Chen',       detail: 'tDCS L-DLPFC for MDD — 20 sessions',           ts: new Date(Date.now() - 120000).toISOString() },
    { type: 'consent_signed',   user: 'Dr. Mark Alvarez',     detail: 'Patient #1042 signed informed consent',         ts: new Date(Date.now() - 300000).toISOString() },
    { type: 'assessment_done',  user: 'Dr. Lisa Park',        detail: 'PHQ-9 scored: 14 (moderate)',                   ts: new Date(Date.now() - 480000).toISOString() },
    { type: 'patient_added',    user: 'Dr. Sarah Chen',       detail: 'New patient: James Morrison, MDD referral',     ts: new Date(Date.now() - 720000).toISOString() },
    { type: 'session_completed',user: 'Dr. James Wu',         detail: 'Session 12/20 for Patient #987 — no AE',       ts: new Date(Date.now() - 1200000).toISOString() },
    { type: 'protocol_created', user: 'Dr. Lisa Park',        detail: 'rTMS bilateral DLPFC — anxious depression',     ts: new Date(Date.now() - 1800000).toISOString() },
    { type: 'report_generated', user: 'Dr. Mark Alvarez',     detail: 'Course completion report — Patient #1038',      ts: new Date(Date.now() - 2400000).toISOString() },
    { type: 'assessment_done',  user: 'Dr. James Wu',         detail: 'GAD-7 scored: 8 (mild)',                        ts: new Date(Date.now() - 3200000).toISOString() },
    { type: 'patient_added',    user: 'Dr. Sarah Chen',       detail: 'New patient: Emily Torres, chronic pain',       ts: new Date(Date.now() - 4500000).toISOString() },
    { type: 'consent_signed',   user: 'Dr. Lisa Park',        detail: 'Patient #1044 signed research consent',         ts: new Date(Date.now() - 5600000).toISOString() },
    { type: 'session_completed',user: 'Dr. Mark Alvarez',     detail: 'Session 5/15 for Patient #1001 — mild tingling',ts: new Date(Date.now() - 7200000).toISOString() },
    { type: 'protocol_created', user: 'Dr. James Wu',         detail: 'HD-tDCS F3 cathodal — OCD protocol',            ts: new Date(Date.now() - 10800000).toISOString() },
  ];
  return actions;
}

function demoAnalytics() {
  return {
    active_clinicians: { value: 12, trend: [8, 9, 10, 11, 11, 12, 12], delta: '+2' },
    protocols_generated: { value: 47, trend: [28, 32, 35, 39, 41, 44, 47], delta: '+6' },
    assessments_scored: { value: 134, trend: [90, 102, 108, 115, 120, 128, 134], delta: '+14' },
    patients_onboarded: { value: 23, trend: [12, 14, 16, 18, 19, 21, 23], delta: '+4' },
    sessions_completed: { value: 89, trend: [52, 60, 68, 72, 78, 84, 89], delta: '+11' },
    reports_exported: { value: 31, trend: [18, 20, 22, 24, 27, 29, 31], delta: '+4' },
  };
}

function demoErrors() {
  return [
    { id: 'e1', severity: 'error',   ts: new Date(Date.now() - 180000).toISOString(),   message: 'TimeoutError: Evidence ingestion worker exceeded 30s deadline',          source: 'worker/evidence-ingest.js:142',   stack: 'TimeoutError: deadline exceeded\n    at IngestWorker.run (worker/evidence-ingest.js:142:18)\n    at processQueue (worker/queue.js:58:12)\n    at async Worker.execute (worker/index.js:31:5)', dismissed: false },
    { id: 'e2', severity: 'warning', ts: new Date(Date.now() - 900000).toISOString(),   message: 'High memory usage detected: 891MB / 1024MB (87%)',                       source: 'monitor/health-check.js:67',      stack: null, dismissed: false },
    { id: 'e3', severity: 'error',   ts: new Date(Date.now() - 2700000).toISOString(),  message: 'ConnectionRefusedError: Redis connection pool exhausted',                 source: 'cache/redis-client.js:23',        stack: 'ConnectionRefusedError: connect ECONNREFUSED 127.0.0.1:6379\n    at TCPConnectWrap.afterConnect [as oncomplete] (net.js:1141:16)\n    at RedisPool.acquire (cache/redis-client.js:23:11)', dismissed: false },
    { id: 'e4', severity: 'info',    ts: new Date(Date.now() - 5400000).toISOString(),  message: 'Evidence pipeline completed: 342 papers indexed in 12.4s',                source: 'pipeline/evidence-sync.js:89',    stack: null, dismissed: false },
    { id: 'e5', severity: 'warning', ts: new Date(Date.now() - 7200000).toISOString(),  message: 'Slow query detected: patient_assessments JOIN took 4.2s',                 source: 'db/query-monitor.js:34',          stack: 'SlowQueryWarning: query exceeded 2000ms threshold\n    at QueryMonitor.check (db/query-monitor.js:34:8)\n    at Pool.query (db/pool.js:112:20)', dismissed: false },
    { id: 'e6', severity: 'error',   ts: new Date(Date.now() - 14400000).toISOString(), message: 'ValidationError: Protocol montage missing required anode placement',      source: 'api/protocols/validate.js:78',    stack: 'ValidationError: anode_placement is required\n    at validateProtocol (api/protocols/validate.js:78:11)\n    at POST /api/v1/protocols (api/protocols/router.js:42:5)', dismissed: false },
    { id: 'e7', severity: 'info',    ts: new Date(Date.now() - 18000000).toISOString(), message: 'Automated backup completed: 2.4GB snapshot to S3',                        source: 'ops/backup-scheduler.js:112',     stack: null, dismissed: false },
    { id: 'e8', severity: 'warning', ts: new Date(Date.now() - 28800000).toISOString(), message: 'Rate limit approached: 450/500 requests in 60s window for IP 10.0.2.15', source: 'middleware/rate-limit.js:19',     stack: null, dismissed: false },
  ];
}

function demoPipeline() {
  return {
    last_run: new Date(Date.now() - 3600000 * 2.5).toISOString(),
    last_run_duration_s: 12.4,
    papers_added_since_sync: 342,
    total_papers: 87412,
    next_scheduled: new Date(Date.now() + 3600000 * 3.5).toISOString(),
    sources: [
      { name: 'PubMed',          papers: 52340, last_sync: new Date(Date.now() - 3600000 * 2.5).toISOString(), status: 'synced' },
      { name: 'Cochrane',        papers: 8920,  last_sync: new Date(Date.now() - 3600000 * 4).toISOString(),   status: 'synced' },
      { name: 'ClinicalTrials',  papers: 14280, last_sync: new Date(Date.now() - 3600000 * 6).toISOString(),   status: 'synced' },
      { name: 'IEEE Xplore',     papers: 6120,  last_sync: new Date(Date.now() - 86400000).toISOString(),      status: 'stale' },
      { name: 'Internal Studies', papers: 5752,  last_sync: new Date(Date.now() - 3600000 * 2.5).toISOString(), status: 'synced' },
    ],
    recent_ingestions: [
      { ts: new Date(Date.now() - 3600000 * 2.5).toISOString(), papers: 342, duration_s: 12.4, status: 'success' },
      { ts: new Date(Date.now() - 86400000).toISOString(),       papers: 218, duration_s: 9.1,  status: 'success' },
      { ts: new Date(Date.now() - 86400000 * 2).toISOString(),   papers: 156, duration_s: 7.8,  status: 'success' },
      { ts: new Date(Date.now() - 86400000 * 3).toISOString(),   papers: 0,   duration_s: 2.1,  status: 'warning' },
      { ts: new Date(Date.now() - 86400000 * 4).toISOString(),   papers: 412, duration_s: 14.2, status: 'success' },
    ],
  };
}

function demoUptime() {
  // 30 days of uptime data: 1 = up, 0 = down, 0.5 = degraded
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const r = Math.random();
    days.push({
      date: d.toISOString().slice(0, 10),
      status: r > 0.06 ? 1 : r > 0.03 ? 0.5 : 0,
    });
  }
  // Ensure today and yesterday are up
  days[days.length - 1].status = 1;
  days[days.length - 2].status = 1;
  return days;
}

/* ── Fetch with fallback ──────────────────────────────────────────────────── */
const _API_BASE = (import.meta.env && import.meta.env.VITE_API_BASE_URL) || 'http://127.0.0.1:8000';

async function fetchOr(endpoint, fallback) {
  try {
    const token = typeof localStorage !== 'undefined' && localStorage.getItem('ds_access_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${_API_BASE}${endpoint}`, { headers });
    if (!res.ok) return fallback();
    const data = await res.json();
    if (data && typeof data === 'object' && !data.error) return data;
    return fallback();
  } catch {
    return fallback();
  }
}

/* ── Shared card wrapper ──────────────────────────────────────────────────── */
function card(title, body, opts = {}) {
  const extra = opts.headerRight || '';
  const pad = opts.noPad ? '0' : '16px';
  return `<div style="background:${T.panel};border:1px solid ${T.border};border-radius:12px;overflow:hidden;${opts.style || ''}">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid ${T.border}">
      <div style="font-size:13px;font-weight:600;color:${T.t1};font-family:${T.fdisp}">${esc(title)}</div>
      ${extra}
    </div>
    <div style="padding:${pad}">${body}</div>
  </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════════
   pgMonitoring — main export
   ══════════════════════════════════════════════════════════════════════════════ */
export async function pgMonitoring(setTopbar, navigate) {
  const tab = window._monitoringTab || 'overview';
  window._monitoringTab = tab;
  const el = document.getElementById('content');

  setTopbar('System Health',
    `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${T.green};color:#000;font-weight:600">Monitoring</span>`);

  /* ── Tab bar ────────────────────────────────────────────────────────────── */
  function tabBar() {
    return Object.entries(TAB_META).map(([id, m]) =>
      '<button role="tab" aria-selected="' + (tab === id) + '" tabindex="' + (tab === id ? '0' : '-1') + '"' +
      ' class="ch-tab' + (tab === id ? ' ch-tab--active' : '') + '"' +
      (tab === id ? ' style="--tab-color:' + m.color + '"' : '') +
      ` onclick="window._monitoringTab='${id}';window._nav('system-health')">${esc(m.label)}</button>`
    ).join('');
  }

  /* ── Shell ──────────────────────────────────────────────────────────────── */
  el.innerHTML = `<div class="ch-shell">
    <div class="ch-tab-bar" role="tablist" aria-label="System Health sections">${tabBar()}</div>
    <div class="ch-body" id="mon-body">${spinner()}</div>
  </div>`;

  const body = document.getElementById('mon-body');

  /* ── Render per tab ─────────────────────────────────────────────────────── */
  if (tab === 'overview')       await renderOverview(body);
  else if (tab === 'activity')  await renderActivity(body);
  else if (tab === 'analytics') await renderAnalytics(body);
  else if (tab === 'errors')    await renderErrors(body);
  else if (tab === 'pipeline')  await renderPipeline(body);
}

/* ══════════════════════════════════════════════════════════════════════════════
   TAB: Health Overview
   ══════════════════════════════════════════════════════════════════════════════ */
async function renderOverview(body) {
  const data = await fetchOr('/api/v1/admin/health', demoHealth);
  const uptime = await fetchOr('/api/v1/admin/uptime', demoUptime);

  /* ── Gauges row ─────────────────────────────────────────────────────────── */
  const gaugesHtml = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:16px;margin-bottom:20px">
      <div style="background:${T.panel};border:1px solid ${T.border};border-radius:12px;padding:16px 12px">
        ${gaugeArc(data.api_latency_ms, 200, 'API Latency', 'ms', [80, 150])}
      </div>
      <div style="background:${T.panel};border:1px solid ${T.border};border-radius:12px;padding:16px 12px">
        ${gaugeArc(data.cpu_pct, 100, 'CPU Usage', '%', [50, 80])}
      </div>
      <div style="background:${T.panel};border:1px solid ${T.border};border-radius:12px;padding:16px 12px">
        ${gaugeArc(data.memory_mb, data.memory_max_mb, 'Memory', 'MB', [data.memory_max_mb * 0.6, data.memory_max_mb * 0.85])}
      </div>
      <div style="background:${T.panel};border:1px solid ${T.border};border-radius:12px;padding:16px 12px">
        ${gaugeArc(data.worker_queue_depth, 50, 'Queue Depth', '', [10, 30])}
      </div>
    </div>`;

  /* ── Service status table ───────────────────────────────────────────────── */
  const services = data.services || [];
  const svcRows = services.map(s => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid ${T.border}">
      ${statusDot(s.status)}
      <span style="flex:1;font-size:13px;color:${T.t1};font-weight:500">${esc(s.name)}</span>
      <span style="font-size:11px;color:${T.t3};text-transform:capitalize">${esc(s.status)}</span>
      ${s.latency != null ? `<span style="font-size:11px;color:${T.t2};font-family:${T.fmono};min-width:40px;text-align:right">${s.latency}ms</span>` : '<span style="min-width:40px"></span>'}
    </div>`).join('');

  const serviceCard = card('Service Status', svcRows, {
    headerRight: `<span style="font-size:11px;color:${T.green};font-weight:500">
      ${statusDot('healthy')} ${services.filter(s => s.status === 'healthy' || s.status === 'connected' || s.status === 'idle').length}/${services.length} operational</span>`
  });

  /* ── Quick stats ────────────────────────────────────────────────────────── */
  const statsHtml = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px">
      ${_quickStat('DB Connections', `${data.db_pool_used}/${data.db_pool_max}`, data.db_status === 'connected' ? T.green : T.red)}
      ${_quickStat('Uptime', `${data.uptime_pct}%`, data.uptime_pct >= 99.9 ? T.green : T.amber)}
      ${_quickStat('Evidence Pipeline', data.evidence_pipeline, data.evidence_pipeline === 'idle' || data.evidence_pipeline === 'running' ? T.green : T.amber)}
      ${_quickStat('Worker Queue', `${data.worker_queue_depth} jobs`, data.worker_queue_depth < 10 ? T.green : T.amber)}
    </div>`;

  /* ── Uptime chart (30 days) ─────────────────────────────────────────────── */
  const uptimeDays = Array.isArray(uptime) ? uptime : [];
  const uptimeBars = uptimeDays.map(d => {
    const color = d.status === 1 ? T.green : d.status === 0.5 ? T.amber : T.red;
    const label = d.date;
    const statusLabel = d.status === 1 ? 'Operational' : d.status === 0.5 ? 'Degraded' : 'Outage';
    return `<div title="${esc(label)}: ${statusLabel}" style="flex:1;min-width:6px;height:28px;background:${color};border-radius:3px;cursor:help;transition:opacity .15s" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'"></div>`;
  }).join('');

  const uptimeCard = card('Uptime — Last 30 Days', `
    <div style="display:flex;gap:2px;align-items:end;margin-bottom:8px">${uptimeBars}</div>
    <div style="display:flex;justify-content:space-between;font-size:10px;color:${T.t3}">
      <span>${uptimeDays.length > 0 ? uptimeDays[0].date : ''}</span>
      <span>Today</span>
    </div>
    <div style="display:flex;gap:16px;margin-top:10px">
      <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:${T.t3}">
        <span style="width:8px;height:8px;border-radius:2px;background:${T.green}"></span> Operational
      </span>
      <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:${T.t3}">
        <span style="width:8px;height:8px;border-radius:2px;background:${T.amber}"></span> Degraded
      </span>
      <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:${T.t3}">
        <span style="width:8px;height:8px;border-radius:2px;background:${T.red}"></span> Outage
      </span>
    </div>
  `);

  body.innerHTML = `
    ${gaugesHtml}
    ${statsHtml}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      ${serviceCard}
      ${uptimeCard}
    </div>
    <div style="text-align:center;padding:8px 0">
      <button class="btn-secondary" style="font-size:12px;padding:6px 16px;border-radius:8px;border:1px solid ${T.border};background:${T.surface};color:${T.t2};cursor:pointer"
        onclick="window._monitoringTab='overview';window._nav('system-health')">
        Refresh
      </button>
      <span style="font-size:11px;color:${T.t3};margin-left:8px">Auto-refresh: 60s</span>
    </div>`;

  // Auto-refresh every 60s while on this tab
  const _refreshTimer = setInterval(() => {
    if (window._monitoringTab !== 'overview' || !document.getElementById('mon-body')) {
      clearInterval(_refreshTimer);
      return;
    }
    renderOverview(document.getElementById('mon-body'));
  }, 60000);
}

function _quickStat(label, value, color) {
  return `<div style="background:${T.panel};border:1px solid ${T.border};border-radius:10px;padding:14px 16px">
    <div style="font-size:11px;color:${T.t3};margin-bottom:4px">${esc(label)}</div>
    <div style="font-size:18px;font-weight:700;color:${color};font-family:${T.fmono}">${esc(value)}</div>
  </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════════
   TAB: Session Activity Feed
   ══════════════════════════════════════════════════════════════════════════════ */
async function renderActivity(body) {
  const items = await fetchOr('/api/v1/admin/activity', demoActivity);

  const TYPE_META = {
    protocol_created:  { icon: `<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:${T.teal};fill:none;stroke-width:2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="m4.22 4.22 2.12 2.12"/><path d="m17.66 17.66 2.12 2.12"/></svg>`, label: 'Protocol Created',  color: T.teal },
    consent_signed:    { icon: `<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:${T.green};fill:none;stroke-width:2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`, label: 'Consent Signed',    color: T.green },
    assessment_done:   { icon: `<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:${T.blue};fill:none;stroke-width:2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1"/></svg>`, label: 'Assessment Scored',  color: T.blue },
    patient_added:     { icon: `<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:${T.violet};fill:none;stroke-width:2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>`, label: 'Patient Added',      color: T.violet },
    session_completed: { icon: `<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:${T.amber};fill:none;stroke-width:2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`, label: 'Session Completed',  color: T.amber },
    report_generated:  { icon: `<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:${T.rose};fill:none;stroke-width:2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`, label: 'Report Generated',   color: T.rose },
  };

  // Type filter state
  const filter = window._actFilter || 'all';
  const filteredItems = filter === 'all' ? items : items.filter(i => i.type === filter);

  const filterPills = ['all', ...Object.keys(TYPE_META)].map(f => {
    const label = f === 'all' ? 'All' : (TYPE_META[f]?.label || f);
    const active = filter === f;
    return `<button style="padding:4px 10px;font-size:11px;border-radius:6px;border:1px solid ${active ? T.teal : T.border};background:${active ? T.teal : 'transparent'};color:${active ? '#000' : T.t2};cursor:pointer;font-weight:${active ? '600' : '400'}"
      onclick="window._actFilter='${f}';window._monitoringTab='activity';window._nav('system-health')">${esc(label)}</button>`;
  }).join('');

  const rows = filteredItems.map(item => {
    const meta = TYPE_META[item.type] || { icon: '', label: item.type, color: T.t2 };
    return `<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid ${T.border}">
      <div style="width:32px;height:32px;border-radius:8px;background:${meta.color}15;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px">${meta.icon}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
          <span style="font-size:12px;font-weight:600;color:${T.t1}">${esc(meta.label)}</span>
          <span style="font-size:11px;color:${T.t3}">${ago(item.ts)}</span>
        </div>
        <div style="font-size:12px;color:${T.t2};margin-bottom:2px">${esc(item.detail)}</div>
        <div style="font-size:11px;color:${T.t3}">by ${esc(item.user)}</div>
      </div>
    </div>`;
  }).join('');

  body.innerHTML = `
    <div style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <span style="font-size:12px;color:${T.t3};font-weight:500">Filter:</span>
        ${filterPills}
      </div>
    </div>
    ${card('Recent Clinician Activity', rows || `<div style="padding:24px;text-align:center;color:${T.t3};font-size:13px">No activity matching filter.</div>`, {
      headerRight: `<span style="font-size:11px;color:${T.t3}">${filteredItems.length} events</span>`
    })}
    <div style="text-align:center;margin-top:12px">
      <span style="font-size:11px;color:${T.t3}">Showing last ${filteredItems.length} events — real-time feed updates via SSE when connected to API</span>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════════
   TAB: Usage Analytics
   ══════════════════════════════════════════════════════════════════════════════ */
async function renderAnalytics(body) {
  const data = await fetchOr('/api/v1/admin/analytics', demoAnalytics);

  const KPI_META = [
    { key: 'active_clinicians',   label: 'Active Clinicians',   sub: 'This week',        icon: `<svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:${T.teal};fill:none;stroke-width:2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`, color: T.teal },
    { key: 'protocols_generated', label: 'Protocols Generated', sub: 'This week',        icon: `<svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:${T.blue};fill:none;stroke-width:2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3"/></svg>`, color: T.blue },
    { key: 'assessments_scored',  label: 'Assessments Scored',  sub: 'This week',        icon: `<svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:${T.violet};fill:none;stroke-width:2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1"/></svg>`, color: T.violet },
    { key: 'patients_onboarded',  label: 'Patients Onboarded',  sub: 'This week',        icon: `<svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:${T.green};fill:none;stroke-width:2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>`, color: T.green },
    { key: 'sessions_completed',  label: 'Sessions Completed',  sub: 'This week',        icon: `<svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:${T.amber};fill:none;stroke-width:2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`, color: T.amber },
    { key: 'reports_exported',    label: 'Reports Exported',    sub: 'This week',        icon: `<svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:${T.rose};fill:none;stroke-width:2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`, color: T.rose },
  ];

  const cards = KPI_META.map(m => {
    const d = data[m.key] || { value: 0, trend: [], delta: '+0' };
    const deltaColor = d.delta.startsWith('+') ? T.green : d.delta.startsWith('-') ? T.red : T.t3;
    return `<div style="background:${T.panel};border:1px solid ${T.border};border-radius:12px;padding:18px 16px;display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:36px;height:36px;border-radius:10px;background:${m.color}15;display:flex;align-items:center;justify-content:center">${m.icon}</div>
        <div>
          <div style="font-size:11px;color:${T.t3}">${esc(m.label)}</div>
          <div style="font-size:10px;color:${T.t3}">${esc(m.sub)}</div>
        </div>
      </div>
      <div style="display:flex;align-items:end;justify-content:space-between;gap:8px">
        <div>
          <span style="font-size:28px;font-weight:700;color:${T.t1};font-family:${T.fmono};line-height:1">${fmt(d.value)}</span>
          <span style="font-size:12px;color:${deltaColor};font-weight:600;margin-left:6px">${esc(d.delta)}</span>
        </div>
        ${sparkline(d.trend, m.color)}
      </div>
    </div>`;
  }).join('');

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:20px">
      ${cards}
    </div>
    <div style="text-align:center;padding:8px 0">
      <span style="font-size:11px;color:${T.t3}">Data reflects the current 7-day window. Trends show daily values.</span>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════════
   TAB: Error Log Viewer
   ══════════════════════════════════════════════════════════════════════════════ */
async function renderErrors(body) {
  const allErrors = await fetchOr('/api/v1/admin/errors', demoErrors);
  window._monErrors = window._monErrors || allErrors;

  const severityFilter = window._errFilter || 'all';
  const dismissedIds = window._errDismissed || new Set();
  window._errDismissed = dismissedIds;

  const SEV_META = {
    error:   { label: 'Error',   color: T.red,   bg: 'rgba(239,68,68,0.1)' },
    warning: { label: 'Warning', color: T.amber, bg: 'rgba(255,181,71,0.1)' },
    info:    { label: 'Info',    color: T.blue,  bg: 'rgba(74,158,255,0.1)' },
  };

  const filtered = allErrors.filter(e => {
    if (dismissedIds.has(e.id)) return false;
    if (severityFilter === 'all') return true;
    return e.severity === severityFilter;
  });

  // Counts
  const counts = { all: allErrors.filter(e => !dismissedIds.has(e.id)).length };
  for (const s of ['error', 'warning', 'info']) {
    counts[s] = allErrors.filter(e => e.severity === s && !dismissedIds.has(e.id)).length;
  }

  const filterPills = ['all', 'error', 'warning', 'info'].map(f => {
    const label = f === 'all' ? `All (${counts.all})` : `${SEV_META[f]?.label || f} (${counts[f] || 0})`;
    const active = severityFilter === f;
    const color = f === 'all' ? T.teal : SEV_META[f]?.color || T.t2;
    return `<button style="padding:4px 10px;font-size:11px;border-radius:6px;border:1px solid ${active ? color : T.border};background:${active ? color + '22' : 'transparent'};color:${active ? color : T.t2};cursor:pointer;font-weight:${active ? '600' : '400'}"
      onclick="window._errFilter='${f}';window._monitoringTab='errors';window._nav('system-health')">${label}</button>`;
  }).join('');

  const rows = filtered.map(e => {
    const sev = SEV_META[e.severity] || SEV_META.info;
    const expanded = window._errExpanded === e.id;
    return `<div style="border:1px solid ${T.border};border-radius:10px;margin-bottom:8px;overflow:hidden;background:${sev.bg}">
      <div style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;cursor:pointer" onclick="window._errExpanded=window._errExpanded==='${e.id}'?null:'${e.id}';window._monitoringTab='errors';window._nav('system-health')">
        <span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;background:${sev.color}20;color:${sev.color};text-transform:uppercase;flex-shrink:0;margin-top:1px">${esc(e.severity)}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;color:${T.t1};font-weight:500;word-break:break-word">${esc(e.message)}</div>
          <div style="font-size:11px;color:${T.t3};margin-top:3px">${esc(e.source)} &middot; ${ago(e.ts)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          ${e.stack ? `<span style="font-size:10px;color:${T.t3}">${expanded ? 'Collapse' : 'Expand'}</span>` : ''}
          <button title="Dismiss" style="background:none;border:none;cursor:pointer;color:${T.t3};font-size:14px;padding:2px 4px"
            onclick="event.stopPropagation();window._errDismissed.add('${e.id}');window._monitoringTab='errors';window._nav('system-health')">
            &times;
          </button>
        </div>
      </div>
      ${expanded && e.stack ? `<div style="padding:0 14px 14px">
        <pre style="background:rgba(0,0,0,0.3);border-radius:6px;padding:10px 12px;font-size:11px;color:${T.t2};font-family:${T.fmono};overflow-x:auto;white-space:pre-wrap;word-break:break-all;margin:0;line-height:1.6">${esc(e.stack)}</pre>
      </div>` : ''}
    </div>`;
  }).join('');

  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <span style="font-size:12px;color:${T.t3};font-weight:500">Severity:</span>
      ${filterPills}
      <div style="flex:1"></div>
      <button style="padding:4px 10px;font-size:11px;border-radius:6px;border:1px solid ${T.border};background:${T.surface};color:${T.t2};cursor:pointer"
        onclick="window._errDismissed=new Set();window._monitoringTab='errors';window._nav('system-health')">
        Reset dismissed
      </button>
    </div>
    ${filtered.length > 0 ? rows : `<div style="padding:40px;text-align:center;color:${T.t3};font-size:13px">
      <div style="font-size:32px;margin-bottom:8px;opacity:0.4">&#10003;</div>
      No ${severityFilter === 'all' ? '' : severityFilter + ' '}errors to display.
    </div>`}
    <div style="text-align:center;padding:8px 0">
      <span style="font-size:11px;color:${T.t3}">Showing ${filtered.length} of ${allErrors.length} log entries</span>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════════
   TAB: Evidence Pipeline
   ══════════════════════════════════════════════════════════════════════════════ */
async function renderPipeline(body) {
  const data = await fetchOr('/api/v1/admin/pipeline', demoPipeline);

  /* ── Overview cards ─────────────────────────────────────────────────────── */
  const overviewCards = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px">
      ${_quickStat('Total Papers', fmt(data.total_papers), T.teal)}
      ${_quickStat('Added Since Sync', fmt(data.papers_added_since_sync), T.green)}
      ${_quickStat('Last Run', ago(data.last_run), T.blue)}
      ${_quickStat('Last Duration', `${data.last_run_duration_s}s`, T.violet)}
      ${_quickStat('Next Scheduled', _timeUntil(data.next_scheduled), T.amber)}
    </div>`;

  /* ── Sources table ──────────────────────────────────────────────────────── */
  const sources = data.sources || [];
  const srcRows = sources.map(s => {
    const statusColor = s.status === 'synced' ? T.green : s.status === 'stale' ? T.amber : T.red;
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid ${T.border}">
      ${statusDot(s.status === 'synced' ? 'healthy' : s.status === 'stale' ? 'degraded' : 'down')}
      <span style="flex:1;font-size:13px;color:${T.t1};font-weight:500">${esc(s.name)}</span>
      <span style="font-size:12px;color:${T.t2};font-family:${T.fmono}">${fmt(s.papers)}</span>
      <span style="font-size:11px;color:${statusColor};min-width:60px;text-align:right">${esc(s.status)}</span>
      <span style="font-size:11px;color:${T.t3};min-width:80px;text-align:right">${ago(s.last_sync)}</span>
    </div>`;
  }).join('');

  const sourcesCard = card('Data Sources', srcRows, {
    headerRight: `<span style="font-size:11px;color:${T.t3}">${sources.length} sources</span>`
  });

  /* ── Recent ingestions ──────────────────────────────────────────────────── */
  const ingestions = data.recent_ingestions || [];
  const ingRows = ingestions.map(ing => {
    const statusIcon = ing.status === 'success'
      ? `<span style="color:${T.green};font-size:12px">&#10003;</span>`
      : `<span style="color:${T.amber};font-size:12px">&#9888;</span>`;
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid ${T.border}">
      ${statusIcon}
      <span style="font-size:12px;color:${T.t2}">${new Date(ing.ts).toLocaleDateString()} ${new Date(ing.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      <span style="flex:1"></span>
      <span style="font-size:12px;color:${T.t1};font-weight:500;font-family:${T.fmono}">${fmt(ing.papers)} papers</span>
      <span style="font-size:11px;color:${T.t3}">${ing.duration_s}s</span>
    </div>`;
  }).join('');

  const ingestCard = card('Recent Ingestion Runs', ingRows, {
    headerRight: `<span style="font-size:11px;color:${T.t3}">Last ${ingestions.length} runs</span>`
  });

  body.innerHTML = `
    ${overviewCards}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      ${sourcesCard}
      ${ingestCard}
    </div>
    <div style="text-align:center;margin-top:16px">
      <button style="padding:8px 20px;font-size:12px;border-radius:8px;border:1px solid ${T.teal};background:${T.teal}15;color:${T.teal};cursor:pointer;font-weight:600"
        onclick="window._monitoringTab='pipeline';window._nav('system-health')">
        Trigger Manual Sync
      </button>
    </div>`;
}

function _timeUntil(ts) {
  const d = new Date(ts).getTime() - Date.now();
  if (d < 0) return 'overdue';
  if (d < 3600000) return `${Math.floor(d / 60000)}m`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ${Math.floor((d % 3600000) / 60000)}m`;
  return `${Math.floor(d / 86400000)}d`;
}

/* ── Responsive grid fix: collapse 2-col → 1-col on narrow screens ───────── */
// Handled via CSS grid auto-fit above; no additional JS needed.
