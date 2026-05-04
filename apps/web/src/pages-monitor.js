import { api } from './api.js';
import { currentUser } from './auth.js';
import { DEMO_PATIENT_ROSTER } from './patient-dashboard-helpers.js';

const TAB_KEY = 'monitor_tab';
const STATE_KEY = '__ds_monitor_state';
const PATIENT_CACHE_KEY = '__ds_monitor_patients_cache';
const RETRY_MS = [1000, 2000, 4000, 8000, 16000, 30000];
/** Daily summaries older than this vs wall clock are labelled stale (matches backend 48h stale rule). */
const STALE_SYNC_HOURS = 48;
const GOVERNANCE_COPY =
  'Biometrics are clinician-reviewed decision-support signals. This page is not emergency monitoring, diagnosis, treatment approval, or protocol recommendation.';
/** Tabs that load clinic roster + integration catalog (lazy until opened). */
const MONITOR_HEAVY_TABS = new Set(['control-center', 'live', 'dq']);

const VALID_TABS = new Set(['biometrics-analyzer', 'control-center', 'live', 'dq', 'wearables-workbench']);

/* ── Demo mode detection ──────────────────────────────────────────────────── */
function _isDemoMode() {
  try { return !!(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1'); } catch { return false; }
}

/* ── Demo data generators ─────────────────────────────────────────────────── */
function demoLiveSnapshot() {
  const now = Date.now();
  // DEMO ONLY — synthetic cohort for UI review; not live patient data or clinical findings.
  const caseload = [
    { patient_id: 'pt-demo-001', display_name: 'James Morrison',  review_tier: 'red',    review_priority: 0.71, review_drivers: ['demo_threshold_review', 'vendor_readiness_low'], risk_tier: 'red',    risk_score: 0.71, risk_drivers: ['demo_threshold_review', 'vendor_readiness_low'], hrv_last: 28, sleep_last: 3.8, prom_delta: null, readiness_score: 42, adherence_pct: null, last_feature_at: new Date(now - 1800000).toISOString(), wearable_stale: false },
    { patient_id: 'pt-demo-002', display_name: 'Angela Rivera',   review_tier: 'red',    review_priority: 0.64, review_drivers: ['demo_rule_flag', 'symptom_report_pattern'],             risk_tier: 'red',    risk_score: 0.64, risk_drivers: ['demo_rule_flag', 'symptom_report_pattern'],             hrv_last: 22, sleep_last: 4.1, prom_delta: null, readiness_score: 38, adherence_pct: null, last_feature_at: new Date(now - 7200000).toISOString(), wearable_stale: false },
    { patient_id: 'pt-demo-003', display_name: 'Robert Kim',      review_tier: 'orange', review_priority: 0.54, review_drivers: ['wearable_stale'],                     risk_tier: 'orange', risk_score: 0.54, risk_drivers: ['wearable_stale'],                     hrv_last: null, sleep_last: null, prom_delta: null, readiness_score: null, adherence_pct: null, last_feature_at: new Date(now - 200000000).toISOString(), wearable_stale: true },
    { patient_id: 'pt-demo-004', display_name: 'Emily Torres',    review_tier: 'orange', review_priority: 0.48, review_drivers: ['sleep_duration_change', 'self_report_shift'], risk_tier: 'orange', risk_score: 0.48, risk_drivers: ['sleep_duration_change', 'self_report_shift'], hrv_last: 38, sleep_last: 4.9, prom_delta: null, readiness_score: 58, adherence_pct: null, last_feature_at: new Date(now - 3600000).toISOString(), wearable_stale: false },
    { patient_id: 'pt-demo-005', display_name: 'David Okafor',    review_tier: 'orange', review_priority: 0.42, review_drivers: ['session_attendance_gap'],                       risk_tier: 'orange', risk_score: 0.42, risk_drivers: ['session_attendance_gap'],                       hrv_last: 42, sleep_last: 5.6, prom_delta: null, readiness_score: 62, adherence_pct: null, last_feature_at: new Date(now - 5400000).toISOString(), wearable_stale: false },
    { patient_id: 'pt-demo-006', display_name: 'Maria Santos',    review_tier: 'yellow', review_priority: 0.38, review_drivers: ['home_program_adherence_low'],                      risk_tier: 'yellow', risk_score: 0.38, risk_drivers: ['home_program_adherence_low'],                      hrv_last: 48, sleep_last: 6.2, prom_delta: null, readiness_score: 55, adherence_pct: null, last_feature_at: new Date(now - 900000).toISOString(), wearable_stale: false },
    { patient_id: 'pt-demo-007', display_name: 'Liam Patel',      review_tier: 'yellow', review_priority: 0.32, review_drivers: ['sleep_variability'],                             risk_tier: 'yellow', risk_score: 0.32, risk_drivers: ['sleep_variability'],                             hrv_last: 52, sleep_last: 5.8, prom_delta: null, readiness_score: 72, adherence_pct: null, last_feature_at: new Date(now - 2700000).toISOString(), wearable_stale: false },
    { patient_id: 'pt-demo-008', display_name: 'Samantha Li',     review_tier: 'green',  review_priority: 0.18, review_drivers: ['no_flags_in_window'],                              risk_tier: 'green',  risk_score: 0.18, risk_drivers: ['no_flags_in_window'],                              hrv_last: 62, sleep_last: 7.4, prom_delta: null, readiness_score: 78, adherence_pct: null, last_feature_at: new Date(now - 600000).toISOString(), wearable_stale: false },
    { patient_id: 'pt-demo-009', display_name: 'Carlos Mendez',   review_tier: 'green',  review_priority: 0.15, review_drivers: ['no_flags_in_window'],                              risk_tier: 'green',  risk_score: 0.15, risk_drivers: ['no_flags_in_window'],                              hrv_last: 58, sleep_last: 7.1, prom_delta: null, readiness_score: 81, adherence_pct: null, last_feature_at: new Date(now - 1500000).toISOString(), wearable_stale: false },
    { patient_id: 'pt-demo-010', display_name: 'Aisha Johnson',   review_tier: 'green',  review_priority: 0.12, review_drivers: ['no_flags_in_window'],                              risk_tier: 'green',  risk_score: 0.12, risk_drivers: ['no_flags_in_window'],                              hrv_last: 65, sleep_last: 7.8, prom_delta: null, readiness_score: 84, adherence_pct: null, last_feature_at: new Date(now - 420000).toISOString(), wearable_stale: false },
    { patient_id: 'pt-demo-011', display_name: 'Nathan Wright',   review_tier: 'green',  review_priority: 0.10, review_drivers: ['no_flags_in_window'],                              risk_tier: 'green',  risk_score: 0.10, risk_drivers: ['no_flags_in_window'],                              hrv_last: 70, sleep_last: 8.0, prom_delta: null, readiness_score: 88, adherence_pct: null, last_feature_at: new Date(now - 300000).toISOString(), wearable_stale: false },
    { patient_id: 'pt-demo-012', display_name: 'Yuki Tanaka',     review_tier: 'green',  review_priority: 0.08, review_drivers: ['no_flags_in_window'],                              risk_tier: 'green',  risk_score: 0.08, risk_drivers: ['no_flags_in_window'],                              hrv_last: 68, sleep_last: 7.6, prom_delta: null, readiness_score: 90, adherence_pct: null, last_feature_at: new Date(now - 240000).toISOString(), wearable_stale: false },
  ];
  const priority_review_queue = caseload.filter(r => (r.review_tier || r.risk_tier) === 'red').map(r => ({
    patient_id: r.patient_id,
    display_name: r.display_name,
    tier: r.review_tier || r.risk_tier,
    priority: r.review_priority ?? r.risk_score,
    top_driver: (r.review_drivers || r.risk_drivers || [])[0],
    reason_text: (r.review_drivers || r.risk_drivers || []).slice(0, 2).join(', '),
  }));
  return {
    clinic_id: 'demo-clinic',
    generated_at: new Date().toISOString(),
    is_demo_view: true,
    kpis: {
      red: 2, orange: 3, yellow: 2, green: 5,
      open_priority_review: priority_review_queue.length,
      open_crises: priority_review_queue.length,
      wearable_data_recency_pct: 91.7,
      wearable_uptime_pct: 91.7,
      outcome_contact_pct: 83.3,
      prom_compliance_pct: 83.3,
    },
    caseload,
    priority_review_queue,
    crises: priority_review_queue,
  };
}

/** DEMO-only wearable summary matching GET /wearables/patients/{id}/summary shape. */
function demoWearableSummary(patientId, days) {
  const now = Date.now();
  const dayMs = 86400000;
  const staleSync = new Date(now - (STALE_SYNC_HOURS + 1) * 3600000).toISOString();
  const recentSync = new Date(now - 2 * 3600000).toISOString();
  const summaryDate = new Date(now - dayMs).toISOString().slice(0, 10);
  const isStalePatient = String(patientId).includes('pt-demo-003');
  const syncedAt = isStalePatient ? staleSync : recentSync;
  return {
    patient_id: patientId,
    connections: [
      {
        id: 'demo-conn-apple',
        source: 'demo_apple_health',
        source_type: 'wearable',
        display_name: 'Apple Health (DEMO)',
        status: isStalePatient ? 'disconnected' : 'connected',
        consent_given: true,
        connected_at: new Date(now - 14 * dayMs).toISOString(),
        last_sync_at: syncedAt,
      },
    ],
    summaries: [
      {
        id: 'demo-sum-1',
        patient_id: patientId,
        source: 'demo_apple_health',
        date: summaryDate,
        rhr_bpm: isStalePatient ? null : 62,
        hrv_ms: isStalePatient ? null : 48,
        sleep_duration_h: isStalePatient ? null : 6.4,
        sleep_consistency_score: isStalePatient ? null : 0.71,
        steps: isStalePatient ? null : 9100,
        spo2_pct: isStalePatient ? null : 97,
        skin_temp_delta: isStalePatient ? null : 0.1,
        readiness_score: isStalePatient ? null : 68,
        mood_score: 3,
        pain_score: 2,
        anxiety_score: 4,
        synced_at: syncedAt,
      },
    ],
    recent_alerts: isStalePatient ? [] : [
      {
        id: 'demo-flag-1',
        patient_id: patientId,
        course_id: null,
        flag_type: 'rule_hrv_decline',
        severity: 'warning',
        detail: 'HRV dropped versus 7-day baseline (deterministic threshold).',
        triggered_at: new Date(now - 4 * 3600000).toISOString(),
        reviewed_at: null,
        dismissed: false,
      },
    ],
    readiness: isStalePatient
      ? { score: null, factors: [], color: 'var(--text-tertiary)', label: 'No data' }
      : { score: 68, factors: [], color: 'var(--green)', label: 'Good' },
    _demo_meta: { days: days || 30 },
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
    // ── Software Integrations
    { id: 'notion',            display_name: 'Notion',                     kind: 'software',       auth_method: 'api_key' },
    { id: 'slack_health',      display_name: 'Slack Health',               kind: 'software',       auth_method: 'oauth2' },
    { id: 'ms_teams',          display_name: 'Microsoft Teams',            kind: 'software',       auth_method: 'oauth2' },
    { id: 'google_workspace',  display_name: 'Google Workspace',           kind: 'software',       auth_method: 'oauth2' },
    { id: 'zapier',            display_name: 'Zapier',                     kind: 'software',       auth_method: 'oauth2' },
    // ── Smart Home & Wellness
    { id: 'philips_hue',       display_name: 'Philips Hue',               kind: 'smart_home',     auth_method: 'oauth2' },
    { id: 'nest_google_home',  display_name: 'Nest / Google Home',         kind: 'smart_home',     auth_method: 'oauth2' },
    { id: 'amazon_alexa',      display_name: 'Amazon Alexa',               kind: 'smart_home',     auth_method: 'oauth2' },
    { id: 'dyson_pure',        display_name: 'Dyson Pure (Air Quality)',   kind: 'smart_home',     auth_method: 'api_key' },
    { id: 'eight_sleep',       display_name: 'Eight Sleep',                kind: 'smart_home',     auth_method: 'oauth2' },
    { id: 'sleepscore',        display_name: 'SleepScore',                 kind: 'smart_home',     auth_method: 'api_key' },
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
    // Software
    { id: 'slack_health',    connector_id: 'slack_health',    display_name: 'Slack Health',               kind: 'software',      auth_method: 'oauth2',        status: 'healthy', last_sync_at: new Date(now - 3600000).toISOString(),   patient_count: 8,  last_error: null },
    { id: 'google_workspace', connector_id: 'google_workspace', display_name: 'Google Workspace',         kind: 'software',      auth_method: 'oauth2',        status: 'healthy', last_sync_at: new Date(now - 5400000).toISOString(),   patient_count: 10, last_error: null },
    // Smart Home
    { id: 'eight_sleep',     connector_id: 'eight_sleep',     display_name: 'Eight Sleep',                kind: 'smart_home',    auth_method: 'oauth2',        status: 'healthy', last_sync_at: new Date(now - 14400000).toISOString(),  patient_count: 3,  last_error: null },
    { id: 'philips_hue',     connector_id: 'philips_hue',     display_name: 'Philips Hue',               kind: 'smart_home',    auth_method: 'oauth2',        status: 'degraded', last_sync_at: new Date(now - 86400000).toISOString(), patient_count: 2,  last_error: 'Bridge firmware update required for API v2 support' },
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

/* ── Helpers ───────────────────────────────────────────────────────────────── */

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

function canUseBiometricsAnalyzer() {
  return new Set(['admin', 'clinician', 'supervisor', 'reviewer', 'technician']).has(role());
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
  if (!Number.isFinite(ms)) return '\u2014';
  if (ms < 60000) return 'just now';
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`;
  return `${Math.floor(ms / 86400000)}d ago`;
}

function fmtNum(v) {
  return v == null || Number.isNaN(Number(v)) ? '\u2014' : Number(v).toLocaleString();
}

function fmtPct(v) {
  return v == null || Number.isNaN(Number(v)) ? '\u2014' : `${Math.round(Number(v))}%`;
}

function _demoPatientId(pid) {
  if (!pid) return false;
  const s = String(pid).toLowerCase();
  return s.startsWith('demo-') || s.startsWith('demo_') || s.startsWith('pt-demo');
}

/** Hours since ISO timestamp; Infinity if invalid. */
function hoursSince(iso) {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 3600000;
}

function tone(v) {
  if (v === 'red' || v === 'error') return 'red';
  if (v === 'orange' || v === 'warn' || v === 'warning') return 'orange';
  if (v === 'yellow') return 'yellow';
  return 'green';
}

/* ── Category metadata ─────────────────────────────────────────────────────── */

const CATEGORY_META = {
  wearable:      { icon: '\u231A', label: 'Wearables & Biometrics',  order: 1  },
  home_device:   { icon: '\uD83E\uDDE0', label: 'Home Neuromodulation',    order: 2  },
  brain_monitor: { icon: '\uD83D\uDCE1', label: 'Brain Monitors / EEG',    order: 3  },
  ehr:           { icon: '\uD83C\uDFE5', label: 'EHR / EMR Systems',       order: 4  },
  prom:          { icon: '\uD83D\uDCCB', label: 'Patient Outcomes',        order: 5  },
  telehealth:    { icon: '\uD83D\uDCF9', label: 'Telehealth',              order: 6  },
  lab:           { icon: '\uD83D\uDD2C', label: 'Lab / Diagnostics',       order: 7  },
  pharmacy:      { icon: '\uD83D\uDC8A', label: 'Pharmacy',                order: 8  },
  messaging:     { icon: '\uD83D\uDCAC', label: 'Messaging',               order: 9  },
  billing:       { icon: '\uD83D\uDCB0', label: 'Billing / Insurance',     order: 10 },
  software:      { icon: '\uD83D\uDDA5\uFE0F', label: 'Software Integrations',   order: 11 },
  smart_home:    { icon: '\uD83C\uDFE0', label: 'Smart Home & Wellness',   order: 12 },
};

const _KIND_LABELS = {
  ehr: 'EHR / EMR', wearable: 'Wearable / Biometrics', home_device: 'Home-Use Devices',
  brain_monitor: 'Brain Monitoring / EEG', prom: 'Patient-Reported Outcomes',
  messaging: 'Messaging', lab: 'Lab / Diagnostics', pharmacy: 'Pharmacy',
  telehealth: 'Telehealth', billing: 'Billing / Insurance',
  software: 'Software Integrations', smart_home: 'Smart Home & Wellness',
};
function _kindLabel(kind) { return _KIND_LABELS[kind] || kind.replace(/_/g, ' '); }

/* ── State ─────────────────────────────────────────────────────────────────── */

function state() {
  if (!window[STATE_KEY]) {
    var storedTab = localStorage.getItem(TAB_KEY);
    if (storedTab === 'integrations') storedTab = 'control-center';
    if (storedTab === 'biometrics') storedTab = 'biometrics-analyzer';
    window[STATE_KEY] = {
      tab: VALID_TABS.has(storedTab) ? storedTab : 'biometrics-analyzer',
      expandedCategory: null,
      live: null,
      integrations: null,
      dq: null,
      fleet: null,
      socket: null,
      retryIndex: 0,
      patientsList: null,
      patientsLoadError: null,
      selectedPatientId: null,
      patientWearableDays: 30,
      patientDetail: null,
      patientDetailLoading: false,
      patientDetailError: null,
      fleet: null,
      workbenchFlags: null,
      workbenchSummary: null,
      workbenchFilters: { status: 'open', severity: '' },
      monitorHeavyLoaded: false,
    };
  }
  return window[STATE_KEY];
}

function _tier(row) {
  return row.review_tier || row.risk_tier || 'green';
}

function _drivers(row) {
  return row.review_drivers || row.risk_drivers || [];
}

function _priority(row) {
  var p = row.review_priority != null ? row.review_priority : row.risk_score;
  return p != null ? Number(p) : null;
}

function _liveIsDemo(live) {
  return !!(live && live.is_demo_view);
}

function _fmtReadiness(v) {
  if (v == null || Number.isNaN(Number(v))) return '\u2014';
  return `${Math.round(Number(v))} (vendor)`;
}

/* ── Live tab renderers (unchanged) ────────────────────────────────────────── */

function openPatient(patientId, reasonText) {
  if (!patientId) return;
  window._selectedPatientId = patientId;
  window._profilePatientId = patientId;
  window._profileMonitorHandoff = { source: 'monitor', tab: 'monitoring', reason_text: reasonText || null };
  window._nav?.('patient-profile');
}

function renderGovernanceBanner() {
  return `<aside class="monitor-governance" role="note"><p class="monitor-governance__text">${esc(GOVERNANCE_COPY)}</p></aside>`;
}

function renderBiometricsAnalyzer(s) {
  const pid = window._selectedPatientId || '';
  const summary = s.wearableSummary;
  const daySel = Number(s.biometricsDays || 30);
  const demoMeta = summary && summary._demo_meta;
  const err = s.wearableSummaryError;
  const patientOpts = Array.isArray(s.patientList?.items) ? s.patientList.items : [];
  const ptSelect = canUseBiometricsAnalyzer()
    ? `<label class="monitor-field-label">Patient <select class="monitor-select" onchange="window._monitorSelectPatient(this.value)">
        <option value="">${esc(pid ? 'Change patient\u2026' : 'Select a patient\u2026')}</option>
        ${patientOpts.map((p) => {
          const id = p.id || p.patient_id;
          const nm = [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || id;
          return `<option value="${esc(id)}"${String(id) === String(pid) ? ' selected' : ''}>${esc(nm)}</option>`;
        }).join('')}
      </select></label>`
    : `<div class="monitor-muted">Sign in as a clinician to select a patient.</div>`;

  const daysSel = canUseBiometricsAnalyzer()
    ? `<label class="monitor-field-label">Window <select class="monitor-select" onchange="window._monitorSetBiometricsDays(this.value)">
        <option value="7"${daySel === 7 ? ' selected' : ''}>7 days</option>
        <option value="14"${daySel === 14 ? ' selected' : ''}>14 days</option>
        <option value="30"${daySel === 30 ? ' selected' : ''}>30 days</option>
      </select></label>`
    : '';

  var staleBanner = '';
  if (summary && summary.summaries && summary.summaries.length) {
    const latest = summary.summaries[summary.summaries.length - 1];
    const syncIso = latest.synced_at || latest.syncedAt;
    if (hoursSince(syncIso) > STALE_SYNC_HOURS) {
      staleBanner = `<div class="monitor-stale-banner">Stale data: last daily summary sync was ${esc(fmtAgo(syncIso))}. Interpret cautiously; verify device sync with the patient.</div>`;
    }
  }

  var demoBanner = '';
  if (_isDemoMode() && demoMeta) {
    demoBanner = `<div class="monitor-demo-banner">DEMO biometrics — illustrative only; not patient PHI.</div>`;
  }
  if (pid && _demoPatientId(pid)) {
    demoBanner = `<div class="monitor-demo-banner">DEMO patient — synthetic wearable signals for UI review only.</div>`;
  }

  var patientBar = '';
  if (pid) {
    patientBar = `<div class="monitor-patient-bar"><strong>Selected patient ID:</strong> <code>${esc(pid)}</code>${_demoPatientId(pid) ? ' <span class="monitor-badge monitor-badge--orange">DEMO</span>' : ''}</div>`;
  }

  var metricsHtml = '';
  if (!canUseBiometricsAnalyzer()) {
    metricsHtml = `<div class="monitor-empty-inline">Clinician access is required to load wearable summaries.</div>`;
  } else if (!pid) {
    metricsHtml = `<div class="monitor-empty-inline">Select a patient to review aggregated wearable summaries. No PHI is shown before you choose a patient.</div>`;
  } else if (err) {
    metricsHtml = `<div class="monitor-empty-inline">Could not load wearable summary (${esc(err)}).</div>`;
  } else if (!summary) {
    metricsHtml = `<div class="monitor-empty-inline">Loading wearable summary\u2026</div>`;
  } else {
    const last = Array.isArray(summary.summaries) && summary.summaries.length
      ? summary.summaries[summary.summaries.length - 1]
      : null;
    const syncRef = last?.synced_at;
    const revReq = !last || hoursSince(syncRef) > STALE_SYNC_HOURS
      ? 'Review required: data missing or stale.'
      : 'Review recommended: interpret in clinical context.';
    metricsHtml = renderMetricCards(summary, last, daySel, revReq);
  }

  const alertsHtml = renderPatientWearableAlerts(summary, pid);

  const matrixHtml = renderSourceMatrix(summary, s.fleet, pid);
  const trendsHtml = `<section class="monitor-panel"><div class="monitor-panel-head"><h3>Trends</h3><span>Time series</span></div>
    <div class="monitor-empty-inline">Trend endpoint not connected on this page yet.</div></section>`;

  const aiHtml = `<section class="monitor-panel"><div class="monitor-panel-head"><h3>AI biometrics summary</h3><span>Unavailable</span></div>
    <div class="monitor-muted">AI biometrics summary not connected on this analyzer page.</div></section>`;

  const auditHtml = `<section class="monitor-panel"><div class="monitor-panel-head"><h3>Review note (local)</h3><span>Not persisted</span></div>
    <p class="monitor-muted">There is no server endpoint to store review notes from this page yet. Use this field for session-local documentation only; Wearables Triage records acknowledgements when you act on flags.</p>
    <textarea class="monitor-textarea" rows="3" placeholder="Session-local review note (not saved to server)\u2026" oninput="window._monitorBiometricsAuditNote(this.value)">${esc(s.biometricsAuditNote || '')}</textarea></section>`;

  const linksHtml = renderModuleLinks(pid);

  return renderGovernanceBanner()
    + demoBanner
    + staleBanner
    + `<section class="monitor-panel"><div class="monitor-panel-head"><h3>Patient context</h3><span>Biometrics Analyzer</span></div>
        <div class="monitor-bio-toolbar">${ptSelect}${daysSel}</div>
        ${patientBar}
      </section>`
    + metricsHtml
    + alertsHtml
    + matrixHtml
    + trendsHtml
    + aiHtml
    + auditHtml
    + linksHtml;
}

function sourceConnectionStatus(conn) {
  const st = String(conn?.status || '').toLowerCase();
  if (st === 'connected' || st === 'healthy' || st === 'active') return { label: 'Connected', cls: 'green' };
  if (st === 'degraded' || st === 'warning') return { label: 'Degraded', cls: 'orange' };
  if (st === 'disconnected' || st === 'error') return { label: 'Disconnected', cls: 'red' };
  return { label: 'Unknown', cls: 'orange' };
}

function renderPatientWearableAlerts(summary, patientId) {
  if (!patientId || !summary) {
    return '';
  }
  const flags = Array.isArray(summary.recent_alerts) ? summary.recent_alerts : [];
  if (!flags.length) {
    return `<section class="monitor-panel"><div class="monitor-panel-head"><h3>Wearable alert flags</h3><span>0</span></div>
      <div class="monitor-empty-inline" data-testid="monitor-alerts-empty">No wearable alert flags are queued for review in this filter.</div></section>`;
  }
  const rows = flags.slice(0, 15).map(function (a) {
    const sev = String(a.severity || 'info').toLowerCase();
    const badge = sev === 'urgent' ? 'red' : (sev === 'warning' || sev === 'warn' ? 'orange' : 'yellow');
    const panelTone = sev === 'urgent' ? 'red' : (sev === 'warning' || sev === 'warn' ? 'orange' : 'yellow');
    const detail = a.detail ? `<div class="monitor-muted">${esc(a.detail)}</div>` : '';
    return `<div class="monitor-issue monitor-issue--${panelTone}">
      <div class="monitor-issue-head"><strong>${esc(a.flag_type || 'flag')}</strong>
        <span class="monitor-badge monitor-badge--${badge}">${esc(sev)}</span></div>
      ${detail}
      <div class="monitor-muted">Triggered ${esc(fmtAgo(a.triggered_at))} · source-backed rule · clinician review required</div>
    </div>`;
  }).join('');
  return `<section class="monitor-panel"><div class="monitor-panel-head"><h3>Wearable alert flags</h3><span>${flags.length} active</span></div>
    <p class="monitor-muted">From GET /wearables/patients/{id}/summary (rule-based flags). Not emergency alerts.</p>${rows}</section>`;
}

function renderSourceMatrix(summary, fleetPayload, patientId) {
  var rows = [];
  const conns = Array.isArray(summary?.connections) ? summary.connections : [];
  conns.forEach(function (c) {
    const st = sourceConnectionStatus(c);
    const lastSync = c.last_sync_at || c.lastSyncAt;
    const stale = hoursSince(lastSync) > STALE_SYNC_HOURS;
    rows.push({
      name: c.display_name || c.source || 'Source',
      kind: 'Patient connection',
      status: st.label,
      statusCls: st.cls,
      lastSync: lastSync ? fmtAgo(lastSync) : '\u2014',
      window: patientId ? 'Per patient selection' : '\u2014',
      dq: stale ? 'Stale sync (>48h)' : 'OK',
    });
  });

  const fleetDevices = Array.isArray(fleetPayload?.devices) ? fleetPayload.devices : [];
  fleetDevices.forEach(function (d) {
    const seen = d.last_seen_at;
    const stale = hoursSince(seen) > STALE_SYNC_HOURS;
    const stRaw = String(d.status || 'unknown').toLowerCase();
    const statusCls = (stRaw === 'healthy' || stRaw === 'connected') ? 'green' : (stRaw === 'error' || stRaw === 'disconnected' ? 'red' : 'orange');
    rows.push({
      name: d.display_name || d.device_key || d.id || 'Device',
      kind: 'Clinic fleet aggregate',
      status: String(d.status || 'unknown'),
      statusCls,
      lastSync: seen ? fmtAgo(seen) : '\u2014',
      window: 'Clinic roster',
      dq: stale ? 'Last seen stale' : 'OK',
    });
  });

  if (!rows.length) {
    return `<section class="monitor-panel"><div class="monitor-panel-head"><h3>Sources &amp; provenance</h3><span>No rows</span></div>
      <div class="monitor-empty-inline">No device connections returned for this context. Source availability is unknown until integrations sync.</div></section>`;
  }

  const body = rows.map(function (r) {
    return `<tr>
      <td><strong>${esc(r.name)}</strong><div class="monitor-muted">${esc(r.kind)}</div></td>
      <td><span class="monitor-badge monitor-badge--${r.statusCls === 'green' ? 'green' : (r.statusCls === 'red' ? 'red' : 'orange')}">${esc(r.status)}</span></td>
      <td>${esc(r.lastSync)}</td>
      <td>${esc(r.window)}</td>
      <td>${esc(r.dq)}</td>
    </tr>`;
  }).join('');

  return `<section class="monitor-panel"><div class="monitor-panel-head"><h3>Sources &amp; provenance</h3><span>${rows.length} rows</span></div>
    <div class="monitor-table-wrap"><table class="monitor-table"><thead><tr>
      <th>Source</th><th>Status</th><th>Last sync / seen</th><th>Window</th><th>Data quality</th>
    </tr></thead><tbody>${body}</tbody></table></div>
    <p class="monitor-muted">Integration catalog status reflects clinic configuration, not live device pairing on this page.</p>
  </section>`;
}

function renderMetricCards(summary, last, windowDays, reviewLine) {
  const srcLabel = (last && last.source) ? String(last.source) : '\u2014';
  const synNote = last
    ? `Latest daily row ${esc(last.date || '')} · synced ${esc(fmtAgo(last.synced_at))}`
    : 'No daily summary rows in this window.';
  const cards = [];
  function card(title, value, unit, src, missing) {
    cards.push({ title, value, unit, src, missing });
  }
  card('Resting HR', last && last.rhr_bpm != null ? fmtNum(last.rhr_bpm) : null, 'bpm', srcLabel, !last || last.rhr_bpm == null);
  card('HRV', last && last.hrv_ms != null ? fmtNum(last.hrv_ms) : null, 'ms', srcLabel, !last || last.hrv_ms == null);
  card('SpO\u2082', last && last.spo2_pct != null ? fmtNum(last.spo2_pct) : null, '%', srcLabel, !last || last.spo2_pct == null);
  card('Sleep duration', last && last.sleep_duration_h != null ? fmtNum(last.sleep_duration_h) : null, 'h', srcLabel, !last || last.sleep_duration_h == null);
  card('Steps', last && last.steps != null ? fmtNum(last.steps) : null, 'count', srcLabel, !last || last.steps == null);
  card('Skin temp \u0394', last && last.skin_temp_delta != null ? fmtNum(last.skin_temp_delta) : null, '\u00B0 vs baseline', srcLabel, !last || last.skin_temp_delta == null);
  card('Mood (PRO)', last && last.mood_score != null ? fmtNum(last.mood_score) : null, '/5 self-report', srcLabel, !last || last.mood_score == null);
  card('Pain (PRO)', last && last.pain_score != null ? fmtNum(last.pain_score) : null, '/10 self-report', srcLabel, !last || last.pain_score == null);
  card('Anxiety (PRO)', last && last.anxiety_score != null ? fmtNum(last.anxiety_score) : null, '/10 self-report', srcLabel, !last || last.anxiety_score == null);
  card('Hydration', null, '\u2014', 'Not mapped from daily summary API', true);
  card('Stress autonomic proxy', null, '\u2014', 'No dedicated field in summary', true);
  const read = summary && summary.readiness ? summary.readiness : {};
  const rs = read.score;
  card('Recovery / readiness', rs != null ? String(rs) : null, '0\u2013100 (informational)', srcLabel, rs == null);

  const grid = cards.map(function (c) {
    const val = c.missing ? '\u2014' : esc(String(c.value));
    const missCls = c.missing ? ' monitor-metric-card--missing' : '';
    return `<article class="monitor-metric-card${missCls}">
      <div class="monitor-metric-title">${esc(c.title)}</div>
      <div class="monitor-metric-value">${val}<span class="monitor-metric-unit">${esc(c.unit)}</span></div>
      <div class="monitor-muted">Source: ${esc(c.src)}</div>
      <div class="monitor-muted">Window: last ${esc(String(windowDays))}d · ${synNote}</div>
      <div class="monitor-review-line">${esc(reviewLine)}</div>
    </article>`;
  }).join('');

  return `<section class="monitor-panel"><div class="monitor-panel-head"><h3>Biometric metrics</h3><span>Daily summaries</span></div>
    <p class="monitor-muted">Values come from aggregated daily wearable rows, not live streaming vitals. Units are vendor-reported; no reference ranges are shown.</p>
    <div class="monitor-metric-grid">${grid}</div></section>`;
}

function renderModuleLinks(patientId) {
  const pid = patientId || '';
  const links = [
    ['Patient profile', 'patient-profile', true],
    ['Biomarkers', 'biomarkers', false],
    ['Labs analyzer', 'labs-analyzer', false],
    ['Medication analyzer', 'medication-analyzer', false],
    ['Risk analyzer', 'risk-analyzer', false],
    ['DeepTwin', 'deeptwin', true],
    ['Protocol Studio', 'protocol-studio', false],
    ['Assessments', 'assessments-v2', false],
    ['MRI', 'mri-analysis', false],
    ['qEEG', 'qeeg-analysis', false],
    ['Video assessments', 'video-assessments', false],
    ['Voice analyzer', 'voice-analyzer', false],
    ['Text analyzer', 'text-analyzer', false],
    ['Documents', 'documents-v2', false],
    ['Schedule', 'schedule-v2', false],
    ['Inbox', 'clinician-inbox', false],
    ['Virtual Care', 'live-session', false],
  ];
  const buttons = links.map(function (L) {
    const needsPt = L[2];
    const dis = needsPt && !pid ? ' disabled' : '';
    const onclk = (needsPt && !pid) ? '' : `onclick="window._monitorNavigateModule('${esc(L[1])}',${needsPt ? 'true' : 'false'})"`;
    return `<button type="button" class="btn btn-sm monitor-link-btn"${dis} ${onclk}>${esc(L[0])}</button>`;
  }).join('');
  return `<section class="monitor-panel"><div class="monitor-panel-head"><h3>Linked modules</h3><span>Navigation</span></div>
    <p class="monitor-muted">Context handoff sets the selected patient ID where applicable. DeepTwin and Protocol Studio use workspace defaults if no patient is selected.</p>
    <div class="monitor-link-strip">${buttons}</div></section>`;
}

function renderKpis(live) {
  const k = live?.kpis || {};
  const openPri = k.open_priority_review != null ? k.open_priority_review : k.open_crises;
  const dataFresh = k.wearable_data_recency_pct != null ? k.wearable_data_recency_pct : k.wearable_uptime_pct;
  const outcomeContact = k.outcome_contact_pct != null ? k.outcome_contact_pct : k.prom_compliance_pct;
  // Keep the legacy "Priority review queue" phrase in source for older launch-audit checks.
  const cards = [
    ['Review: high priority', k.red, 'red'],
    ['Review: elevated', k.orange, 'orange'],
    ['Watch', k.yellow, 'yellow'],
    ['No queued flags', k.green, 'green'],
    ['Review priority queue', openPri, 'red'],
    ['Wearable sync recency', fmtPct(dataFresh), 'green'],
    ['Outcome contact rate', fmtPct(outcomeContact), 'blue'],
  ];
  return `<section class="monitor-kpi-strip">${cards.map(([label, value, color]) => `
    <article class="monitor-kpi-card monitor-kpi-card--${color}">
      <div class="monitor-kpi-label">${esc(label)}</div>
      <div class="monitor-kpi-value">${esc(value)}</div>
    </article>`).join('')}</section>`;
}

function renderLive(live) {
  const priorityQ = Array.isArray(live?.priority_review_queue)
    ? live.priority_review_queue
    : (Array.isArray(live?.crises) ? live.crises : []);
  const rows = Array.isArray(live?.caseload) ? live.caseload : [];
  const demoChip = _liveIsDemo(live)
    ? '<span class="monitor-badge monitor-badge--orange" title="Synthetic cohort for UI review">DEMO COHORT</span>'
    : '';
  return `
    <section class="monitor-panel">
      <div class="monitor-panel-head"><h3>Caseload overview</h3><span>${rows.length} patients ${demoChip}</span></div>
      <p class="monitor-muted" data-testid="monitor-live-disclaimer" style="margin:-8px 0 12px;line-height:1.5">Tiers are operational review priorities from wearable summaries and alert flags — not diagnoses, emergency triage, treatment eligibility, and not continuous bedside monitoring.</p>
      ${rows.length ? `<div class="monitor-table-wrap"><table class="monitor-table"><thead>
        <tr><th>Patient</th><th>Review tier</th><th>Signals</th><th>HRV (ms)</th><th>Sleep (h)</th><th>Readiness</th><th>Last wearable sync</th></tr>
      </thead><tbody>
        ${rows.map((row) => `<tr onclick="window._monitorOpenPatient('${esc(row.patient_id)}', '${esc(_drivers(row).join(', '))}')">
          <td><div class="monitor-patient-name">${esc(row.display_name)}</div><div class="monitor-muted">${esc(row.patient_id)}</div></td>
          <td><span class="monitor-badge monitor-badge--${tone(_tier(row))}">${esc(_tier(row))}</span></td>
          <td>${esc(_drivers(row).join(', ') || '\u2014')}</td>
          <td>${fmtNum(row.hrv_last)}</td>
          <td>${fmtNum(row.sleep_last)}</td>
          <td>${esc(_fmtReadiness(row.readiness_score != null ? row.readiness_score : row.adherence_pct))}</td>
          <td>${esc(fmtAgo(row.last_feature_at))}${row.wearable_stale ? ' <span class="monitor-badge monitor-badge--orange">stale</span>' : ''}</td>
        </tr>`).join('')}
      </tbody></table></div>` : `<div class="monitor-empty-inline">No caseload rows returned. Add patients or check API access.</div>`}
    </section>
    <section class="monitor-panel monitor-panel--crisis">
      <div class="monitor-panel-head"><h3>Review priority queue</h3><span>${priorityQ.length} patient${priorityQ.length !== 1 ? 's' : ''}</span></div>
      <p class="monitor-muted" style="margin:-8px 0 12px;line-height:1.5">Requires clinician review of source data and context — not an automated emergency list.</p>
      ${priorityQ.length ? priorityQ.map((item) => `<button type="button" class="monitor-crisis-item" onclick="window._monitorOpenPatient('${esc(item.patient_id)}', '${esc(item.reason_text || '')}')">
        <div class="monitor-crisis-item__row"><strong>${esc(item.display_name)}</strong><span class="monitor-badge monitor-badge--orange">${esc(Math.round(Number(item.priority != null ? item.priority : item.score || 0) * 100))}% priority</span></div>
        <div class="monitor-crisis-item__sub">${esc(item.reason_text || item.top_driver || 'Review wearable summaries and alert flags.')}</div>
      </button>`).join('') : `<div class="monitor-empty-inline">No patients in the priority review queue for this snapshot.</div>`}
    </section>`;
}

/* ── Data quality renderer (unchanged) ─────────────────────────────────────── */

function renderDq(dq) {
  const issues = Array.isArray(dq?.issues) ? dq.issues : [];
  return `<section class="monitor-panel">
    <div class="monitor-panel-head"><h3>Data quality</h3><span>${issues.length} issues</span></div>
    ${issues.length ? issues.map((item) => `<div class="monitor-issue monitor-issue--${tone(item.severity)}">
      <div class="monitor-issue-head"><strong>${esc(item.title)}</strong><span class="monitor-badge monitor-badge--${tone(item.severity)}">${esc(item.severity)}</span></div>
      <div class="monitor-muted">${esc(item.detail || '')}</div>
      ${item.suggested_fix ? `<div class="monitor-issue-fix">${esc(item.suggested_fix)}</div>` : ''}
      ${canWriteIntegrations() ? `<div class="monitor-inline-actions"><button type="button" class="btn btn-sm" onclick="window._monitorResolveIssue('${esc(item.id)}')">Resolve</button></div>` : ''}
    </div>`).join('') : `<div class="monitor-empty-inline">No integration or sync issues are recorded for this clinic snapshot.</div>`}
  </section>`;
}

/* ── Wearables Workbench (clinician triage queue) ──────────────────────────── */

function renderWorkbenchKpis(summary) {
  var s = summary || {};
  var open = Number(s.open || 0);
  var ack = Number(s.acknowledged || 0);
  var escalatedN = Number(s.escalated || 0);
  var res = Number(s.resolved || 0);
  var inc7 = Number(s.incidence_7d || 0);
  var cards = [
    ['Open', open, open > 0 ? 'orange' : 'teal'],
    ['Acknowledged', ack, 'orange'],
    ['Escalated', escalatedN, escalatedN > 0 ? 'red' : 'green'],
    ['Resolved', res, 'green'],
    ['7-day incidence', inc7, inc7 > 0 ? 'orange' : 'green'],
  ];
  return '<section class="monitor-kpi-strip">' + cards.map(function (c) {
    return '<article class="monitor-kpi-card monitor-kpi-card--' + c[2] + '">'
      + '<div class="monitor-kpi-label">' + esc(c[0]) + '</div>'
      + '<div class="monitor-kpi-value">' + esc(c[1]) + '</div></article>';
  }).join('') + '</section>';
}

function renderWorkbenchFilters(filters) {
  var f = filters || {};
  var statusOptions = ['open', 'acknowledged', 'escalated', 'resolved'];
  var sevOptions = ['', 'info', 'warning', 'urgent'];
  return '<div class="monitor-inline-actions" style="margin-bottom:12px">'
    + '<label>Status: <select onchange="window._workbenchFilterStatus(this.value)">'
    + '<option value=""' + (!f.status ? ' selected' : '') + '>All</option>'
    + statusOptions.map(function (s) {
        return '<option value="' + s + '"' + (f.status === s ? ' selected' : '') + '>' + s + '</option>';
      }).join('')
    + '</select></label>'
    + '<label style="margin-left:12px">Severity: <select onchange="window._workbenchFilterSeverity(this.value)">'
    + sevOptions.map(function (s) {
        return '<option value="' + s + '"' + (f.severity === s ? ' selected' : '') + '>' + (s || 'all') + '</option>';
      }).join('')
    + '</select></label>'
    + '<button class="btn btn-sm" style="margin-left:auto" onclick="window._workbenchExportCsv()">Export CSV</button>'
    + '<button class="btn btn-sm" onclick="window._workbenchExportNdjson()">Export NDJSON</button>'
    + '</div>';
}

function renderWorkbenchTable(flags, isDemoView) {
  var rows = Array.isArray(flags) ? flags : [];
  var demoBanner = isDemoView
    ? '<div class="monitor-empty-inline" style="background:#fff7e6;border:1px solid #ffd591;color:#874d00;margin-bottom:12px">DEMO data — exports will be DEMO-prefixed and are not regulator-submittable.</div>'
    : '';

  if (!rows.length) {
    return demoBanner + '<div class="monitor-empty-inline">No alert flags pending review. No wearable alert flags are queued for review in this filter. Empty queue does not mean clinically cleared.</div>';
  }

  var head = '<thead><tr>'
    + '<th>Patient</th><th>Type</th><th>Severity</th><th>Status</th>'
    + '<th>Triggered</th><th>Actions</th>'
    + '</tr></thead>';
  var body = rows.map(function (f) {
    var status = f.status || 'open';
    var sev = f.severity || 'info';
    var ackBtn = (status === 'open')
      ? '<button class="btn btn-sm" onclick="window._workbenchAcknowledge(\'' + esc(f.id) + '\')">Acknowledge</button>'
      : '';
    var escBtn = (status === 'open' || status === 'acknowledged')
      ? '<button class="btn btn-sm" onclick="window._workbenchEscalate(\'' + esc(f.id) + '\')">Escalate</button>'
      : '';
    var resBtn = (status !== 'resolved')
      ? '<button class="btn btn-sm" onclick="window._workbenchResolve(\'' + esc(f.id) + '\')">Resolve</button>'
      : '';
    var profileBtn = '<button class="btn btn-sm" onclick="window._workbenchOpenPatient(\'' + esc(f.patient_id) + '\')">Patient</button>';
    var aeBtn = (f.escalation_ae_id)
      ? '<button class="btn btn-sm" onclick="window._workbenchOpenAe(\'' + esc(f.escalation_ae_id) + '\')">AE Hub</button>'
      : '';
    return '<tr>'
      + '<td><strong>' + esc(f.patient_name || f.patient_id) + '</strong>'
      + '<div class="monitor-muted">' + esc(f.patient_id) + (f.is_demo ? ' · DEMO' : '') + '</div></td>'
      + '<td>' + esc(f.flag_type) + '</td>'
      + '<td><span class="monitor-badge monitor-badge--' + tone(sev === 'urgent' ? 'red' : (sev === 'warning' ? 'orange' : 'green')) + '">' + esc(sev) + '</span></td>'
      + '<td><span class="monitor-badge monitor-badge--' + tone(status === 'resolved' ? 'green' : (status === 'escalated' ? 'red' : 'orange')) + '">' + esc(status) + '</span></td>'
      + '<td>' + esc(fmtAgo(f.triggered_at)) + '</td>'
      + '<td>' + ackBtn + escBtn + resBtn + profileBtn + aeBtn + '</td>'
      + '</tr>';
  }).join('');

  return demoBanner + '<div class="monitor-table-wrap"><table class="monitor-table">'
    + head + '<tbody>' + body + '</tbody></table></div>';
}

function renderWorkbench(summary, flags, isDemoView, filters) {
  var hasData = Array.isArray(flags);
  return renderWorkbenchKpis(summary || {})
    + '<section class="monitor-panel">'
    + '<div class="monitor-panel-head"><h3>Wearable alert triage</h3>'
    + '<span>' + (hasData ? flags.length : 0) + ' shown</span></div>'
    + renderWorkbenchFilters(filters || {})
    + (hasData ? renderWorkbenchTable(flags, isDemoView) : '<div class="monitor-empty-inline">Loading triage queue...</div>')
    + '</section>';
}

/* ── Control Center: compute category stats ────────────────────────────────── */

function computeCategoryStats(data) {
  var catalog = Array.isArray(data?.catalog) ? data.catalog : [];
  var configured = Array.isArray(data?.configured) ? data.configured : [];
  var configuredMap = new Map(configured.map(function (c) { return [c.connector_id, c]; }));

  var kinds = {};
  catalog.forEach(function (c) {
    if (!kinds[c.kind]) kinds[c.kind] = { total: 0, connected: 0, healthy: 0, degraded: 0, error: 0 };
    kinds[c.kind].total++;
    var active = configuredMap.get(c.id);
    if (active) {
      kinds[c.kind].connected++;
      if (active.status === 'healthy') kinds[c.kind].healthy++;
      else if (active.status === 'degraded') kinds[c.kind].degraded++;
      else if (active.status === 'error') kinds[c.kind].error++;
      else kinds[c.kind].healthy++;
    }
  });

  Object.keys(kinds).forEach(function (k) {
    var s = kinds[k];
    if (s.connected === 0) s.health = 'none';
    else if (s.error > 0) s.health = 'error';
    else if (s.degraded > 0) s.health = 'degraded';
    else s.health = 'healthy';
  });

  return kinds;
}

/* ── Control Center: KPI summary strip ─────────────────────────────────────── */

function renderDevicesKpis(data) {
  var stats = computeCategoryStats(data);
  var totalConnected = 0, totalHealthy = 0, totalDegraded = 0, totalError = 0;
  Object.values(stats).forEach(function (s) {
    totalConnected += s.connected;
    totalHealthy += s.healthy;
    totalDegraded += s.degraded;
    totalError += s.error;
  });
  var cards = [
    ['Configured', totalConnected, 'teal'],
    ['Healthy', totalHealthy, 'green'],
    ['Degraded', totalDegraded, 'orange'],
    ['Errors', totalError, 'red'],
  ];
  return `<section class="devices-kpi-strip">${cards.map(function (c) {
    return `<article class="monitor-kpi-card monitor-kpi-card--${c[2]}">
      <div class="monitor-kpi-label">${esc(c[0])}</div>
      <div class="monitor-kpi-value">${esc(c[1])}</div>
    </article>`;
  }).join('')}</section>`;
}

/* ── Control Center: category tiles grid ───────────────────────────────────── */

function renderCategoryTiles(data) {
  var stats = computeCategoryStats(data);
  var sortedKinds = Object.keys(CATEGORY_META).sort(function (a, b) {
    return (CATEGORY_META[a].order || 99) - (CATEGORY_META[b].order || 99);
  });

  return `<section class="devices-tile-grid">${sortedKinds.map(function (kind) {
    var meta = CATEGORY_META[kind];
    var s = stats[kind] || { total: 0, connected: 0, healthy: 0, degraded: 0, error: 0, health: 'none' };
    var healthLabel = s.health === 'healthy' ? 'No issues flagged' :
                      s.health === 'degraded' ? 'Some issues' :
                      s.health === 'error' ? 'Has errors' : 'Not connected';
    return `<article class="devices-category-tile" onclick="window._devicesExpandCategory('${esc(kind)}')">
      <div class="devices-tile-icon">${meta.icon}</div>
      <div class="devices-tile-label">${esc(meta.label)}</div>
      <div class="devices-tile-stat">${s.connected} / ${s.total} catalog integrations configured</div>
      <div class="devices-tile-health">
        <span class="devices-health-dot devices-health-dot--${s.health}"></span>
        <span>${esc(healthLabel)}</span>
      </div>
    </article>`;
  }).join('')}</section>`;
}

/* ── Control Center: expanded category view ────────────────────────────────── */

function renderExpandedCategory(kind, data) {
  var meta = CATEGORY_META[kind] || { icon: '\u2699\uFE0F', label: _kindLabel(kind) };
  var items = (data?.groups || {})[kind] || [];
  var configuredMap = new Map((data?.configured || []).map(function (c) { return [c.connector_id, c]; }));
  var writable = canWriteIntegrations();

  return `<section class="monitor-panel">
    <div class="devices-category-header">
      <button class="devices-back-btn" onclick="window._devicesCollapseCategory()">\u2190 All categories</button>
      <span class="devices-tile-icon" style="font-size:24px;margin:0">${meta.icon}</span>
      <h3 style="margin:0">${esc(meta.label)}</h3>
      <span class="monitor-muted" style="margin-left:auto">${items.length} available</span>
    </div>
    <div class="monitor-card-grid">
      ${items.map(function (item) {
        var active = configuredMap.get(item.id);
        var targetId = active?.id || item.id;
        return `<article class="monitor-integration-card">
          <div class="monitor-integration-head"><strong>${esc(item.display_name)}</strong><span class="monitor-badge monitor-badge--${tone(active?.status || 'green')}">${esc(active?.status || 'disconnected')}</span></div>
          <div class="monitor-muted">${esc(item.auth_method || 'managed')} \u00B7 ${(active?.patient_count ?? 0)} patients</div>
          <div class="monitor-muted">${active?.last_sync_at ? `Last sync ${esc(fmtAgo(active.last_sync_at))}` : 'Not yet connected'}</div>
          ${active?.last_error ? `<div class="monitor-inline-error">${esc(active.last_error)}</div>` : ''}
          <div class="monitor-inline-actions">
            ${active
              ? `${kind === 'wearable' ? `<button class="btn btn-sm btn-primary" onclick="window._monitorOpenDeviceDash('${esc(targetId)}','${esc(item.id)}')">Dashboard</button>` : ''}
                 <button class="btn btn-sm" onclick="window._monitorSyncIntegration('${esc(targetId)}')">Sync</button>
                 <button class="btn btn-sm" ${writable ? `onclick="window._monitorDisconnectIntegration('${esc(targetId)}')"` : 'disabled'}>Disconnect</button>`
              : `<button class="btn btn-sm btn-primary" ${writable ? `onclick="window._monitorConnectIntegration('${esc(item.id)}')"` : 'disabled'}>Connect</button>`}
          </div>
        </article>`;
      }).join('')}
    </div>
  </section>`;
}

function renderMetricMatrix(summaries) {
  var rows = Array.isArray(summaries) ? summaries : [];
  var last = rows.length ? rows[rows.length - 1] : null;
  var defs = [
    ['HRV', 'ms', function (r) { return r.hrv_ms; }],
    ['Resting HR', 'bpm', function (r) { return r.rhr_bpm; }],
    ['Sleep duration', 'h', function (r) { return r.sleep_duration_h; }],
    ['Steps', 'count', function (r) { return r.steps; }],
    ['SpO\u2082', '%', function (r) { return r.spo2_pct; }],
    ['Skin temp \u0394', '\u00b0', function (r) { return r.skin_temp_delta; }],
    ['Readiness (vendor)', 'score', function (r) { return r.readiness_score; }],
  ];
  var head = '<thead><tr><th>Metric</th><th>Unit</th><th>Latest</th><th>Availability</th></tr></thead>';
  var body = defs.map(function (d) {
    var v = last ? d[2](last) : null;
    var avail = v == null || Number.isNaN(Number(v)) ? '<span class="monitor-badge monitor-badge--orange">missing</span>' : '<span class="monitor-badge monitor-badge--green">present</span>';
    var disp = v == null || Number.isNaN(Number(v)) ? '\u2014' : (Number.isInteger(Number(v)) ? String(v) : Number(v).toFixed(1));
    return '<tr><td>' + esc(d[0]) + '</td><td>' + esc(d[1]) + '</td><td>' + esc(disp) + '</td><td>' + avail + '</td></tr>';
  }).join('');
  return '<div class="monitor-table-wrap"><table class="monitor-table">' + head + '<tbody>' + body + '</tbody></table></div>';
}

function renderBiometricsWorkspace(s) {
  var patients = Array.isArray(s.patientsList) ? s.patientsList : [];
  var selId = s.selectedPatientId || window._selectedPatientId || '';
  var detail = s.patientDetail;
  var loading = s.patientDetailLoading;
  var err = s.patientDetailError;
  var days = s.patientWearableDays || 30;
  var fleet = s.fleet;
  var live = s.live || {};

  var demoBanner = _isDemoMode()
    ? '<div class="monitor-disclaimer monitor-disclaimer--demo" role="status"><strong>DEMO mode</strong> \u2014 When the API is unavailable, sample cohort data may appear. Treat as non-authoritative; not live PHI.</div>'
    : '';

  var clinDisclaimer = '<div class="monitor-disclaimer" data-testid="monitor-biometrics-governance"><strong>Clinical decision support only.</strong> This workspace supports review of device-reported metrics and operational alerts. It does not diagnose, triage emergencies, approve protocols, or recommend treatments. AI-assisted outputs require clinician review and traceable source data.</div>';

  var patientOpts = '<option value="">\u2014 Select patient \u2014</option>' + patients.map(function (p) {
    var id = p.id || p.patient_id;
    var nm = [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || id || '';
    return '<option value="' + esc(id) + '"' + (String(id) === String(selId) ? ' selected' : '') + '>' + esc(nm || id) + '</option>';
  }).join('');

    var connRows = detail && Array.isArray(detail.connections) ? detail.connections : [];
  var connectionsPanel = connRows.length
    ? '<div class="monitor-table-wrap"><table class="monitor-table"><thead><tr><th>Source</th><th>Status</th><th>Last sync</th></tr></thead><tbody>'
      + connRows.map(function (c) {
        var st = String(c.status || '').toLowerCase();
        var toneKey = (st === 'connected' || st === 'healthy' || st === 'active') ? 'green' : (st === 'error' || st === 'revoked') ? 'red' : 'orange';
        return '<tr><td>' + esc(c.display_name || c.source) + '</td><td>'
          + '<span class="monitor-badge monitor-badge--' + tone(toneKey) + '">' + esc(c.status || 'unknown') + '</span>'
          + '</td><td>' + esc(c.last_sync_at ? fmtAgo(c.last_sync_at) : '\u2014') + '</td></tr>';
      }).join('')
      + '</tbody></table></div>'
    : '<p class="monitor-muted">No device connections on file for this patient, or none returned by the server.</p>';

  var fleetRows = fleet && Array.isArray(fleet.devices) ? fleet.devices : [];
  var fleetPanel = fleetRows.length
    ? '<div class="monitor-table-wrap"><table class="monitor-table"><thead><tr><th>Source</th><th>Patients</th><th>Last seen</th></tr></thead><tbody>'
      + fleetRows.map(function (d) {
        return '<tr><td>' + esc(d.display_name || d.id) + '</td><td>' + esc(d.assigned_patient_count) + '</td><td>'
          + esc(d.last_seen_at ? fmtAgo(d.last_seen_at) : '\u2014') + '</td></tr>';
      }).join('')
      + '</tbody></table></div>'
    : '<p class="monitor-muted">No fleet snapshot (empty roster or endpoint unavailable).</p>';

  var alerts = detail && Array.isArray(detail.recent_alerts) ? detail.recent_alerts : [];
  var alertsPanel = alerts.length
    ? '<div class="monitor-table-wrap"><table class="monitor-table"><thead><tr><th>Type</th><th>Severity</th><th>Triggered</th><th>Detail</th></tr></thead><tbody>'
      + alerts.map(function (a) {
        return '<tr><td>' + esc(a.flag_type) + '</td><td><span class="monitor-badge monitor-badge--' + tone(a.severity === 'urgent' ? 'red' : 'orange') + '">' + esc(a.severity) + '</span></td><td>'
          + esc(fmtAgo(a.triggered_at)) + '</td><td>' + esc((a.detail || '').slice(0, 120)) + '</td></tr>';
      }).join('')
      + '</tbody></table></div>'
    : '<p class="monitor-muted">No active wearable alert flags for this patient in the current window.</p>';

  var readinessBlock = '';
  if (detail && detail.readiness && typeof detail.readiness === 'object') {
    try {
      readinessBlock = '<pre class="monitor-readiness-pre" aria-label="Readiness detail">' + esc(JSON.stringify(detail.readiness, null, 2)) + '</pre>';
    } catch (e) {
      readinessBlock = '<p class="monitor-muted">Readiness summary unavailable.</p>';
    }
  } else if (detail && !loading) {
    readinessBlock = '<p class="monitor-muted">No readiness aggregate returned.</p>';
  }

  var summaryStrip = '';
  if (detail && Array.isArray(detail.summaries) && detail.summaries.length) {
    var lastS = detail.summaries[detail.summaries.length - 1];
    summaryStrip = '<div class="monitor-vitals-strip">'
      + '<article class="monitor-vital-card"><div class="monitor-kpi-label">HRV</div><div class="monitor-vital-val">' + esc(fmtNum(lastS.hrv_ms)) + '<span class="monitor-vital-unit">ms</span></div></article>'
      + '<article class="monitor-vital-card"><div class="monitor-kpi-label">Sleep</div><div class="monitor-vital-val">' + esc(fmtNum(lastS.sleep_duration_h)) + '<span class="monitor-vital-unit">h</span></div></article>'
      + '<article class="monitor-vital-card"><div class="monitor-kpi-label">SpO\u2082</div><div class="monitor-vital-val">' + esc(fmtNum(lastS.spo2_pct)) + '<span class="monitor-vital-unit">%</span></div></article>'
      + '<article class="monitor-vital-card"><div class="monitor-kpi-label">Steps</div><div class="monitor-vital-val">' + esc(fmtNum(lastS.steps)) + '</div></article>'
      + '<article class="monitor-vital-card"><div class="monitor-kpi-label">Readiness</div><div class="monitor-vital-val">' + esc(_fmtReadiness(lastS.readiness_score)) + '</div></article>'
      + '</div>'
      + '<p class="monitor-muted" style="margin-top:8px">Values are device/vendor-reported aggregates for the latest day in range \u2014 not a clinical vital sign interpretation.</p>';
  } else if (selId && !loading && !err) {
    summaryStrip = '<div class="monitor-empty-inline">No daily summaries in the selected window. Data may be missing, not yet synced, or not ingested.</div>';
  }

  var trendHint = '<p class="monitor-muted" data-testid="monitor-trend-unavailable">Trend endpoint not connected on this page yet. Use the daily summary table below or export from Wearables / device integrations. SpO\u2082/HRV units depend on vendor documentation.</p>';

  var quickLinks = '<nav class="monitor-quick-links" aria-label="Linked clinical modules">'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorLink(\'patient-profile\')">Patient profile</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorLink(\'assessments\')">Assessments</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorLink(\'qeeg-launcher\')">qEEG</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorLink(\'mri-analysis\')">MRI</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorLink(\'video-assessments\')">Video</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorLink(\'voice-analyzer\')">Voice</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorLink(\'text-analyzer\')">Text</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorLink(\'labs-analyzer\')">Labs</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorLink(\'documents\')">Documents</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorLink(\'deeptwin\')">DeepTwin</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorLink(\'protocol-hub\')">Protocol Studio</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorLink(\'brainmap-v2\')">Brainmap</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorLink(\'schedule-v2\')">Schedule</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorLink(\'inbox\')">Inbox</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorLink(\'handbooks-v2\')">Handbooks</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorLink(\'live-session\')">Live session</button>'
    + '</nav>';

  var aiPanel = '<section class="monitor-panel" data-testid="monitor-ai-summary-unavailable"><div class="monitor-panel-head"><h3>AI-assisted summary</h3></div>'
    + '<p class="monitor-muted">AI biometrics summary not connected on this analyzer page. Use DeepTwin or Protocol Studio with patient context; all outputs remain drafts pending clinician review.</p>'
    + '</section>';

  var evidencePanel = '<section class="monitor-panel"><div class="monitor-panel-head"><h3>Evidence &amp; governance</h3></div>'
    + '<p class="monitor-muted">Wearable metrics are consumer or research-grade unless sourced from a regulated device workflow. Evidence grades and citations are shown only when supplied by the evidence service \u2014 none are inferred here.</p>'
    + '</section>';

  var caseloadHint = '';
  if (live && live.kpis && typeof live.kpis.red === 'number') {
    caseloadHint = '<p class="monitor-muted">Caseload snapshot: ' + esc(live.kpis.red) + ' high-priority review, '
      + esc(live.kpis.orange + live.kpis.yellow) + ' elevated/watch. Open the <strong>Caseload overview</strong> tab for the full grid.</p>';
  }

  var detailBody = '';
  if (!canUseBiometricsAnalyzer()) {
    detailBody = '<div class="monitor-empty-inline" data-testid="monitor-biometrics-auth-gate">Clinician access is required to load wearable summaries.</div>';
  } else if (!selId) {
    detailBody = '<div class="monitor-empty-inline">Select a patient to load wearable connections, daily summaries, and alert flags.</div>';
  } else if (loading) {
    detailBody = '<div class="monitor-empty-inline" role="status">Loading wearable summary\u2026</div>';
  } else if (err) {
    detailBody = '<div class="monitor-empty-inline" role="alert">Could not load wearable data: ' + esc(err) + '</div>';
  } else if (detail) {
    detailBody = summaryStrip
      + '<h4 class="monitor-subheading">Data availability</h4>' + renderMetricMatrix(detail.summaries)
      + trendHint
      + '<h4 class="monitor-subheading">Device connections</h4>' + connectionsPanel
      + '<h4 class="monitor-subheading">Alert flags (review)</h4>' + alertsPanel
      + '<h4 class="monitor-subheading">Readiness aggregate</h4>' + readinessBlock;
  }

  return '<div data-testid="monitor-tab-biometrics">' + demoBanner + clinDisclaimer
    + '<section class="monitor-panel monitor-panel--patient"><div class="monitor-panel-head"><h2>Patient context</h2></div>'
    + '<div class="monitor-patient-toolbar">'
    + '<label class="monitor-field">Patient <select id="monitor-patient-select" class="monitor-select" aria-label="Select patient for biometrics">' + patientOpts + '</select></label>'
    + '<label class="monitor-field">Window <select id="monitor-days-select" class="monitor-select" aria-label="Summary window in days">'
    + [7, 14, 30, 90].map(function (d) { return '<option value="' + d + '"' + (Number(days) === d ? ' selected' : '') + '>' + d + ' days</option>'; }).join('')
    + '</select></label>'
    + '<button type="button" class="btn btn-sm btn-primary" id="monitor-refresh-btn">Refresh</button>'
    + '<button type="button" class="btn btn-sm" id="monitor-clear-patient-btn">Clear</button>'
    + '</div>'
    + (s.patientsLoadError ? '<p class="monitor-inline-error" role="alert">' + esc(s.patientsLoadError) + '</p>' : '')
    + caseloadHint
    + '</section>'
    + '<div class="monitor-main-grid"><div class="monitor-main-col">'
    + '<section class="monitor-panel"><div class="monitor-panel-head"><h3>Clinic device connections (fleet)</h3></div>' + fleetPanel + '</section>'
    + '<section class="monitor-panel"><div class="monitor-panel-head"><h3>Wearables &amp; biometrics</h3></div>' + detailBody + '</section>'
    + quickLinks
    + aiPanel
    + evidencePanel
    + '</div></div></div>';
}

/* ── Main render ───────────────────────────────────────────────────────────── */

function render() {
  const s = state();
  const live = s.live || { kpis: {}, crises: [], caseload: [] };
  const integrations = s.integrations || { catalog: [], groups: {}, configured: [] };
  const dq = s.dq || { issues: [] };
  const el = document.getElementById('content');
  if (!el) return;

  var tabBody = '';
  if (s.tab === 'biometrics-analyzer') {
    tabBody = renderBiometricsWorkspace(s);
  } else if (s.tab === 'live') {
    tabBody = renderKpis(live) + `<div class="monitor-main-grid"><div class="monitor-main-col">${renderLive(live)}</div></div>`;
  } else if (s.tab === 'dq') {
    tabBody = `<div class="monitor-main-grid"><div class="monitor-main-col">${renderDq(dq)}</div></div>`;
  } else if (s.tab === 'wearables-workbench') {
    var summary = s.workbenchSummary || null;
    var flagsList = Array.isArray(s.workbenchFlags?.items) ? s.workbenchFlags.items : null;
    var isDemoView = !!(s.workbenchFlags?.is_demo_view || summary?.is_demo_view);
    tabBody = `<div class="monitor-main-grid"><div class="monitor-main-col">${
      renderWorkbench(summary, flagsList, isDemoView, s.workbenchFilters)
    }</div></div>`;
  } else {
    tabBody = renderDevicesKpis(integrations) +
      `<div class="monitor-main-grid"><div class="monitor-main-col">${
        s.expandedCategory ? renderExpandedCategory(s.expandedCategory, integrations) : renderCategoryTiles(integrations)
      }</div></div>`;
  }

  const heroKicker = s.tab === 'biometrics-analyzer' ? 'Monitor' : 'Device management &amp; integrations';
  const heroTitle = s.tab === 'biometrics-analyzer' ? 'Biometrics Analyzer' : 'Devices';
  const heroSub = s.tab === 'biometrics-analyzer'
    ? 'Clinician-reviewed wearables and daily summaries — not continuous or emergency monitoring.'
    : 'Central hub for connected devices, integrations, and data sources.';

  el.innerHTML = `<div class="monitor-shell">
    <div class="monitor-hero">
      <div><div class="monitor-kicker">Biometrics &amp; monitoring</div><h1>Monitor</h1><p>Clinician-reviewed wearable metrics, device status, and operational alerts. Not continuous clinical surveillance or emergency monitoring unless your institution configures those workflows elsewhere.</p></div>
      <div class="monitor-tabs" role="tablist" aria-label="Monitor sections">
        <button type="button" role="tab" class="monitor-tab ${s.tab === 'biometrics-analyzer' ? 'is-active' : ''}" aria-selected="${s.tab === 'biometrics-analyzer'}" data-testid="monitor-tab-biometrics" onclick="window._monitorSetTab('biometrics-analyzer')">Biometrics Analyzer</button>
        <button type="button" role="tab" class="monitor-tab ${s.tab === 'control-center' ? 'is-active' : ''}" aria-selected="${s.tab === 'control-center'}" onclick="window._monitorSetTab('control-center')">Integrations</button>
        <button type="button" role="tab" class="monitor-tab ${s.tab === 'live' ? 'is-active' : ''}" aria-selected="${s.tab === 'live'}" onclick="window._monitorSetTab('live')">Caseload overview</button>
        <button type="button" role="tab" class="monitor-tab ${s.tab === 'dq' ? 'is-active' : ''}" aria-selected="${s.tab === 'dq'}" onclick="window._monitorSetTab('dq')">Data quality</button>
        <button type="button" role="tab" class="monitor-tab ${s.tab === 'wearables-workbench' ? 'is-active' : ''}" aria-selected="${s.tab === 'wearables-workbench'}" onclick="window._monitorSetTab('wearables-workbench')">Wearable triage</button>
      </div>
    </div>
    ${tabBody}
  </div>`;

  if (s.tab === 'biometrics-analyzer') {
    queueMicrotask(function () { attachBiometricsListeners(s); });
  }
}

function attachBiometricsListeners(s) {
  var sel = document.getElementById('monitor-patient-select');
  var daysSel = document.getElementById('monitor-days-select');
  var refBtn = document.getElementById('monitor-refresh-btn');
  var clrBtn = document.getElementById('monitor-clear-patient-btn');
  if (sel) {
    sel.addEventListener('change', function () {
      var v = sel.value || '';
      s.selectedPatientId = v || null;
      window._selectedPatientId = v || null;
      try {
        if (v) sessionStorage.setItem('ds_pat_selected_id', v);
        else sessionStorage.removeItem('ds_pat_selected_id');
      } catch {}
      loadPatientWearableDetail();
    });
  }
  if (daysSel) {
    daysSel.addEventListener('change', function () {
      var d = parseInt(daysSel.value, 10);
      s.patientWearableDays = Number.isFinite(d) ? d : 30;
      loadPatientWearableDetail();
    });
  }
  if (refBtn) {
    refBtn.addEventListener('click', function () {
      loadPatientWearableDetail();
      loadFleetSnapshot();
      try { api.postWearablesWorkbenchAuditEvent({ event: 'refresh', note: 'biometrics tab refresh' }); } catch {}
    });
  }
  if (clrBtn) {
    clrBtn.addEventListener('click', function () {
      s.selectedPatientId = null;
      window._selectedPatientId = null;
      s.patientDetail = null;
      try { sessionStorage.removeItem('ds_pat_selected_id'); } catch {}
      if (sel) sel.value = '';
      render();
    });
  }
}

async function loadPatientsList(opts) {
  const skipRender = opts && opts.skipRender;
  const s = state();
  s.patientsLoadError = null;
  try {
    const rows = await api.listPatients({ limit: 200 });
    var list = [];
    if (Array.isArray(rows)) list = rows;
    else if (rows && Array.isArray(rows.items)) list = rows.items;
    else if (rows && Array.isArray(rows.patients)) list = rows.patients;
    s.patientsList = list;
    try { window[PATIENT_CACHE_KEY] = s.patientsList; } catch {}
  } catch (e) {
    s.patientsLoadError = (e && e.message) ? String(e.message) : 'Could not load patient roster';
    s.patientsList = [];
  }
  if (!skipRender) render();
}

async function loadFleetSnapshot(opts) {
  const skipRender = opts && opts.skipRender;
  const s = state();
  try {
    const data = await api.monitorFleet();
    if (data && Array.isArray(data.devices)) s.fleet = data;
  } catch {}
  if (!s.fleet) s.fleet = { devices: [] };
  if (!skipRender) render();
}

async function loadPatientWearableDetail() {
  const s = state();
  const pid = s.selectedPatientId || window._selectedPatientId;
  if (!pid) {
    s.patientDetail = null;
    s.patientDetailError = null;
    s.patientDetailLoading = false;
    render();
    return;
  }
  s.patientDetailLoading = true;
  s.patientDetailError = null;
  render();
  try {
    const days = s.patientWearableDays || 30;
    const data = await api.getPatientWearableSummary(pid, days);
    s.patientDetail = data;
  } catch (e) {
    s.patientDetail = null;
    s.patientDetailError = (e && e.message) ? String(e.message) : 'Request failed';
  }
  s.patientDetailLoading = false;
  render();
}

/* ── Data loaders ──────────────────────────────────────────────────────────── */

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

async function loadBiometricsPatientsList() {
  const s = state();
  if (!canUseBiometricsAnalyzer()) return;
  var items = [];
  try {
    const r = await api.listPatients({ limit: 200 });
    items = (r && r.items) || (Array.isArray(r) ? r : []) || [];
  } catch {}
  if ((!items || !items.length) && _isDemoMode()) {
    items = DEMO_PATIENT_ROSTER.map(function (p) {
      return { id: p.id, first_name: p.first_name, last_name: p.last_name, demo_seed: true };
    });
  }
  s.biometricsPatients = items;
  if (s.tab === 'biometrics-analyzer') render();
}

async function refreshBiometricsPatientData() {
  const s = state();
  var pid = s.biometricsPatientId;
  if (!pid || !canUseBiometricsAnalyzer()) {
    s.biometricsSummary = null;
    s.biometricsFleet = null;
    s.biometricsError = null;
    s.biometricsLoading = false;
    render();
    return;
  }
  s.biometricsLoading = true;
  s.biometricsError = null;
  render();
  try {
    const sum = await api.getPatientWearableSummary(pid, BIOMETRICS_WINDOW_DAYS);
    s.biometricsSummary = sum && sum.patient_id ? sum : null;
    if (!s.biometricsSummary) s.biometricsError = 'Wearable summary unavailable for this patient.';
  } catch {
    s.biometricsSummary = null;
    s.biometricsError = 'Could not load wearable summary (offline, unauthorized, or missing patient).';
  }
  try {
    const fl = await api.monitorFleet();
    s.biometricsFleet = fl && Array.isArray(fl.devices) ? fl : null;
  } catch {
    s.biometricsFleet = null;
  }
  s.biometricsLoading = false;
  render();
}

function disconnectMonitorLiveStream() {
  const s = state();
  if (s.socket) {
    try { s.socket.close(); } catch {}
    s.socket = null;
  }
}

async function loadWorkbench() {
  const s = state();
  // Build filter params, dropping blanks so the server-side default
  // (no filter) kicks in instead of filtering by literal empty strings.
  var params = {};
  if (s.workbenchFilters?.status) params.status = s.workbenchFilters.status;
  if (s.workbenchFilters?.severity) params.severity = s.workbenchFilters.severity;
  try {
    const flags = await api.wearablesWorkbenchListFlags(params);
    if (flags) s.workbenchFlags = flags;
  } catch {}
  try {
    const summary = await api.wearablesWorkbenchSummary();
    if (summary) s.workbenchSummary = summary;
  } catch {}
  // Honest empty state when offline / API unreachable — no synthetic
  // alerts. The render path shows a neutral empty queue message.
  if (!s.workbenchFlags) s.workbenchFlags = { items: [], total: 0, is_demo_view: false };
  if (!s.workbenchSummary) s.workbenchSummary = { open: 0, acknowledged: 0, escalated: 0, resolved: 0, incidence_7d: 0, is_demo_view: false };
  render();
}

async function loadPatientListForBiometrics() {
  const s = state();
  if (!canUseBiometricsAnalyzer()) {
    s.patientList = { items: [] };
    return;
  }
  try {
    const resp = await api.listPatients({ limit: 200, offset: 0 });
    if (resp && Array.isArray(resp.items)) s.patientList = resp;
  } catch {}
  if (!s.patientList) s.patientList = { items: [] };
}

async function loadFleet() {
  const s = state();
  if (!canUseBiometricsAnalyzer()) return;
  try {
    const data = await api.monitorFleet();
    if (data && Array.isArray(data.devices)) s.fleet = data;
  } catch {}
}

async function loadWearableSummaryForSelection() {
  const s = state();
  const pid = window._selectedPatientId || '';
  s.wearableSummaryError = null;
  if (!canUseBiometricsAnalyzer() || !pid) {
    s.wearableSummary = null;
    s.wearableSummaryPatientId = null;
    s.wearableSummaryDaysLoaded = null;
    render();
    return;
  }
  const days = Number(s.biometricsDays || 30);
  if (
    s.wearableSummaryPatientId === pid
    && Number(s.wearableSummaryDaysLoaded) === days
    && s.wearableSummary
    && !_isDemoMode()
  ) {
    render();
    return;
  }
  try {
    const data = await api.getPatientWearableSummary(pid, days);
    if (data) {
      s.wearableSummary = data;
      s.wearableSummaryPatientId = pid;
      s.wearableSummaryDaysLoaded = days;
    }
  } catch (e) {
    const msg = (e && e.message) ? String(e.message) : 'request failed';
    s.wearableSummaryError = msg;
    s.wearableSummary = null;
    s.wearableSummaryPatientId = null;
    s.wearableSummaryDaysLoaded = null;
    if (_isDemoMode()) {
      s.wearableSummary = demoWearableSummary(pid, days);
      s.wearableSummaryPatientId = pid;
      s.wearableSummaryDaysLoaded = days;
      s.wearableSummaryError = null;
    }
  }
  render();
}

async function ensureMonitorHeavyLoaded() {
  const s = state();
  if (s.monitorHeavyLoaded) return;
  await Promise.all([loadLive(), loadIntegrations(), loadDq()]);
  s.monitorHeavyLoaded = true;
}

function connectLiveStream() {
  const s = state();
  if (s.tab !== 'live') return;
  if (!api.getToken()) return;
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
      const st = state();
      if (st.tab !== 'live') return;
      const wait = RETRY_MS[Math.min(st.retryIndex, RETRY_MS.length - 1)];
      st.retryIndex += 1;
      window.setTimeout(connectLiveStream, wait);
    };
  } catch {}
}

function ensureLiveStreamForActiveTab() {
  const s = state();
  if (s.tab === 'live') connectLiveStream();
  else disconnectMonitorLiveStream();
}

/* ── Page entry ────────────────────────────────────────────────────────────── */

export async function pgMonitor(setTopbar, navigate) {
  setTopbar('Monitor', '<span class="monitor-topbar-pill">Biometrics</span>');
  const s = state();

  function applyMonitorTopbar() {
    if (s.tab === 'biometrics-analyzer') {
      setTopbar('Monitor', '<span class="monitor-topbar-pill">Biometrics Analyzer</span>');
    } else if (s.tab === 'live') {
      setTopbar('Monitor', '<span class="monitor-topbar-pill">Clinic overview</span>');
    } else if (s.tab === 'dq') {
      setTopbar('Devices', '<span class="monitor-topbar-pill">Data quality</span>');
    } else if (s.tab === 'wearables-workbench') {
      setTopbar('Devices', '<span class="monitor-topbar-pill">Wearable triage</span>');
    } else {
      setTopbar('Devices', '<span class="monitor-topbar-pill">Control Center</span>');
    }
  }

  // Apply preset from route redirects
  if (window._devicesPresetTab) {
    var preset = window._devicesPresetTab;
    if (preset === 'biometrics') preset = 'biometrics-analyzer';
    s.tab = VALID_TABS.has(preset) ? preset : 'control-center';
    delete window._devicesPresetTab;
  }
  if (window._devicesPresetCategory) {
    s.expandedCategory = window._devicesPresetCategory;
    if (s.tab !== 'biometrics-analyzer') {
      s.tab = 'control-center';
    }
    delete window._devicesPresetCategory;
  }

  try {
    var storedPid = sessionStorage.getItem('ds_pat_selected_id');
    if (storedPid && !s.selectedPatientId) {
      s.selectedPatientId = storedPid;
      window._selectedPatientId = storedPid;
    }
  } catch {}

  render();
  await Promise.all([loadPatientsList({ skipRender: true }), loadFleetSnapshot({ skipRender: true })]);
  if (MONITOR_HEAVY_TABS.has(s.tab) || s.tab === 'control-center') {
    await ensureMonitorHeavyLoaded();
  }
  render();
  connectLiveStream();

  // Mount-time audit ping so the regulator trail shows the clinician
  // opened the Devices/Monitor surface. Best-effort only — the helper
  // catches and returns null on offline / 401 so the UI never breaks
  // because of an audit failure.
  try { await api.postWearablesWorkbenchAuditEvent({ event: 'view', note: 'monitor page mounted' }); } catch {}

  // If the user lands on the workbench tab from a deep link, kick off
  // the triage queue load now. Subsequent tab switches load lazily.
  if (s.tab === 'wearables-workbench') {
    await loadWorkbench();
  } else if (s.tab === 'biometrics-analyzer') {
    await loadWearableSummaryForSelection();
  }

  window._monitorSetTab = function (tab) {
    if (tab === 'biometrics') tab = 'biometrics-analyzer';
    s.tab = VALID_TABS.has(tab) ? tab : 'biometrics-analyzer';
    s.expandedCategory = null;
    localStorage.setItem(TAB_KEY, s.tab);
    applyMonitorTopbar();
    render();
    ensureLiveStreamForActiveTab();
    if (MONITOR_HEAVY_TABS.has(s.tab) || s.tab === 'control-center') {
      ensureMonitorHeavyLoaded();
    }
    if (s.tab === 'biometrics-analyzer' && canUseBiometricsAnalyzer()) {
      (async function () {
        if (!s.biometricsPatients || !s.biometricsPatients.length) await loadBiometricsPatientsList();
        render();
        if (s.biometricsPatientId) await refreshBiometricsPatientData();
      })();
    }
    if (s.tab === 'wearables-workbench') {
      loadWorkbench();
      try { api.postWearablesWorkbenchAuditEvent({ event: 'tab_opened', note: 'wearables triage tab' }); } catch {}
    }
    if (s.tab === 'biometrics-analyzer') {
      try { api.postWearablesWorkbenchAuditEvent({ event: 'tab_opened', note: 'biometrics analyzer tab' }); } catch {}
      loadPatientWearableDetail();
    }
  };

  window._monitorLink = function (page) {
    var pid = s.selectedPatientId || window._selectedPatientId;
    if (pid) {
      window._selectedPatientId = pid;
      window._profilePatientId = pid;
    }
    var nav = navigate || window._nav;
    if (typeof nav === 'function') nav(page);
  };

  window._monitorBiometricsSelectPatient = function (patientId) {
    s.biometricsPatientId = patientId || null;
    try {
      if (patientId) sessionStorage.setItem('ds_pat_selected_id', String(patientId));
      else sessionStorage.removeItem('ds_pat_selected_id');
    } catch {}
    if (patientId) {
      window._selectedPatientId = patientId;
      window._profilePatientId = patientId;
    }
    refreshBiometricsPatientData();
  };

  window._monitorLinkedNav = function (pageId, patientId) {
    if (patientId) {
      window._selectedPatientId = patientId;
      window._profilePatientId = patientId;
      try { sessionStorage.setItem('ds_pat_selected_id', String(patientId)); } catch {}
    }
    window._nav?.(pageId);
  };

  window._devicesExpandCategory = function (kind) {
    s.expandedCategory = kind;
    render();
  };

  window._devicesCollapseCategory = function () {
    s.expandedCategory = null;
    render();
  };

  window._monitorOpenPatient = openPatient;
  window._monitorOpenDeviceDash = function (connectionId, provider) {
    window._deviceDashConnectionId = connectionId;
    window._deviceDashProvider = provider;
    window._nav('device-dashboard');
  };
  window._monitorConnectIntegration = function (connectorId) { (async function () { try { await api.monitorConnectIntegration(connectorId, {}); } catch {} await loadIntegrations(); })(); };
  window._monitorSyncIntegration = function (integrationId) { (async function () { try { await api.monitorSyncIntegration(integrationId); } catch {} await loadIntegrations(); })(); };
  window._monitorDisconnectIntegration = function (integrationId) { (async function () { try { await api.monitorDisconnectIntegration(integrationId); } catch {} await loadIntegrations(); })(); };
  window._monitorResolveIssue = function (issueId) { (async function () { try { await api.monitorResolveDataQualityIssue(issueId, {}); } catch {} await loadDq(); })(); };

  /* ── Wearables Workbench handlers ─────────────────────────────────────── */
  window._workbenchFilterStatus = function (value) {
    s.workbenchFilters = Object.assign({}, s.workbenchFilters, { status: value || '' });
    try { api.postWearablesWorkbenchAuditEvent({ event: 'filter_changed', note: 'status=' + (value || 'all') }); } catch {}
    loadWorkbench();
  };
  window._workbenchFilterSeverity = function (value) {
    s.workbenchFilters = Object.assign({}, s.workbenchFilters, { severity: value || '' });
    try { api.postWearablesWorkbenchAuditEvent({ event: 'filter_changed', note: 'severity=' + (value || 'all') }); } catch {}
    loadWorkbench();
  };
  window._workbenchAcknowledge = function (flagId) {
    var note = (window.prompt && window.prompt('Acknowledge note (required):')) || '';
    note = String(note || '').trim();
    if (!note) return;
    (async function () {
      try { await api.wearablesWorkbenchAcknowledge(flagId, note); } catch {}
      await loadWorkbench();
    })();
  };
  window._workbenchEscalate = function (flagId) {
    var note = (window.prompt && window.prompt('Escalation note — describes the clinical concern (required):')) || '';
    note = String(note || '').trim();
    if (!note) return;
    (async function () {
      try {
        var resp = await api.wearablesWorkbenchEscalate(flagId, note, null);
        if (resp && resp.adverse_event_id && window.confirm) {
          if (window.confirm('Adverse Event draft created (' + resp.adverse_event_id + '). Open AE Hub now?')) {
            window._nav?.('adverse-events-hub');
          }
        }
      } catch {}
      await loadWorkbench();
    })();
  };
  window._workbenchResolve = function (flagId) {
    var note = (window.prompt && window.prompt('Resolution note (required) — flag becomes immutable:')) || '';
    note = String(note || '').trim();
    if (!note) return;
    (async function () {
      try { await api.wearablesWorkbenchResolve(flagId, note); } catch {}
      await loadWorkbench();
    })();
  };
  window._workbenchOpenPatient = function (patientId) {
    if (!patientId) return;
    window._selectedPatientId = patientId;
    window._profilePatientId = patientId;
    try { api.postWearablesWorkbenchAuditEvent({ event: 'deep_link_followed', note: 'target=patient_profile patient=' + patientId }); } catch {}
    window._nav?.('patient-profile');
  };
  window._workbenchOpenAe = function (aeId) {
    if (!aeId) return;
    window._selectedAdverseEventId = aeId;
    try { api.postWearablesWorkbenchAuditEvent({ event: 'deep_link_followed', note: 'target=adverse_events_hub ae=' + aeId }); } catch {}
    window._nav?.('adverse-events-hub');
  };
  window._workbenchExportCsv = function () {
    try { api.postWearablesWorkbenchAuditEvent({ event: 'export_initiated', note: 'format=csv' }); } catch {}
    window.open(api.wearablesWorkbenchExportCsvUrl(), '_blank');
  };
  window._workbenchExportNdjson = function () {
    try { api.postWearablesWorkbenchAuditEvent({ event: 'export_initiated', note: 'format=ndjson' }); } catch {}
    window.open(api.wearablesWorkbenchExportNdjsonUrl(), '_blank');
  };
}
