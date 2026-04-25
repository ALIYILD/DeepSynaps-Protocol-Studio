import { api } from './api.js';
import { currentUser } from './auth.js';

const TAB_KEY = 'monitor_tab';
const STATE_KEY = '__ds_monitor_state';
const RETRY_MS = [1000, 2000, 4000, 8000, 16000, 30000];

/* ── Demo mode detection ──────────────────────────────────────────────────── */
function _isDemoMode() {
  try { return !!(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1'); } catch { return false; }
}

/* ── Demo data generators ─────────────────────────────────────────────────── */
function demoLiveSnapshot() {
  const now = Date.now();
  const caseload = [
    { patient_id: 'pt-demo-001', display_name: 'James Morrison',  risk_tier: 'red',    risk_score: 0.91, risk_drivers: ['suicidal_ideation', 'low_readiness'], hrv_last: 28,   sleep_last: 3.8, prom_delta: -12, adherence_pct: 45,  last_feature_at: new Date(now - 1800000).toISOString(),  wearable_stale: false },
    { patient_id: 'pt-demo-002', display_name: 'Angela Rivera',   risk_tier: 'red',    risk_score: 0.84, risk_drivers: ['hrv_critical', 'missed_sessions'],    hrv_last: 22,   sleep_last: 4.1, prom_delta: -8,  adherence_pct: 30,  last_feature_at: new Date(now - 7200000).toISOString(),  wearable_stale: false },
    { patient_id: 'pt-demo-003', display_name: 'Robert Kim',      risk_tier: 'orange', risk_score: 0.64, risk_drivers: ['wearable_stale'],                     hrv_last: null,  sleep_last: null, prom_delta: -3,  adherence_pct: 62,  last_feature_at: new Date(now - 200000000).toISOString(), wearable_stale: true },
    { patient_id: 'pt-demo-004', display_name: 'Emily Torres',    risk_tier: 'orange', risk_score: 0.58, risk_drivers: ['sleep_disruption', 'prom_decline'],   hrv_last: 38,   sleep_last: 4.9, prom_delta: -5,  adherence_pct: 70,  last_feature_at: new Date(now - 3600000).toISOString(),  wearable_stale: false },
    { patient_id: 'pt-demo-005', display_name: 'David Okafor',    risk_tier: 'orange', risk_score: 0.52, risk_drivers: ['prom_decline'],                       hrv_last: 42,   sleep_last: 5.6, prom_delta: -4,  adherence_pct: 75,  last_feature_at: new Date(now - 5400000).toISOString(),  wearable_stale: false },
    { patient_id: 'pt-demo-006', display_name: 'Maria Santos',    risk_tier: 'yellow', risk_score: 0.38, risk_drivers: ['adherence_low'],                      hrv_last: 48,   sleep_last: 6.2, prom_delta: -1,  adherence_pct: 55,  last_feature_at: new Date(now - 900000).toISOString(),   wearable_stale: false },
    { patient_id: 'pt-demo-007', display_name: 'Liam Patel',      risk_tier: 'yellow', risk_score: 0.32, risk_drivers: ['mild_insomnia'],                      hrv_last: 52,   sleep_last: 5.8, prom_delta: 0,   adherence_pct: 80,  last_feature_at: new Date(now - 2700000).toISOString(),  wearable_stale: false },
    { patient_id: 'pt-demo-008', display_name: 'Samantha Li',     risk_tier: 'green',  risk_score: 0.18, risk_drivers: ['stable'],                              hrv_last: 62,   sleep_last: 7.4, prom_delta: 3,   adherence_pct: 92,  last_feature_at: new Date(now - 600000).toISOString(),   wearable_stale: false },
    { patient_id: 'pt-demo-009', display_name: 'Carlos Mendez',   risk_tier: 'green',  risk_score: 0.15, risk_drivers: ['stable'],                              hrv_last: 58,   sleep_last: 7.1, prom_delta: 2,   adherence_pct: 88,  last_feature_at: new Date(now - 1500000).toISOString(),  wearable_stale: false },
    { patient_id: 'pt-demo-010', display_name: 'Aisha Johnson',   risk_tier: 'green',  risk_score: 0.12, risk_drivers: ['stable'],                              hrv_last: 65,   sleep_last: 7.8, prom_delta: 5,   adherence_pct: 95,  last_feature_at: new Date(now - 420000).toISOString(),   wearable_stale: false },
    { patient_id: 'pt-demo-011', display_name: 'Nathan Wright',   risk_tier: 'green',  risk_score: 0.10, risk_drivers: ['stable'],                              hrv_last: 70,   sleep_last: 8.0, prom_delta: 4,   adherence_pct: 97,  last_feature_at: new Date(now - 300000).toISOString(),   wearable_stale: false },
    { patient_id: 'pt-demo-012', display_name: 'Yuki Tanaka',     risk_tier: 'green',  risk_score: 0.08, risk_drivers: ['stable'],                              hrv_last: 68,   sleep_last: 7.6, prom_delta: 6,   adherence_pct: 98,  last_feature_at: new Date(now - 240000).toISOString(),   wearable_stale: false },
  ];
  const crises = caseload.filter(r => r.risk_tier === 'red').map(r => ({
    patient_id: r.patient_id,
    display_name: r.display_name,
    tier: r.risk_tier,
    score: r.risk_score,
    top_driver: r.risk_drivers[0],
    reason_text: r.risk_drivers.slice(0, 2).join(', '),
  }));
  return {
    clinic_id: 'demo-clinic',
    generated_at: new Date().toISOString(),
    kpis: {
      red: 2, orange: 3, yellow: 2, green: 5,
      open_crises: crises.length,
      wearable_uptime_pct: 91.7,
      prom_compliance_pct: 83.3,
    },
    caseload,
    crises,
  };
}

function demoIntegrations() {
  const now = Date.now();
  const catalog = [
    // ── EHR / EMR
    { id: 'epic_fhir',         display_name: 'Epic (FHIR R4)',             kind: 'ehr',            auth_method: 'smart_on_fhir' },
    { id: 'cerner_oracle',     display_name: 'Cerner / Oracle Health',     kind: 'ehr',            auth_method: 'smart_on_fhir' },
    { id: 'athenahealth',      display_name: 'Athenahealth',               kind: 'ehr',            auth_method: 'oauth2' },
    { id: 'allscripts',        display_name: 'Allscripts Veradigm',        kind: 'ehr',            auth_method: 'oauth2' },
    { id: 'eclinicalworks',    display_name: 'eClinicalWorks',             kind: 'ehr',            auth_method: 'api_key' },
    { id: 'drchrono',          display_name: 'DrChrono',                   kind: 'ehr',            auth_method: 'oauth2' },
    { id: 'practice_fusion',   display_name: 'Practice Fusion',            kind: 'ehr',            auth_method: 'oauth2' },
    { id: 'kareo_clinical',    display_name: 'Kareo Clinical',             kind: 'ehr',            auth_method: 'api_key' },
    // ── Wearable / Biometrics
    { id: 'apple_healthkit',   display_name: 'Apple HealthKit',            kind: 'wearable',       auth_method: 'oauth2' },
    { id: 'google_health',     display_name: 'Google Health Connect',      kind: 'wearable',       auth_method: 'oauth2' },
    { id: 'fitbit',            display_name: 'Fitbit',                     kind: 'wearable',       auth_method: 'oauth2' },
    { id: 'garmin_connect',    display_name: 'Garmin Connect',             kind: 'wearable',       auth_method: 'oauth2' },
    { id: 'oura_ring',         display_name: 'Oura Ring',                  kind: 'wearable',       auth_method: 'oauth2' },
    { id: 'whoop',             display_name: 'WHOOP',                      kind: 'wearable',       auth_method: 'oauth2' },
    { id: 'polar',             display_name: 'Polar',                      kind: 'wearable',       auth_method: 'oauth2' },
    { id: 'samsung_health',    display_name: 'Samsung Health',             kind: 'wearable',       auth_method: 'oauth2' },
    { id: 'biostrap',          display_name: 'Biostrap',                   kind: 'wearable',       auth_method: 'api_key' },
    { id: 'withings',          display_name: 'Withings Health Mate',       kind: 'wearable',       auth_method: 'oauth2' },
    // ── Home-use neuromodulation devices
    { id: 'flow_tdcs',         display_name: 'Flow Neuroscience tDCS',     kind: 'home_device',    auth_method: 'api_key' },
    { id: 'fisher_wallace',    display_name: 'Fisher Wallace Stimulator',  kind: 'home_device',    auth_method: 'api_key' },
    { id: 'soterix_medical',   display_name: 'Soterix Medical tDCS',       kind: 'home_device',    auth_method: 'api_key' },
    { id: 'neuroelectrics',    display_name: 'Neuroelectrics Starstim',    kind: 'home_device',    auth_method: 'api_key' },
    { id: 'brainpatch',        display_name: 'BrainPatch',                 kind: 'home_device',    auth_method: 'api_key' },
    { id: 'neurostyle',        display_name: 'NeuroStyle Home tES',        kind: 'home_device',    auth_method: 'api_key' },
    // ── Brain monitoring / EEG headsets
    { id: 'muse_interaxon',    display_name: 'Muse (InteraXon)',           kind: 'brain_monitor',  auth_method: 'bluetooth' },
    { id: 'emotiv_epoc',       display_name: 'Emotiv EPOC',               kind: 'brain_monitor',  auth_method: 'api_key' },
    { id: 'neurosky',          display_name: 'NeuroSky MindWave',          kind: 'brain_monitor',  auth_method: 'bluetooth' },
    { id: 'openbci',           display_name: 'OpenBCI Cyton',              kind: 'brain_monitor',  auth_method: 'api_key' },
    { id: 'neurosity_crown',   display_name: 'Neurosity Crown',            kind: 'brain_monitor',  auth_method: 'oauth2' },
    // ── PROM / Patient-reported outcomes
    { id: 'native_prom',       display_name: 'DeepSynaps PWA e-diary',     kind: 'prom',           auth_method: 'none' },
    { id: 'redcap',            display_name: 'REDCap',                     kind: 'prom',           auth_method: 'api_key' },
    { id: 'qualtrics',         display_name: 'Qualtrics',                  kind: 'prom',           auth_method: 'api_key' },
    // ── Messaging / Communication
    { id: 'twilio_sms',        display_name: 'Twilio SMS',                 kind: 'messaging',      auth_method: 'api_key' },
    { id: 'sendgrid_email',    display_name: 'SendGrid Email',             kind: 'messaging',      auth_method: 'api_key' },
    // ── Lab / Diagnostics
    { id: 'quest_diagnostics', display_name: 'Quest Diagnostics',          kind: 'lab',            auth_method: 'api_key' },
    { id: 'labcorp',           display_name: 'LabCorp',                    kind: 'lab',            auth_method: 'api_key' },
    // ── Pharmacy
    { id: 'surescripts',       display_name: 'Surescripts e-Prescribing',  kind: 'pharmacy',       auth_method: 'api_key' },
    { id: 'pillpack',          display_name: 'PillPack (Amazon Pharmacy)', kind: 'pharmacy',       auth_method: 'oauth2' },
    // ── Telehealth
    { id: 'zoom_health',       display_name: 'Zoom Health (HIPAA)',        kind: 'telehealth',     auth_method: 'oauth2' },
    { id: 'doxy_me',           display_name: 'Doxy.me',                    kind: 'telehealth',     auth_method: 'api_key' },
    // ── Billing / Insurance
    { id: 'availity',          display_name: 'Availity',                   kind: 'billing',        auth_method: 'api_key' },
    { id: 'change_healthcare', display_name: 'Change Healthcare',          kind: 'billing',        auth_method: 'api_key' },
  ];
  const groups = {};
  catalog.forEach(c => { groups[c.kind] = groups[c.kind] || []; groups[c.kind].push({ ...c }); });
  const configured = [
    // EHR
    { id: 'epic_fhir',       connector_id: 'epic_fhir',       display_name: 'Epic (FHIR R4)',             kind: 'ehr',           auth_method: 'smart_on_fhir', status: 'degraded', last_sync_at: new Date(now - 7200000).toISOString(),   patient_count: 5,  last_error: 'FHIR token refresh failed \u2014 re-authorize in Epic admin console' },
    { id: 'cerner_oracle',   connector_id: 'cerner_oracle',   display_name: 'Cerner / Oracle Health',     kind: 'ehr',           auth_method: 'smart_on_fhir', status: 'healthy', last_sync_at: new Date(now - 3600000).toISOString(),   patient_count: 7,  last_error: null },
    { id: 'athenahealth',    connector_id: 'athenahealth',    display_name: 'Athenahealth',               kind: 'ehr',           auth_method: 'oauth2',        status: 'healthy', last_sync_at: new Date(now - 5400000).toISOString(),   patient_count: 4,  last_error: null },
    // Wearable / Biometrics
    { id: 'apple_healthkit', connector_id: 'apple_healthkit', display_name: 'Apple HealthKit',            kind: 'wearable',      auth_method: 'oauth2',        status: 'healthy', last_sync_at: new Date(now - 900000).toISOString(),    patient_count: 8,  last_error: null },
    { id: 'fitbit',          connector_id: 'fitbit',          display_name: 'Fitbit',                     kind: 'wearable',      auth_method: 'oauth2',        status: 'healthy', last_sync_at: new Date(now - 1200000).toISOString(),   patient_count: 6,  last_error: null },
    { id: 'oura_ring',       connector_id: 'oura_ring',       display_name: 'Oura Ring',                  kind: 'wearable',      auth_method: 'oauth2',        status: 'healthy', last_sync_at: new Date(now - 2400000).toISOString(),   patient_count: 3,  last_error: null },
    { id: 'garmin_connect',  connector_id: 'garmin_connect',  display_name: 'Garmin Connect',             kind: 'wearable',      auth_method: 'oauth2',        status: 'healthy', last_sync_at: new Date(now - 4800000).toISOString(),   patient_count: 4,  last_error: null },
    { id: 'whoop',           connector_id: 'whoop',           display_name: 'WHOOP',                      kind: 'wearable',      auth_method: 'oauth2',        status: 'error',   last_sync_at: new Date(now - 86400000).toISOString(),  patient_count: 2,  last_error: 'OAuth token expired \u2014 patient must re-link in WHOOP app' },
    { id: 'withings',        connector_id: 'withings',        display_name: 'Withings Health Mate',       kind: 'wearable',      auth_method: 'oauth2',        status: 'healthy', last_sync_at: new Date(now - 1800000).toISOString(),   patient_count: 2,  last_error: null },
    // Home devices
    { id: 'flow_tdcs',       connector_id: 'flow_tdcs',       display_name: 'Flow Neuroscience tDCS',     kind: 'home_device',   auth_method: 'api_key',       status: 'healthy', last_sync_at: new Date(now - 3600000).toISOString(),   patient_count: 3,  last_error: null },
    { id: 'fisher_wallace',  connector_id: 'fisher_wallace',  display_name: 'Fisher Wallace Stimulator',  kind: 'home_device',   auth_method: 'api_key',       status: 'healthy', last_sync_at: new Date(now - 7200000).toISOString(),   patient_count: 2,  last_error: null },
    { id: 'neuroelectrics',  connector_id: 'neuroelectrics',  display_name: 'Neuroelectrics Starstim',    kind: 'home_device',   auth_method: 'api_key',       status: 'healthy', last_sync_at: new Date(now - 10800000).toISOString(),  patient_count: 1,  last_error: null },
    // Brain monitors
    { id: 'muse_interaxon',  connector_id: 'muse_interaxon',  display_name: 'Muse (InteraXon)',           kind: 'brain_monitor', auth_method: 'bluetooth',     status: 'healthy', last_sync_at: new Date(now - 5400000).toISOString(),   patient_count: 4,  last_error: null },
    { id: 'emotiv_epoc',     connector_id: 'emotiv_epoc',     display_name: 'Emotiv EPOC',               kind: 'brain_monitor', auth_method: 'api_key',       status: 'healthy', last_sync_at: new Date(now - 14400000).toISOString(),  patient_count: 2,  last_error: null },
    // PROM
    { id: 'native_prom',     connector_id: 'native_prom',     display_name: 'DeepSynaps PWA e-diary',     kind: 'prom',          auth_method: 'none',          status: 'healthy', last_sync_at: new Date(now - 1800000).toISOString(),   patient_count: 11, last_error: null },
    { id: 'redcap',          connector_id: 'redcap',          display_name: 'REDCap',                     kind: 'prom',          auth_method: 'api_key',       status: 'healthy', last_sync_at: new Date(now - 43200000).toISOString(),  patient_count: 6,  last_error: null },
    // Messaging
    { id: 'twilio_sms',      connector_id: 'twilio_sms',      display_name: 'Twilio SMS',                 kind: 'messaging',     auth_method: 'api_key',       status: 'healthy', last_sync_at: new Date(now - 600000).toISOString(),    patient_count: 12, last_error: null },
    { id: 'sendgrid_email',  connector_id: 'sendgrid_email',  display_name: 'SendGrid Email',             kind: 'messaging',     auth_method: 'api_key',       status: 'healthy', last_sync_at: new Date(now - 900000).toISOString(),    patient_count: 12, last_error: null },
    // Lab
    { id: 'quest_diagnostics', connector_id: 'quest_diagnostics', display_name: 'Quest Diagnostics',      kind: 'lab',           auth_method: 'api_key',       status: 'healthy', last_sync_at: new Date(now - 172800000).toISOString(), patient_count: 3,  last_error: null },
    // Pharmacy
    { id: 'surescripts',     connector_id: 'surescripts',     display_name: 'Surescripts e-Prescribing',  kind: 'pharmacy',      auth_method: 'api_key',       status: 'healthy', last_sync_at: new Date(now - 86400000).toISOString(),  patient_count: 9,  last_error: null },
    // Telehealth
    { id: 'zoom_health',     connector_id: 'zoom_health',     display_name: 'Zoom Health (HIPAA)',        kind: 'telehealth',    auth_method: 'oauth2',        status: 'healthy', last_sync_at: new Date(now - 7200000).toISOString(),   patient_count: 10, last_error: null },
    // Billing
    { id: 'availity',        connector_id: 'availity',        display_name: 'Availity',                   kind: 'billing',       auth_method: 'api_key',       status: 'healthy', last_sync_at: new Date(now - 21600000).toISOString(),  patient_count: 12, last_error: null },
  ];
  return { catalog, groups, configured };
}

function demoDq() {
  return {
    counts: { error: 2, warn: 3, info: 2 },
    issues: [
      { id: 'derived:integration_error:integration:epic_fhir',         severity: 'error', title: 'Epic (FHIR R4) \u2014 integration error',                detail: 'FHIR token refresh failed \u2014 re-authorize in Epic admin console',                       suggested_fix: 'Reconnect the integration and review credentials or webhook configuration.' },
      { id: 'derived:integration_error:integration:whoop',             severity: 'error', title: 'WHOOP \u2014 OAuth token expired',                        detail: 'Token expired 24h ago; 2 patients affected',                                               suggested_fix: 'Ask affected patients to re-link their WHOOP account via the patient portal.' },
      { id: 'derived:wearable_stale_48h:patient:pt-demo-003',         severity: 'warn',  title: 'Robert Kim \u2014 wearable not synced >48h',              detail: 'Last feature update: ' + new Date(Date.now() - 200000000).toISOString(),                    suggested_fix: 'Ask the patient to reopen the wearable app and confirm permissions.' },
      { id: 'derived:wearable_stale_48h:patient:pt-demo-013',         severity: 'warn',  title: 'Priya Sharma \u2014 wearable not synced >48h',            detail: 'Last feature update: ' + new Date(Date.now() - 180000000).toISOString(),                    suggested_fix: 'Ask the patient to reopen the wearable app and confirm permissions.' },
      { id: 'derived:eeg_stale:patient:pt-demo-004',                  severity: 'warn',  title: 'Emily Torres \u2014 Muse EEG not synced in 5 days',       detail: 'Last brain monitor reading: ' + new Date(Date.now() - 432000000).toISOString(),             suggested_fix: 'Verify Bluetooth pairing and battery level on the Muse headband.' },
      { id: 'derived:prom_gap:patient:pt-demo-006',                   severity: 'info',  title: 'Maria Santos \u2014 PROM questionnaire overdue 3 days',    detail: 'Last PROM submission was 5 days ago; expected frequency is every 2 days.',                  suggested_fix: 'Send a reminder via Twilio SMS or in-app notification.' },
      { id: 'derived:home_device_low_adherence:patient:pt-demo-005',  severity: 'info',  title: 'David Okafor \u2014 home tDCS adherence below threshold',  detail: 'Only 3 of 7 scheduled sessions completed this week on Flow tDCS device.',                  suggested_fix: 'Review session schedule with patient and check device connectivity.' },
    ],
  };
}

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

const _KIND_LABELS = {
  ehr: 'EHR / EMR', wearable: 'Wearable / Biometrics', home_device: 'Home-Use Devices',
  brain_monitor: 'Brain Monitoring / EEG', prom: 'Patient-Reported Outcomes',
  messaging: 'Messaging', lab: 'Lab / Diagnostics', pharmacy: 'Pharmacy',
  telehealth: 'Telehealth', billing: 'Billing / Insurance',
};
function _kindLabel(kind) { return _KIND_LABELS[kind] || kind.replace(/_/g, ' '); }

function renderIntegrations(data) {
  const groups = Object.entries(data?.groups || {});
  const configured = new Map((data?.configured || []).map((item) => [item.connector_id, item]));
  const writable = canWriteIntegrations();
  return `<section class="monitor-panel">
    <div class="monitor-panel-head"><h3>Integrations</h3><span>${configured.size} configured</span></div>
    ${groups.map(([kind, items]) => `<div class="monitor-integration-group">
      <div class="monitor-group-title">${esc(_kindLabel(kind))}</div>
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
  try {
    const data = await api.monitorLiveSnapshot();
    if (data && data.kpis) { s.live = data; }
  } catch {}
  if (!s.live && _isDemoMode()) s.live = demoLiveSnapshot();
  render();
}

async function loadIntegrations() {
  const s = state();
  if (!canSeeIntegrations()) return;
  try {
    const data = await api.monitorIntegrations();
    if (data && data.groups) { s.integrations = data; }
  } catch {}
  if (!s.integrations && _isDemoMode()) s.integrations = demoIntegrations();
  render();
}

async function loadDq() {
  const s = state();
  try {
    const data = await api.monitorDataQualityIssues();
    if (data && Array.isArray(data.issues)) { s.dq = data; }
  } catch {}
  if (!s.dq && _isDemoMode()) s.dq = demoDq();
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
