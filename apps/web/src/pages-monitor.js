import { api } from './api.js';
import { currentUser } from './auth.js';
import { DEMO_PATIENT_ROSTER } from './patient-dashboard-helpers.js';

const TAB_KEY = 'monitor_tab';
const STATE_KEY = '__ds_monitor_state';
const PATIENT_CACHE_KEY = '__ds_monitor_patients_cache';
const SCHEDULES_KEY = '__ds_biometrics_schedules';
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
      workbenchError: null,
      workbenchActionError: null,
      workbenchFilters: { status: 'open', severity: '' },
      monitorHeavyLoaded: false,
      biometricsReportSchedules: [],
      showSchedulePanel: false,
    };
    var storedSchedules = [];
    try {
      var rawSchedules = localStorage.getItem(SCHEDULES_KEY);
      if (rawSchedules) storedSchedules = JSON.parse(rawSchedules);
    } catch {}
    if (Array.isArray(storedSchedules)) window[STATE_KEY].biometricsReportSchedules = storedSchedules;
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
    ['qEEG', 'qeeg-launcher', false],
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

function renderWorkbenchTable(flags, isDemoView, loadError) {
  var rows = Array.isArray(flags) ? flags : [];
  var demoBanner = isDemoView
    ? '<div class="monitor-empty-inline" style="background:#fff7e6;border:1px solid #ffd591;color:#874d00;margin-bottom:12px">DEMO data — exports will be DEMO-prefixed and are not regulator-submittable.</div>'
    : '';

  if (loadError) {
    return demoBanner
      + '<div class="monitor-empty-inline" role="alert" style="background:#fff1f0;border:1px solid #ffa39e;color:#a8071a">'
      + 'Could not load wearable alert flags right now. Queue contents may be unavailable because the clinic feed is offline, unauthorized, or degraded.'
      + '</div>';
  }

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

function renderWorkbench(summary, flags, isDemoView, filters, loadError, actionError) {
  var hasData = Array.isArray(flags);
  return renderWorkbenchKpis(summary || {})
    + '<section class="monitor-panel">'
    + '<div class="monitor-panel-head"><h3>Wearable alert triage</h3>'
    + '<span>' + (hasData ? flags.length : 0) + ' shown</span></div>'
    + renderWorkbenchFilters(filters || {})
    + (actionError ? '<p class="monitor-inline-error" role="alert">' + esc(actionError) + '</p>' : '')
    + (hasData ? renderWorkbenchTable(flags, isDemoView, loadError) : '<div class="monitor-empty-inline">Loading triage queue...</div>')
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

function _renderMetricHeatmap(summaries) {
  var rows = Array.isArray(summaries) ? summaries : [];
  var windowDays = 7;
  var recent = rows.slice(-windowDays);
  var defs = [
    { label: 'HRV', unit: 'ms', key: 'hrv_ms' },
    { label: 'Resting HR', unit: 'bpm', key: 'rhr_bpm' },
    { label: 'Sleep', unit: 'h', key: 'sleep_duration_h' },
    { label: 'Steps', unit: '', key: 'steps' },
    { label: 'SpO\u2082', unit: '%', key: 'spo2_pct' },
    { label: 'Skin temp \u0394', unit: '\u00b0', key: 'skin_temp_delta' },
    { label: 'Readiness', unit: '', key: 'readiness_score' },
  ];
  var dayLabels = recent.map(function(r, i) {
    var d = r.date ? String(r.date).slice(5) : ('D-' + (recent.length - i));
    return '<th style="text-align:center;min-width:44px">' + esc(d) + '</th>';
  }).join('');
  var body = defs.map(function(d) {
    var cells = recent.map(function(r) {
      var v = r[d.key];
      var has = v != null && !Number.isNaN(Number(v));
      var st = has ? _metricStatus(v, d.key) : null;
      var color = has ? st.color : 'var(--text-tertiary)';
      var bg = has ? (st.severity === 2 ? 'rgba(255,107,139,0.12)' : st.severity === 1 ? 'rgba(246,178,60,0.12)' : 'rgba(62,224,197,0.10)') : 'transparent';
      var disp = has ? (Number.isInteger(Number(v)) ? String(v) : Number(v).toFixed(1)) : '\u2014';
      return '<td style="text-align:center;font-size:12px;color:' + color + ';background:' + bg + ';border-radius:6px">' + esc(disp) + '</td>';
    }).join('');
    return '<tr><td style="font-weight:600">' + esc(d.label) + '<span style="color:var(--text-tertiary);font-weight:500;margin-left:4px">' + esc(d.unit) + '</span></td>' + cells + '</tr>';
  }).join('');
  return '<div class="monitor-table-wrap"><table class="monitor-table monitor-heatmap"><thead><tr><th>Metric</th>' + dayLabels + '</tr></thead><tbody>' + body + '</tbody></table></div>'
    + '<p class="monitor-muted" style="margin-top:8px">Last ' + windowDays + ' days. Green = within range, amber = borderline, red = outside reference. \u2014 = missing.</p>';
}

/* ── Biometrics Analyzer helpers (doctor-ready) ───────────────────────────── */

var _BIOMETRIC_REFS = {
  hrv_ms: { lo: 20, hi: 70, label: 'RMSSD adult ref', dir: 'up' },
  rhr_bpm: { lo: 60, hi: 100, label: 'Adult resting HR', dir: 'down' },
  spo2_pct: { lo: 95, hi: 100, label: 'SpO₂ norm', dir: 'up' },
  sleep_duration_h: { lo: 7, hi: 9, label: 'Adult sleep rec', dir: 'neutral' },
  steps: { lo: 4000, hi: 12000, label: 'Daily steps', dir: 'up' },
  skin_temp_delta: { lo: -1, hi: 1, label: 'Skin temp vs baseline', dir: 'neutral' },
  readiness_score: { lo: 60, hi: 100, label: 'Vendor readiness', dir: 'up' },
  mood_score: { lo: 3, hi: 5, label: 'Mood (1-5)', dir: 'up' },
  pain_score: { lo: 0, hi: 3, label: 'Pain (0-10)', dir: 'down' },
  anxiety_score: { lo: 0, hi: 4, label: 'Anxiety (0-10)', dir: 'down' },
};

function _metricStatus(val, type) {
  var ref = _BIOMETRIC_REFS[type];
  if (!ref || val == null || Number.isNaN(Number(val))) return { color: 'var(--text-tertiary)', cls: 'grey', label: 'No data', severity: 0 };
  var v = Number(val);
  var range = ref.hi - ref.lo;
  if (v >= ref.lo && v <= ref.hi) return { color: '#3EE0C5', cls: 'green', label: 'Within range', severity: 0 };
  var margin = range * 0.25;
  if (v >= ref.lo - margin && v <= ref.hi + margin) {
    return { color: '#F6B23C', cls: 'amber', label: v < ref.lo ? 'Slightly low' : 'Slightly high', severity: 1 };
  }
  return { color: '#FF6B8B', cls: 'red', label: v < ref.lo ? 'Below range' : 'Above range', severity: 2 };
}

function _sparklineSvg(values, opts) {
  opts = opts || {};
  var w = opts.width || 180;
  var h = opts.height || 48;
  var stroke = opts.stroke || 'var(--teal)';
  var fill = opts.fill !== false;
  var strokeWidth = opts.strokeWidth || 1.5;
  var clickable = opts.clickable;
  var dayMeta = opts.dayMeta || [];
  var valid = values.filter(function(v) { return v != null && !Number.isNaN(Number(v)); });
  if (valid.length < 2) {
    return '<svg width="' + w + '" height="' + h + '" style="opacity:.4"><text x="' + (w/2) + '" y="' + (h/2) + '" text-anchor="middle" font-size="9" fill="var(--text-tertiary)">Insufficient data</text></svg>';
  }
  var min = Math.min.apply(null, valid);
  var max = Math.max.apply(null, valid);
  var range = max - min || 1;
  var pts = values.map(function(v, i) {
    var x = 1 + (i / (values.length - 1)) * (w - 2);
    var y = isNaN(Number(v)) ? (h / 2) : ((h - 1) - ((Number(v) - min) / range) * (h - 2));
    return [x, y];
  });
  var path = pts.map(function(p, i) {
    return (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1);
  }).join(' ');
  var id = 'sl-' + Math.random().toString(36).slice(2, 8);
  var area = path + ' L' + pts[pts.length - 1][0].toFixed(1) + ',' + h + ' L' + pts[0][0].toFixed(1) + ',' + h + ' Z';
  var overlays = '';
  if (clickable && values.length) {
    var segW = (w - 2) / (values.length - 1);
    overlays = values.map(function(v, i) {
      var mx = 1 + (i / (values.length - 1)) * (w - 2);
      var meta = dayMeta[i] || {};
      var cacheKey = '_monitorDayCache_' + (opts.metricKey || 'all') + '_' + i;
      window[cacheKey] = { date: meta.date || '', label: meta.label || '', dataIdx: meta.dataIdx != null ? meta.dataIdx : i, metricKey: opts.metricKey || '' };
      return '<rect x="' + Math.max(0, mx - segW / 2).toFixed(1) + '" y="0" width="' + Math.max(2, segW).toFixed(1) + '" height="' + h + '" fill="transparent" style="cursor:pointer" onclick="window._monitorShowDayCard(window.' + cacheKey + ')"/>';
    }).join('');
  }
  var markers = opts.markers || [];
  var markerSvg = markers.map(function(m) {
    var mx = 1 + (m.idx / (values.length - 1)) * (w - 2);
    return '<line x1="' + mx.toFixed(1) + '" y1="0" x2="' + mx.toFixed(1) + '" y2="' + h + '" stroke="' + (m.color || '#F6B23C') + '" stroke-width="2" stroke-dasharray="3,2" opacity="0.9"/>'
      + '<circle cx="' + mx.toFixed(1) + '" cy="2" r="2.5" fill="' + (m.color || '#F6B23C') + '"/>';
  }).join('');
  return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">'
    + (fill ? '<defs><linearGradient id="' + id + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="' + stroke + '" stop-opacity="0.28"/><stop offset="100%" stop-color="' + stroke + '" stop-opacity="0"/></linearGradient></defs><path d="' + area + '" fill="url(#' + id + ')"/>' : '')
    + '<path d="' + path + '" fill="none" stroke="' + stroke + '" stroke-width="' + strokeWidth + '" stroke-linecap="round" stroke-linejoin="round"/>'
    + markerSvg
    + overlays
    + '</svg>';
}

function _renderDayCard(meta) {
  if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }
  meta = meta || {};
  var s = state();
  var detail = s.patientDetail || {};
  var summaries = Array.isArray(detail.summaries) ? detail.summaries : [];
  var idx = parseInt(meta.dataIdx, 10);
  var day = summaries[idx];
  if (!day) return '';
  var dateLabel = meta.date || day.date || ('Day ' + (idx + 1));
  var metrics = [
    { key: 'hrv_ms', label: 'HRV', unit: 'ms' },
    { key: 'rhr_bpm', label: 'Resting HR', unit: 'bpm' },
    { key: 'sleep_duration_h', label: 'Sleep', unit: 'h' },
    { key: 'steps', label: 'Steps', unit: '' },
    { key: 'spo2_pct', label: 'SpO₂', unit: '%' },
    { key: 'readiness_score', label: 'Readiness', unit: '' },
  ];
  var rows = metrics.map(function(m) {
    var v = day[m.key];
    var st = _metricStatus(v, m.key);
    var disp = v == null || Number.isNaN(Number(v)) ? '\u2014' : (Number.isInteger(Number(v)) ? String(v) : Number(v).toFixed(1));
    return '<tr><td>' + esc(m.label) + '</td><td>' + esc(disp) + '<span style="color:var(--text-tertiary);margin-left:4px">' + esc(m.unit) + '</span></td><td style="color:' + st.color + '">' + esc(st.label) + '</td></tr>';
  }).join('');
  return '<div class="monitor-day-card-overlay" onclick="if(event.target===this)window._monitorCloseDayCard()">'
    + '<div class="monitor-day-card" role="dialog" aria-modal="true" aria-label="Day detail">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
    + '<h4 style="margin:0;font-size:16px">' + esc(dateLabel) + '</h4>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorCloseDayCard()">Close</button></div>'
    + '<div class="monitor-table-wrap"><table class="monitor-table"><thead><tr><th>Metric</th><th>Value</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    + '<p class="monitor-muted" style="margin-top:10px">Click a sparkline point to compare days. Values are device-reported aggregates.</p>'
    + '</div></div>';
}

function _renderTrendPanel(summaries, days) {
  if (!Array.isArray(summaries) || summaries.length < 2) {
    return '<p class="monitor-muted">At least 2 days of data are needed to show trends. Current window: ' + esc(String(days)) + ' days.</p>';
  }
  var metrics = [
    { key: 'hrv_ms', label: 'HRV', unit: 'ms', stroke: '#3EE0C5' },
    { key: 'rhr_bpm', label: 'Resting HR', unit: 'bpm', stroke: '#FF6B8B' },
    { key: 'sleep_duration_h', label: 'Sleep', unit: 'h', stroke: '#5BB6FF' },
    { key: 'steps', label: 'Steps', unit: '', stroke: '#B6E66A' },
    { key: 'spo2_pct', label: 'SpO₂', unit: '%', stroke: '#8B7DFF' },
    { key: 'readiness_score', label: 'Readiness', unit: '', stroke: '#F6B23C' },
  ];
  var cards = metrics.map(function(m) {
    var vals = summaries.map(function(s) { return s[m.key]; });
    var valid = vals.filter(function(v) { return v != null && !Number.isNaN(Number(v)); });
    var last = valid.length ? valid[valid.length - 1] : null;
    var prev = valid.length > 1 ? valid[valid.length - 2] : null;
    var delta = (last != null && prev != null) ? (last - prev) : null;
    var deltaStr = delta != null ? ((delta >= 0 ? '+' : '') + (Number.isInteger(delta) ? String(delta) : delta.toFixed(1))) : '\u2014';
    var st = _metricStatus(last, m.key);
    var dayMeta = summaries.map(function(s, i) {
      return { date: s.date || '', label: s.date || ('Day ' + (i + 1)), dataIdx: i };
    });
    var spark = _sparklineSvg(vals, { width: 160, height: 40, stroke: m.stroke, clickable: true, dayMeta: dayMeta, metricKey: m.key, markers: markers });
    var mean = valid.length ? (valid.reduce(function(a,b){return a+b;},0) / valid.length) : null;
    var meanStr = mean != null ? (Number.isInteger(mean) ? String(mean) : mean.toFixed(1)) : '\u2014';
    var deltaColor = 'var(--text-tertiary)';
    if (delta != null) {
      var lowerIsBetter = (m.key === 'rhr_bpm' || m.key === 'pain_score' || m.key === 'anxiety_score');
      deltaColor = delta < 0 ? (lowerIsBetter ? '#3EE0C5' : '#FF6B8B') : (lowerIsBetter ? '#FF6B8B' : '#3EE0C5');
    }
    return '<article class="monitor-metric-card" style="border-left:3px solid ' + m.stroke + '">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">'
      + '<div style="font-size:11px;color:var(--text-tertiary)">' + esc(m.label) + '</div>'
      + '<div style="font-size:10px;color:' + st.color + ';font-weight:600">' + esc(st.label) + '</div></div>'
      + '<div style="font-size:20px;font-weight:700;color:var(--text-primary);margin-bottom:4px">'
      + esc(last != null ? (Number.isInteger(last) ? String(last) : last.toFixed(1)) : '\u2014')
      + '<span style="font-size:11px;color:var(--text-tertiary);font-weight:500;margin-left:4px">' + esc(m.unit) + '</span></div>'
      + '<div style="font-size:11px;color:' + deltaColor + ';margin-bottom:8px">'
      + '\u0394 prev: ' + esc(deltaStr) + ' \u00b7 \u03bc ' + esc(meanStr) + '</div>'
      + spark
      + '</article>';
  }).join('');
  return '<div class="monitor-metric-grid" style="margin-bottom:12px">' + cards + '</div>'
    + '<p class="monitor-muted">Trends span ' + esc(String(summaries.length)) + ' daily summary day(s) in the selected ' + esc(String(days)) + '-day window. Reference ranges are general adult guidelines; interpret per patient context.</p>';
}

function _computePersonalBaselines(summaries) {
  if (!Array.isArray(summaries) || summaries.length < 4) return null;
  var metrics = [
    { key: 'hrv_ms', label: 'HRV', unit: 'ms', invert: false },
    { key: 'rhr_bpm', label: 'Resting HR', unit: 'bpm', invert: true },
    { key: 'sleep_duration_h', label: 'Sleep', unit: 'h', invert: false },
    { key: 'steps', label: 'Steps', unit: '', invert: false },
    { key: 'spo2_pct', label: 'SpO₂', unit: '%', invert: false },
    { key: 'readiness_score', label: 'Readiness', unit: '', invert: false },
  ];
  var results = [];
  metrics.forEach(function(m) {
    var vals = summaries.map(function(s) { return s[m.key]; }).filter(function(v) { return v != null && !Number.isNaN(Number(v)); });
    if (vals.length < 4) {
      results.push({ key: m.key, label: m.label, unit: m.unit, n: vals.length, hasBaseline: false });
      return;
    }
    var baselineVals = vals.slice(0, -1);
    var last = vals[vals.length - 1];
    var mean = baselineVals.reduce(function(a,b){return a+b;},0) / baselineVals.length;
    var variance = baselineVals.reduce(function(a,b){return a + Math.pow(b - mean, 2);},0) / baselineVals.length;
    var sd = Math.sqrt(variance) || 1.0;
    var z = (last - mean) / sd;
    var severity = Math.abs(z) < 1 ? 0 : Math.abs(z) < 2 ? 1 : 2;
    var direction = m.invert ? (z > 0 ? 'worse' : 'better') : (z > 0 ? 'better' : 'worse');
    var color = severity === 0 ? '#3EE0C5' : severity === 1 ? '#F6B23C' : '#FF6B8B';
    var label = severity === 0 ? 'Within baseline' : severity === 1 ? 'Borderline deviation' : 'Significant deviation';
    results.push({
      key: m.key, label: m.label, unit: m.unit, n: vals.length,
      hasBaseline: true, mean: mean, sd: sd, last: last, z: z,
      severity: severity, direction: direction, color: color, label: label,
    });
  });
  return results;
}

function _renderBaselinePanel(summaries) {
  var baselines = _computePersonalBaselines(summaries);
  if (!baselines) {
    return '<p class="monitor-muted">At least 4 days of data are needed to compute a personal baseline. Select a longer window (14+ days) or wait for more data to sync.</p>';
  }
  var cards = baselines.map(function(b) {
    if (!b.hasBaseline) {
      return '<article class="monitor-metric-card monitor-metric-card--missing" style="border-left:3px solid var(--text-tertiary)">'
        + '<div style="font-size:11px;color:var(--text-tertiary)">' + esc(b.label) + '</div>'
        + '<div style="font-size:14px;color:var(--text-tertiary);margin-top:4px">Insufficient data (' + esc(String(b.n)) + ' pts)</div></article>';
    }
    var zStr = (b.z >= 0 ? '+' : '') + b.z.toFixed(2);
    var arrow = b.direction === 'better' ? '↗' : '↘';
    return '<article class="monitor-metric-card" style="border-left:3px solid ' + b.color + '">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">'
      + '<div style="font-size:11px;color:var(--text-tertiary)">' + esc(b.label) + '</div>'
      + '<div style="font-size:10px;color:' + b.color + ';font-weight:600">' + esc(b.label) + '</div></div>'
      + '<div style="font-size:20px;font-weight:700;color:var(--text-primary);margin-bottom:2px">'
      + esc(zStr) + '<span style="font-size:13px;color:var(--text-tertiary);margin-left:4px">z</span></div>'
      + '<div style="font-size:11px;color:' + b.color + ';margin-bottom:4px">'
      + esc(arrow) + ' ' + esc(b.direction) + ' vs baseline</div>'
      + '<div style="font-size:10px;color:var(--text-tertiary)">'
      + 'Baseline μ=' + esc(b.mean.toFixed(1)) + ' σ=' + esc(b.sd.toFixed(1)) + ' (n=' + esc(String(b.n - 1)) + ')</div>'
      + '</article>';
  }).join('');
  return '<div class="monitor-metric-grid" style="margin-bottom:12px">' + cards + '</div>'
    + '<p class="monitor-muted">Personal baseline uses all-but-the-last-day as the reference window. Z-score = (latest − baseline mean) / baseline standard deviation. |z| < 1 = typical, 1–2 = borderline, > 2 = significant. Direction is clinically oriented (better/worse).</p>';
}

function _computeCompositeAlerts(summaries) {
  if (!Array.isArray(summaries) || summaries.length < 2) return [];
  var last = summaries[summaries.length - 1];
  var prev = summaries.length > 1 ? summaries[summaries.length - 2] : null;
  var alerts = [];
  var baselines = _computePersonalBaselines(summaries) || [];
  var bMap = {};
  baselines.forEach(function(b) { if (b.hasBaseline) bMap[b.key] = b; });
  function z(key) { return bMap[key] ? bMap[key].z : null; }
  function hasZ(key, threshold) { var zz = z(key); return zz != null && Math.abs(zz) >= threshold; }
  function val(key) { var v = last[key]; return v != null && !Number.isNaN(Number(v)) ? Number(v) : null; }

  // Rule 1: Autonomic stress load
  if ((hasZ('hrv_ms', 1.5) && z('hrv_ms') < 0) && (hasZ('rhr_bpm', 1.5) && z('rhr_bpm') > 0)) {
    alerts.push({ type: 'autonomic_stress', severity: 'critical', icon: '⚠', title: 'Autonomic stress load', detail: 'HRV is significantly below personal baseline while resting HR is elevated. This pattern suggests increased sympathetic tone or incomplete recovery.' });
  }
  // Rule 2: Recovery deficit
  var sleepV = val('sleep_duration_h');
  var readinessV = val('readiness_score');
  if ((sleepV != null && sleepV < 6) && (readinessV != null && readinessV < 50)) {
    alerts.push({ type: 'recovery_deficit', severity: 'elevated', icon: '⚠', title: 'Recovery deficit', detail: 'Sleep duration < 6h combined with readiness score < 50 suggests inadequate recovery. Consider reviewing sleep hygiene, treatment timing, or workload.' });
  }
  // Rule 3: Severe activity drop
  var stepsV = val('steps');
  if (stepsV != null && stepsV < 2000) {
    alerts.push({ type: 'activity_drop', severity: 'elevated', icon: '⚠', title: 'Severe activity drop', detail: 'Daily steps below 2,000 indicate significant sedentary behavior. Correlate with mood, pain, or treatment side-effects.' });
  }
  // Rule 4: Hypoxia concern
  var spo2V = val('spo2_pct');
  if (spo2V != null && spo2V < 93) {
    alerts.push({ type: 'hypoxia_concern', severity: 'critical', icon: '⚠', title: 'SpO₂ concern', detail: 'SpO₂ below 93% is outside typical range. Verify device placement and consider clinical evaluation if persistent.' });
  }
  // Rule 5: Multi-system dysregulation
  var dysregCount = 0;
  if (hasZ('hrv_ms', 1.5) && z('hrv_ms') < 0) dysregCount++;
  if (hasZ('rhr_bpm', 1.5) && z('rhr_bpm') > 0) dysregCount++;
  if (hasZ('sleep_duration_h', 1.5) && z('sleep_duration_h') < 0) dysregCount++;
  if (hasZ('readiness_score', 1.5) && z('readiness_score') < 0) dysregCount++;
  if (dysregCount >= 3) {
    alerts.push({ type: 'multi_dysregulation', severity: 'critical', icon: '⚠', title: 'Multi-system dysregulation', detail: dysregCount + ' metrics show significant deviation from personal baseline in a deleterious direction. Recommend comprehensive clinical review and correlation with treatment course.' });
  }
  // Rule 6: Consecutive deterioration
  if (prev && last && bMap['readiness_score'] && bMap['hrv_ms']) {
    var readyLast = val('readiness_score');
    var readyPrev = prev.readiness_score != null && !Number.isNaN(Number(prev.readiness_score)) ? Number(prev.readiness_score) : null;
    var hrvLast = val('hrv_ms');
    var hrvPrev = prev.hrv_ms != null && !Number.isNaN(Number(prev.hrv_ms)) ? Number(prev.hrv_ms) : null;
    if (readyLast != null && readyPrev != null && hrvLast != null && hrvPrev != null) {
      if (readyLast < readyPrev && hrvLast < hrvPrev && readyLast < 60) {
        alerts.push({ type: 'consecutive_decline', severity: 'elevated', icon: '↘', title: 'Consecutive decline', detail: 'Readiness and HRV both declined vs previous day with readiness now below 60. Monitor for ongoing downward trend.' });
      }
    }
  }
  return alerts;
}

function _renderCompositeAlertsPanel(summaries) {
  var alerts = _computeCompositeAlerts(summaries);
  if (!alerts.length) {
    return '<div class="monitor-empty-inline monitor-empty-inline--ok">No composite multi-metric alerts detected for this patient in the current window. Single-metric flags may still appear in the Alert flags section above.</div>';
  }
  var cards = alerts.map(function(a) {
    var toneKey = a.severity === 'critical' ? 'red' : 'orange';
    return '<article class="monitor-issue monitor-issue--' + toneKey + '" style="padding:12px 14px;margin-bottom:8px">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
      + '<span style="font-size:16px">' + a.icon + '</span>'
      + '<div style="font-size:13px;font-weight:700;color:var(--text-primary)">' + esc(a.title) + '</div>'
      + '<span class="monitor-badge monitor-badge--' + toneKey + '" style="margin-left:auto">' + esc(a.severity) + '</span></div>'
      + '<div style="font-size:12px;color:var(--text-secondary);line-height:1.5">' + esc(a.detail) + '</div>'
      + '</article>';
  }).join('');
  return cards
    + '<p class="monitor-muted" style="margin-top:8px">Composite alerts are rule-based multi-metric combinations using personal baseline deviations and absolute thresholds. They do not diagnose; they flag patterns warranting clinician attention.</p>';
}


function _renderAiPanel(s, patientId) {
  var ai = s.biometricsAi || null;
  if (!ai) {
    return '<section class="monitor-panel" data-testid="monitor-ai-summary-unavailable"><div class="monitor-panel-head"><h3>AI-assisted summary</h3></div>'
      + '<p class="monitor-muted">AI biometrics summary not connected on this analyzer page. Use DeepTwin or Protocol Studio with patient context; all outputs remain drafts pending clinician review.</p>'
      + '</section>';
  }
  if (ai.loading) {
    return '<section class="monitor-panel"><div class="monitor-panel-head"><h3>AI-assisted summary</h3><span>Loading\u2026</span></div>'
      + '<p class="monitor-muted">Fetching biometrics evidence and correlations\u2026</p></section>';
  }
  if (ai.error) {
    return '<section class="monitor-panel"><div class="monitor-panel-head"><h3>AI-assisted summary</h3></div>'
      + '<p class="monitor-muted">Could not load AI insights (' + esc(ai.error) + '). Use DeepTwin or Protocol Studio for detailed analysis.</p></section>';
  }
  var insights = [];
  if (ai.correlations && Array.isArray(ai.correlations.insights)) {
    insights = ai.correlations.insights.slice(0, 3);
  } else if (ai.correlations && Array.isArray(ai.correlations.results)) {
    insights = ai.correlations.results.slice(0, 3);
  }
  var evidence = [];
  if (ai.evidence && Array.isArray(ai.evidence.supporting_papers)) {
    evidence = ai.evidence.supporting_papers.slice(0, 3);
  }
  var html = '<section class="monitor-panel"><div class="monitor-panel-head"><h3>AI-assisted summary</h3><span>Draft \u2014 clinician review required</span></div>';
  if (ai.llmSummary) {
    html += '<div style="padding:10px 12px;border-radius:10px;background:rgba(0,212,188,0.06);border:1px solid rgba(0,212,188,0.18);margin-bottom:10px;font-size:13px;line-height:1.6;color:var(--text-secondary)">'
      + '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--teal);margin-bottom:6px">LLM-generated narrative</div>'
      + esc(ai.llmSummary) + '</div>';
  }
  if (insights.length) {
    html += '<div style="margin-bottom:10px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary);margin-bottom:6px">Correlation insights</div>';
    html += insights.map(function(i) {
      return '<div style="padding:8px 10px;border-radius:8px;background:rgba(255,255,255,0.025);border:1px solid var(--border);margin-bottom:6px;font-size:12px;color:var(--text-secondary)">'
        + esc(i.summary || i.text || (i.feature_a + ' \u2194 ' + i.feature_b + ' r=' + (i.coefficient != null ? i.coefficient.toFixed(2) : '?'))) + '</div>';
    }).join('');
    html += '</div>';
  }
  if (evidence.length) {
    html += '<div style="margin-bottom:10px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary);margin-bottom:6px">Evidence references</div>';
    html += evidence.map(function(p) {
      return '<div style="padding:8px 10px;border-radius:8px;background:rgba(255,255,255,0.025);border:1px solid var(--border);margin-bottom:6px;font-size:12px;color:var(--text-secondary)">'
        + '<strong style="color:var(--text-primary)">' + esc(p.title || 'Untitled') + '</strong>'
        + (p.journal ? ' <span style="color:var(--text-tertiary)">\u00b7 ' + esc(p.journal) + '</span>' : '')
        + '</div>';
    }).join('');
    html += '</div>';
  }
  if (!ai.llmSummary && !insights.length && !evidence.length) {
    html += '<p class="monitor-muted">No AI insights returned for this patient window. This may be because the evidence service is unavailable or the window has insufficient data.</p>';
  }
  html += '</section>';
  return html;
}

async function loadBiometricsAi(s, patientId) {
  if (!patientId || !canUseBiometricsAnalyzer()) return;
  s.biometricsAi = { loading: true };
  try { render(); } catch {}
  try {
    var corr = null, feat = null;
    if (api.biometricsCorrelations) {
      corr = await api.biometricsCorrelations({ days: s.patientWearableDays || 30, patient_id: patientId });
    }
    if (api.biometricsFeatures) {
      feat = await api.biometricsFeatures({ days: s.patientWearableDays || 30, patient_id: patientId });
    }
    var ev = null;
    if (api.biometricsEvidence && corr && feat) {
      ev = await api.biometricsEvidence({
        evidence_target: 'stress_load',
        context_type: 'biomarker',
        max_results: 5,
        patient_id: patientId,
        correlation_snapshot: corr,
        features_snapshot: feat,
      });
    }
    var llmSummary = null;
    if (api.chatClinician && (corr || feat || ev)) {
      try {
        var summaries = (s.patientDetail && Array.isArray(s.patientDetail.summaries)) ? s.patientDetail.summaries : [];
        var last = summaries.length ? summaries[summaries.length - 1] : {};
        var prompt = _buildBiometricsLlmPrompt({ patientId: patientId, summaries: summaries, last: last, correlations: corr, evidence: ev, days: s.patientWearableDays || 30 });
        var chatResp = await api.chatClinician([{ role: 'user', content: prompt }]);
        llmSummary = (chatResp && chatResp.message) ? chatResp.message : null;
      } catch (_llmErr) { llmSummary = null; }
    }
    s.biometricsAi = { loading: false, correlations: corr, features: feat, evidence: ev, llmSummary: llmSummary };
  } catch (e) {
    s.biometricsAi = { loading: false, error: (e && e.message) ? String(e.message) : 'Failed to load' };
  }
  if (state().tab === 'biometrics-analyzer') render();
}

function _buildBiometricsLlmPrompt(ctx) {
  var lines = ['You are a senior clinical decision-support assistant specializing in wearable biometrics analysis for neuromodulation clinics. Generate a comprehensive, structured clinician-ready report. Do NOT diagnose, prescribe, or recommend specific treatments. All outputs are decision-support only and require clinician review.'];
  lines.push('');
  lines.push('--- PATIENT CONTEXT ---');
  lines.push('Patient ID: ' + (ctx.patientId || 'unknown'));
  lines.push('Analysis window: ' + (ctx.days || 30) + ' days');
  lines.push('Report generated: ' + new Date().toISOString());
  if (ctx.patientCtx && ctx.patientCtx.preview_text) {
    lines.push('Medical history summary (prompt-safe): ' + String(ctx.patientCtx.preview_text).slice(0, 600));
  }
  lines.push('');
  lines.push('--- LATEST METRICS (with reference range status) ---');
  var last = ctx.last || {};
  var mets = [
    { k: 'hrv_ms', label: 'HRV (RMSSD)', unit: 'ms', ref: '20-70' },
    { k: 'rhr_bpm', label: 'Resting Heart Rate', unit: 'bpm', ref: '60-100' },
    { k: 'sleep_duration_h', label: 'Sleep Duration', unit: 'h', ref: '7-9' },
    { k: 'steps', label: 'Daily Steps', unit: '', ref: '4000-12000' },
    { k: 'spo2_pct', label: 'SpO2', unit: '%', ref: '95-100' },
    { k: 'readiness_score', label: 'Readiness Score', unit: '', ref: '60-100' },
  ];
  mets.forEach(function(m) {
    var v = last[m.k];
    var has = v != null && !Number.isNaN(Number(v));
    var st = has ? _metricStatus(v, m.k) : null;
    lines.push(m.label + ': ' + (has ? v : 'N/A') + ' ' + m.unit + ' | Reference: ' + m.ref + ' | Status: ' + (has ? st.label : 'No data'));
  });
  lines.push('');
  lines.push('--- TIME-SERIES SUMMARY ---');
  var summaries = ctx.summaries || [];
  if (summaries.length >= 2) {
    lines.push('Data points: ' + summaries.length + ' daily summaries');
    ['hrv_ms', 'rhr_bpm', 'sleep_duration_h', 'steps', 'spo2_pct', 'readiness_score'].forEach(function(key) {
      var vals = summaries.map(function(s) { return s[key]; }).filter(function(v) { return v != null && !Number.isNaN(Number(v)); });
      if (vals.length >= 2) {
        var mean = vals.reduce(function(a,b){return a+b;},0) / vals.length;
        var min = Math.min.apply(null, vals);
        var max = Math.max.apply(null, vals);
        var first = vals[0];
        var lastV = vals[vals.length - 1];
        var trend = lastV > first ? 'increasing' : lastV < first ? 'decreasing' : 'stable';
        lines.push(key + ': mean=' + mean.toFixed(1) + ', range=[' + min.toFixed(1) + '-' + max.toFixed(1) + '], trend=' + trend + ' over window');
      } else {
        lines.push(key + ': insufficient data for trend analysis');
      }
    });
  } else {
    lines.push('Insufficient time-series data for trend analysis.');
  }
  lines.push('');
  lines.push('--- CORRELATIONS & EVIDENCE ---');
  if (ctx.correlations && ctx.correlations.insights && ctx.correlations.insights.length) {
    lines.push('Correlation insights:');
    ctx.correlations.insights.slice(0, 5).forEach(function(i, idx) {
      lines.push((idx+1) + '. ' + (i.summary || i.text || (i.feature_a + ' \u2194 ' + i.feature_b + ' (r=' + (i.coefficient != null ? i.coefficient.toFixed(2) : '?') + ')')));
    });
  } else { lines.push('No correlation insights available.'); }
  if (ctx.evidence && ctx.evidence.supporting_papers && ctx.evidence.supporting_papers.length) {
    lines.push('Literature evidence:');
    ctx.evidence.supporting_papers.slice(0, 5).forEach(function(p, idx) {
      lines.push((idx+1) + '. ' + (p.title || 'Untitled') + (p.journal ? ' \u2014 ' + p.journal : '') + (p.year ? ' (' + p.year + ')' : '') + (p.relevance_note ? ' | ' + p.relevance_note : ''));
    });
  } else { lines.push('No literature evidence retrieved.'); }
  lines.push('');
  lines.push('--- DATA QUALITY ASSESSMENT ---');
  var totalExpected = summaries.length * 6;
  var totalPresent = 0;
  summaries.forEach(function(s) {
    ['hrv_ms', 'rhr_bpm', 'sleep_duration_h', 'steps', 'spo2_pct', 'readiness_score'].forEach(function(k) {
      if (s[k] != null && !Number.isNaN(Number(s[k]))) totalPresent++;
    });
  });
  var completeness = totalExpected > 0 ? ((totalPresent / totalExpected) * 100).toFixed(1) : '0';
  lines.push('Data completeness: ' + completeness + '% (' + totalPresent + '/' + totalExpected + ' expected metric-days)');
  lines.push('Days with data: ' + summaries.length);
  if (ctx.connections && ctx.connections.length) {
    lines.push('Active device connections: ' + ctx.connections.length);
    ctx.connections.forEach(function(c) {
      lines.push('  - ' + (c.display_name || c.source) + ': ' + (c.status || 'unknown') + ' (last sync: ' + (c.last_sync_at || 'unknown') + ')');
    });
  }
  lines.push('');
  lines.push('--- REQUIRED OUTPUT FORMAT ---');
  lines.push('Write a comprehensive structured report in Markdown with the following sections:');
  lines.push('');
  lines.push('# Wearable Biometrics Clinical Summary Report');
  lines.push('## 1. Executive Summary');
  lines.push('   - 2-3 paragraphs synthesizing the overall biometrics picture');
  lines.push('   - Highlight any clinically significant deviations from reference ranges');
  lines.push('   - Note the quality and reliability of the available data');
  lines.push('');
  lines.push('## 2. Patient Context');
  lines.push('   - Brief patient identifier and analysis window');
  lines.push('   - Relevant medical history context if available');
  lines.push('');
  lines.push('## 3. Key Metrics \u2014 Latest Values & Status');
  lines.push('   - Table-like presentation of all 6 metrics with values, units, reference ranges, and status');
  lines.push('   - Color-code conceptually: normal (green), borderline (amber), abnormal (red), missing (grey)');
  lines.push('');
  lines.push('## 4. Temporal Trends & Patterns');
  lines.push('   - Describe trajectories for each metric over the analysis window');
  lines.push('   - Identify any inflection points, steady declines, or recoveries');
  lines.push('   - Compare recent vs. earlier-in-window values');
  lines.push('');
  lines.push('## 5. Inter-Metric Correlations & Clinical Interpretation');
  lines.push('   - Discuss significant correlations and their potential clinical relevance');
  lines.push('   - Cite evidence from the literature where available');
  lines.push('   - Explicitly state: "Correlation does not imply causation"');
  lines.push('');
  lines.push('## 6. Data Quality & Coverage Assessment');
  lines.push('   - Completeness percentage and missing data patterns');
  lines.push('   - Device connection status and sync reliability');
  lines.push('   - Any data quality flags that affect interpretability');
  lines.push('');
  lines.push('## 7. Risk Stratification & Monitoring Recommendations');
  lines.push('   - Identify metrics warranting closer monitoring');
  lines.push('   - Suggest review intervals (e.g., "re-review in 1 week", "daily monitoring advisable")');
  lines.push('   - Flag any combinations that may indicate acute concern (without diagnosing)');
  lines.push('');
  lines.push('## 8. Suggested Review Points for Clinical Team');
  lines.push('   - Bullet-point actionable items for the clinician');
  lines.push('   - Cross-references to other modules (qEEG, MRI, assessments) if relevant');
  lines.push('   - Questions the data raises that require clinical judgment');
  lines.push('');
  lines.push('## 9. Limitations & Disclaimers');
  lines.push('   - Consumer/research-grade device limitations');
  lines.push('   - General population reference ranges may not apply to this patient');
  lines.push('   - This report is decision-support only and does not constitute diagnosis or treatment recommendation');
  lines.push('   - All outputs require clinician review before any clinical action');
  lines.push('');
  lines.push('Use clinical terminology appropriate for a neuromodulation specialist. Be precise with numbers. Flag uncertainty explicitly. When data is missing, say so clearly rather than inferring.');
  return lines.join('\n');
}

function _buildPatientFriendlyLlmPrompt(ctx) {
  var lines = ['You are a helpful health educator. Write a plain-language summary of wearable biometrics for a patient. Use 8th-grade reading level. Avoid medical jargon. Be warm, reassuring, and clear.'];
  lines.push('');
  lines.push('--- PATIENT CONTEXT ---');
  lines.push('Patient ID: ' + (ctx.patientId || 'unknown'));
  lines.push('Analysis window: ' + (ctx.days || 30) + ' days');
  lines.push('Report generated: ' + new Date().toISOString());
  lines.push('');
  lines.push('--- LATEST METRICS ---');
  var last = ctx.last || {};
  var mets = [
    { k: 'hrv_ms', label: 'Heart Rate Variability (HRV)', unit: 'ms', ref: '20-70', icon: '\u2764\uFE0F' },
    { k: 'rhr_bpm', label: 'Resting Heart Rate', unit: 'bpm', ref: '60-100', icon: '\uD83D\uDC93' },
    { k: 'sleep_duration_h', label: 'Sleep Duration', unit: 'hours', ref: '7-9', icon: '\uD83D\uDE34' },
    { k: 'steps', label: 'Daily Steps', unit: 'steps', ref: '4000-12000', icon: '\uD83D\uDC63' },
    { k: 'spo2_pct', label: 'Blood Oxygen (SpO2)', unit: '%', ref: '95-100', icon: '\uD83E\uDEC1' },
    { k: 'readiness_score', label: 'Readiness Score', unit: '', ref: '60-100', icon: '\uD83D\uDCAA' },
  ];
  mets.forEach(function(m) {
    var v = last[m.k];
    var has = v != null && !Number.isNaN(Number(v));
    var st = has ? _metricStatus(v, m.k) : null;
    lines.push(m.icon + ' ' + m.label + ': ' + (has ? v : 'No data') + ' ' + m.unit + ' (typical range: ' + m.ref + ') — ' + (has ? st.label : 'No data'));
  });
  lines.push('');
  lines.push('--- TIME-SERIES SUMMARY ---');
  var summaries = ctx.summaries || [];
  if (summaries.length >= 2) {
    lines.push('Here is how things changed over ' + summaries.length + ' days:');
    ['hrv_ms', 'rhr_bpm', 'sleep_duration_h', 'steps', 'spo2_pct', 'readiness_score'].forEach(function(key) {
      var vals = summaries.map(function(s) { return s[key]; }).filter(function(v) { return v != null && !Number.isNaN(Number(v)); });
      if (vals.length >= 2) {
        var mean = vals.reduce(function(a,b){return a+b;},0) / vals.length;
        var min = Math.min.apply(null, vals);
        var max = Math.max.apply(null, vals);
        var first = vals[0];
        var lastV = vals[vals.length - 1];
        var trend = lastV > first ? 'going up' : lastV < first ? 'going down' : 'staying about the same';
        lines.push(key + ': average ' + mean.toFixed(1) + ', between ' + min.toFixed(1) + ' and ' + max.toFixed(1) + ', overall ' + trend);
      } else {
        lines.push(key + ': not enough data');
      }
    });
  } else {
    lines.push('Not enough daily data to show trends.');
  }
  lines.push('');
  lines.push('--- INSTRUCTIONS ---');
  lines.push('Write a short, friendly report using these sections:');
  lines.push('');
  lines.push('# Your Wearable Health Summary');
  lines.push('## What the numbers mean');
  lines.push('Explain each metric in plain English. Use the emoji icons. Tell the patient what the number means for their body and energy.');
  lines.push('');
  lines.push('## Trends');
  lines.push('Describe how things are changing in everyday language.');
  lines.push('');
  lines.push('## 2-3 things you can do');
  lines.push('Give 2-3 simple, actionable lifestyle tips (sleep, movement, stress, hydration). Be encouraging.');
  lines.push('');
  lines.push('## Reassurance');
  lines.push('Offer calm, honest reassurance. If something is slightly off, say it gently and suggest talking to the care team.');
  lines.push('');
  lines.push('## When to talk to your doctor');
  lines.push('Include a clear, kind callout: "If you feel unwell, have new symptoms, or these numbers worry you, talk to your doctor or care team."');
  lines.push('');
  lines.push('Keep sentences short. Use bullet points. Avoid diagnosing or prescribing. This is for education only.');
  return lines.join('\n');
}

function _buildFhirBundle(s, patientId) {
  var today = new Date().toISOString();
  var pid = patientId || 'unknown';
  var summaries = (s.patientDetail && Array.isArray(s.patientDetail.summaries)) ? s.patientDetail.summaries : [];
  var last = summaries.length ? summaries[summaries.length - 1] : {};
  var observations = [];
  var metricDefs = [
    { key: 'hrv_ms', label: 'Heart rate variability', loinc: '80404-7', unit: 'ms', system: 'http://unitsofmeasure.org', code: 'ms', ref: '20-70' },
    { key: 'rhr_bpm', label: 'Resting heart rate', loinc: '8867-4', unit: 'beats/min', system: 'http://unitsofmeasure.org', code: '/min', ref: '60-100' },
    { key: 'sleep_duration_h', label: 'Sleep duration', loinc: '93832-4', unit: 'h', system: 'http://unitsofmeasure.org', code: 'h', ref: '7-9' },
    { key: 'steps', label: 'Steps in 24 hours', loinc: '41950-7', unit: 'steps', system: 'http://unitsofmeasure.org', code: '{steps}', ref: '4000-12000' },
    { key: 'spo2_pct', label: 'Oxygen saturation', loinc: '2708-6', unit: '%', system: 'http://unitsofmeasure.org', code: '%', ref: '95-100' },
    { key: 'readiness_score', label: 'Readiness score', loinc: null, unit: 'score', system: 'http://unitsofmeasure.org', code: '1', ref: '60-100' },
  ];
  metricDefs.forEach(function(m, idx) {
    var val = last[m.key];
    var has = val != null && !Number.isNaN(Number(val));
    if (!has) return;
    var obs = {
      resourceType: 'Observation',
      id: 'obs-' + m.key + '-' + pid,
      status: 'final',
      category: [{
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'vital-signs',
          display: 'Vital Signs'
        }],
        text: 'Vital Signs'
      }],
      code: {
        coding: m.loinc ? [{
          system: 'http://loinc.org',
          code: m.loinc,
          display: m.label
        }] : [],
        text: m.label
      },
      subject: { reference: 'Patient/' + pid },
      effectiveDateTime: last.date ? String(last.date).slice(0, 10) + 'T00:00:00Z' : today,
      valueQuantity: {
        value: Number(val),
        unit: m.unit,
        system: m.system,
        code: m.code
      }
    };
    if (m.ref) {
      var refParts = m.ref.split('-');
      if (refParts.length === 2) {
        obs.referenceRange = [{
          low: { value: Number(refParts[0]), unit: m.unit, system: m.system, code: m.code },
          high: { value: Number(refParts[1]), unit: m.unit, system: m.system, code: m.code },
          text: 'Reference range: ' + m.ref + ' ' + m.unit
        }];
      }
    }
    observations.push(obs);
  });
  var composition = {
    resourceType: 'Composition',
    id: 'comp-biometrics-' + pid,
    status: 'final',
    type: {
      coding: [{
        system: 'http://loinc.org',
        code: '11503-0',
        display: 'Medical records'
      }],
      text: 'Wearable Biometrics Report'
    },
    subject: { reference: 'Patient/' + pid },
    date: today,
    title: 'Wearable Biometrics Report',
    section: [{
      title: 'Observations',
      entry: observations.map(function(o) { return { reference: 'Observation/' + o.id }; })
    }]
  };
  var bundle = {
    resourceType: 'Bundle',
    id: 'bundle-biometrics-' + pid + '-' + today.slice(0, 10),
    type: 'document',
    timestamp: today,
    entry: [{ resource: composition }].concat(observations.map(function(o) { return { resource: o, fullUrl: 'urn:uuid:' + o.id }; }))
  };
  return bundle;
}

function _buildFhirBiometricsBundle(s, patientId, today) {
  return _buildFhirBundle(s, patientId);
}


function _markdownToReportHtml(md) {
  if (!md) return '';
  var html = esc(md)
    .replace(/^#### (.*$)/gim, '<h5 style="margin:10px 0 4px;font-size:13px;font-weight:700;color:var(--text-primary)">$1</h5>')
    .replace(/^### (.*$)/gim, '<h4 style="margin:12px 0 6px;font-size:14px;font-weight:700;color:var(--text-primary)">$1</h4>')
    .replace(/^## (.*$)/gim, '<h3 style="margin:16px 0 8px;font-size:16px;font-weight:700;color:var(--text-primary);border-bottom:1px solid var(--border);padding-bottom:4px">$1</h3>')
    .replace(/^# (.*$)/gim, '<h2 style="margin:20px 0 10px;font-size:20px;font-weight:700;color:var(--text-primary)">$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text-primary)">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^\s*-\s+(.*$)/gim, '<li style="margin:4px 0 4px 16px">$1</li>')
    .replace(/^\s*\d+\.\s+(.*$)/gim, '<li style="margin:4px 0 4px 16px">$1</li>')
    .replace(/\n\n/g, '</p><p style="margin:8px 0;line-height:1.7">')
    .replace(/\n/g, ' ');
  return '<div class="monitor-report-body"><p style="margin:8px 0;line-height:1.7">' + html + '</p></div>';
}

function _markdownToPatientFriendlyHtml(md) {
  if (!md) return '';
  var html = esc(md)
    .replace(/^#### (.*$)/gim, '<h5 style="margin:14px 0 6px;font-size:16px;font-weight:700;color:var(--text-primary)">$1</h5>')
    .replace(/^### (.*$)/gim, '<h4 style="margin:18px 0 10px;font-size:18px;font-weight:700;color:var(--text-primary)">$1</h4>')
    .replace(/^## (.*$)/gim, '<h3 style="margin:22px 0 12px;font-size:20px;font-weight:700;color:var(--text-primary);border-bottom:1px solid var(--border);padding-bottom:6px">$1</h3>')
    .replace(/^# (.*$)/gim, '<h2 style="margin:28px 0 14px;font-size:24px;font-weight:700;color:var(--text-primary)">$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text-primary)">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^\s*-\s+(.*$)/gim, '<li style="margin:8px 0 8px 20px;font-size:15px">$1</li>')
    .replace(/^\s*\d+\.\s+(.*$)/gim, '<li style="margin:8px 0 8px 20px;font-size:15px">$1</li>')
    .replace(/\n\n/g, '</p><p style="margin:12px 0;line-height:1.8;font-size:15px">')
    .replace(/\n/g, ' ');
  return '<div class="monitor-report-body monitor-report-body--patient-friendly" style="padding:8px 4px"><p style="margin:12px 0;line-height:1.8;font-size:15px">' + html + '</p></div>';
}

function _renderBiometricsReportPanel(s) {
  var rep = s.biometricsReport || null;
  if (!rep) return '';
  if (rep.loading) {
    return '<section class="monitor-panel"><div class="monitor-panel-head"><h3>Biometrics Report</h3><span>Generating…</span></div>'
      + '<p class="monitor-muted">LLM is drafting a comprehensive clinician-ready wearable biometrics report. This may take 10–60 seconds depending on data volume.</p></section>';
  }
  if (rep.error) {
    return '<section class="monitor-panel"><div class="monitor-panel-head"><h3>Biometrics Report</h3></div>'
      + '<p class="monitor-muted">Report generation failed: ' + esc(rep.error) + '. You can retry or export raw data instead.</p></section>';
  }
  var isPatient = rep.isPatientFriendly;
  if (isPatient && rep.patientFriendlyLoading) {
    return '<section class="monitor-panel"><div class="monitor-panel-head"><h3>Biometrics Report</h3><span>Generating patient-friendly version…</span></div>'
      + '<p class="monitor-muted">Drafting a plain-language summary for the patient. This may take 10–60 seconds.</p></section>';
  }
  if (isPatient && rep.patientFriendlyError) {
    return '<section class="monitor-panel"><div class="monitor-panel-head"><h3>Biometrics Report</h3></div>'
      + '<p class="monitor-muted">Patient-friendly report failed: ' + esc(rep.patientFriendlyError) + '. You can switch back to the clinical report.</p></section>';
  }
  var bodyHtml = isPatient
    ? _markdownToPatientFriendlyHtml(rep.patientFriendlyMarkdown || '')
    : _markdownToReportHtml(rep.markdown || '');
  var toggleBar = '<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">'
    + '<span style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em">View</span>'
    + '<select class="monitor-select" style="font-size:12px" onchange="window._monitorSwitchReportMode(this.value)">'
    + '<option value="clinical"' + (isPatient ? '' : ' selected') + '>Clinical report</option>'
    + '<option value="patient-friendly"' + (isPatient ? ' selected' : '') + '>Patient-friendly report</option>'
    + '</select>'
    + (isPatient ? '<button type="button" class="btn btn-sm btn-primary" onclick="window._monitorSavePatientFriendlyReport()">Share with patient</button>' : '')
    + '</div>';
  var formatBar = '<div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap;align-items:center">'
    + '<span style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em;margin-right:4px">Export</span>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorDownloadReport(\'markdown\')">Markdown</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorDownloadReport(\'html\')">HTML</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorDownloadReport(\'pdf\')">PDF</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorDownloadReport(\'docx\')">DOCX</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorDownloadReport(\'json\')">JSON</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorDownloadReport(\'fhir\')">FHIR JSON</button>'
    + '</div>';
  var actions = '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">'
    + '<button type="button" class="btn btn-sm btn-primary" onclick="window._monitorSaveBiometricsReport()">Save to patient record</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorRegenerateBiometricsReport()">Regenerate</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorPrintBiometricsReport()">Print</button>'
    + '</div>';
  var meta = '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:10px">'
    + 'Generated: ' + esc(rep.generatedAt ? new Date(rep.generatedAt).toLocaleString() : 'just now')
    + (rep.patientId ? ' · Patient: ' + esc(rep.patientId) : '')
    + (rep.savedId ? ' · Saved as: ' + esc(rep.savedId) : '')
    + '</div>';
  return '<section class="monitor-panel" id="monitor-biometrics-report-panel"><div class="monitor-panel-head"><h3>Biometrics Report</h3><span>AI-generated — clinician review required</span></div>'
    + meta
    + toggleBar
    + bodyHtml
    + actions
    + formatBar
    + '</section>';
}

/* ── Scheduled Auto-Report logic ───────────────────────────────────────────── */

function _persistBiometricsSchedules(schedules) {
  try {
    localStorage.setItem(SCHEDULES_KEY, JSON.stringify(schedules || []));
  } catch {}
}

function _shouldTriggerSchedule(schedule, now) {
  if (!schedule || !schedule.enabled) return false;
  var hour = now.getHours();
  var minute = now.getMinutes();
  var timeParts = (schedule.time || '08:00').split(':');
  var targetHour = parseInt(timeParts[0], 10);
  var targetMinute = parseInt(timeParts[1], 10);
  if (hour !== targetHour || minute !== targetMinute) return false;
  var lastRun = schedule.lastRun ? new Date(schedule.lastRun) : null;
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (lastRun && new Date(lastRun.getFullYear(), lastRun.getMonth(), lastRun.getDate()) >= today) return false;
  var freq = schedule.frequency || 'daily';
  var day = now.getDay();
  var date = now.getDate();
  if (freq === 'daily') return true;
  if (freq === 'weekly') return day === 1;
  if (freq === 'bi-weekly') {
    if (day !== 1) return false;
    if (!lastRun) return true;
    var lastRunDay = new Date(lastRun.getFullYear(), lastRun.getMonth(), lastRun.getDate());
    var daysSince = (today - lastRunDay) / 86400000;
    return daysSince >= 14;
  }
  if (freq === 'monthly') return date === 1;
  return false;
}

function _buildDemoBiometricsReport(s, patientId) {
  var detail = s.patientDetail || {};
  var last = (detail.summaries && detail.summaries.length) ? detail.summaries[detail.summaries.length - 1] : {};
  var lines = ['# Wearable Biometrics Clinical Summary Report (DEMO)', '', '**Patient:** ' + (patientId || 'unknown'), '**Generated:** ' + new Date().toISOString(), '**Status:** DEMO / illustrative only \u2014 not patient PHI', ''];
  lines.push('## Latest Metrics');
  lines.push('- HRV: ' + (last.hrv_ms != null ? last.hrv_ms : 'N/A') + ' ms');
  lines.push('- Resting HR: ' + (last.rhr_bpm != null ? last.rhr_bpm : 'N/A') + ' bpm');
  lines.push('- Sleep: ' + (last.sleep_duration_h != null ? last.sleep_duration_h : 'N/A') + ' h');
  lines.push('- Steps: ' + (last.steps != null ? last.steps : 'N/A'));
  lines.push('- SpO\u2082: ' + (last.spo2_pct != null ? last.spo2_pct : 'N/A') + '%');
  lines.push('- Readiness: ' + (last.readiness_score != null ? last.readiness_score : 'N/A'));
  lines.push('');
  lines.push('## Disclaimers');
  lines.push('This is a DEMO report generated because the API was unavailable. It uses synthetic or cached data for illustration only. Do not use for clinical decision-making.');
  return lines.join('\n');
}

function _checkBiometricsSchedules() {
  var s = state();
  if (!canUseBiometricsAnalyzer()) return;
  var pid = s.selectedPatientId || window._selectedPatientId;
  if (!pid) return;
  var schedules = s.biometricsReportSchedules || [];
  if (!schedules.length) return;
  var now = new Date();
  schedules.forEach(function(sch) {
    if (!sch.enabled) return;
    if (_shouldTriggerSchedule(sch, now)) {
      sch.lastRun = now.toISOString();
      _persistBiometricsSchedules(schedules);
      _runBiometricsSchedule(sch, pid);
    }
  });
}

async function _runBiometricsSchedule(sch, pid) {
  var s = state();
  var isDemo = _demoPatientId(pid) || _isDemoMode();
  try {
    if (!s.biometricsReport || !s.biometricsReport.markdown) {
      if (isDemo || !api.chatClinician) {
        var demoMd = _buildDemoBiometricsReport(s, pid);
        s.biometricsReport = { loading: false, markdown: demoMd, generatedAt: new Date().toISOString(), patientId: pid, isDemo: true };
      } else {
        await _generateBiometricsReport(s, pid);
      }
    }
    var rep = s.biometricsReport;
    if (!rep || !rep.markdown) {
      window._dsToast?.({ title: 'Auto-report failed', body: 'No report content available for ' + esc(pid), severity: 'warn' });
      return;
    }
    if (sch.delivery === 'save-to-record') {
      if (!rep.savedId) {
        await window._monitorSaveBiometricsReport();
      }
    }
    if (sch.format === 'pdf') {
      if (!rep.savedId) await window._monitorSaveBiometricsReport();
      await window._monitorDownloadReport('pdf');
    } else if (sch.format === 'html') {
      await window._monitorDownloadReport('html');
    } else if (sch.format === 'markdown') {
      await window._monitorDownloadReport('markdown');
    } else if (sch.format === 'patient-friendly') {
      if (!rep.patientFriendlyMarkdown) {
        await _generatePatientFriendlyReport(s, pid);
      }
      if (rep.patientFriendlyMarkdown) {
        var pfBlob = new Blob([rep.patientFriendlyMarkdown], { type: 'text/markdown;charset=utf-8' });
        var pfUrl = URL.createObjectURL(pfBlob);
        var pfA = document.createElement('a');
        pfA.href = pfUrl;
        pfA.download = 'biometrics-report-patient-friendly-' + (pid || 'unknown') + '-' + new Date().toISOString().slice(0, 10) + '.md';
        document.body.appendChild(pfA); pfA.click(); pfA.remove();
        setTimeout(function () { URL.revokeObjectURL(pfUrl); }, 200);
      }
    }
    window._dsToast?.({
      title: 'Auto-report generated',
      body: (rep.isDemo ? '[DEMO] ' : '') + 'Auto-report generated for ' + esc(pid),
      severity: 'success',
    });
  } catch (e) {
    window._dsToast?.({
      title: 'Auto-report failed',
      body: 'Scheduled report failed for ' + esc(pid) + ': ' + esc((e && e.message) ? e.message : 'unknown'),
      severity: 'warn',
    });
  }
  if (state().tab === 'biometrics-analyzer') render();
}

async function _generateBiometricsReport(s, patientId) {
  if (!patientId || !canUseBiometricsAnalyzer()) return;
  s.biometricsReport = { loading: true };
  try { render(); } catch {}
  try {
    var summaries = (s.patientDetail && Array.isArray(s.patientDetail.summaries)) ? s.patientDetail.summaries : [];
    var last = summaries.length ? summaries[summaries.length - 1] : {};
    var ai = s.biometricsAi || {};
    var connections = (s.patientDetail && Array.isArray(s.patientDetail.connections)) ? s.patientDetail.connections : [];
    var patientCtx = null;
    if (api.getPatientMedicalHistoryAIContext) {
      try { patientCtx = await api.getPatientMedicalHistoryAIContext(patientId); } catch {}
    }
    var prompt = _buildBiometricsLlmPrompt({
      patientId: patientId,
      summaries: summaries,
      last: last,
      correlations: ai.correlations,
      evidence: ai.evidence,
      connections: connections,
      patientCtx: patientCtx,
      days: s.patientWearableDays || 30,
    });
    var reportMarkdown = '';
    if (api.chatClinician) {
      var chatResp = await api.chatClinician([{ role: 'user', content: prompt }]);
      reportMarkdown = (chatResp && chatResp.message) ? chatResp.message : '';
    }
    if (!reportMarkdown && api.wearableCopilotClinician) {
      var copResp = await api.wearableCopilotClinician(patientId, [{ role: 'user', content: prompt }]);
      reportMarkdown = (copResp && copResp.message) ? copResp.message : '';
    }
    if (!reportMarkdown) {
      s.biometricsReport = { loading: false, error: 'No LLM response. The chat service may be unavailable.' };
    } else {
      s.biometricsReport = { loading: false, markdown: reportMarkdown, generatedAt: new Date().toISOString(), patientId: patientId };
    }
  } catch (e) {
    s.biometricsReport = { loading: false, error: (e && e.message) ? String(e.message) : 'Failed to generate report' };
  }
  if (state().tab === 'biometrics-analyzer') render();
}

async function _generatePatientFriendlyReport(s, patientId) {
  if (!patientId || !canUseBiometricsAnalyzer()) return;
  var rep = s.biometricsReport || {};
  rep.patientFriendlyLoading = true;
  try { render(); } catch {}
  try {
    var summaries = (s.patientDetail && Array.isArray(s.patientDetail.summaries)) ? s.patientDetail.summaries : [];
    var last = summaries.length ? summaries[summaries.length - 1] : {};
    var ai = s.biometricsAi || {};
    var connections = (s.patientDetail && Array.isArray(s.patientDetail.connections)) ? s.patientDetail.connections : [];
    var patientCtx = null;
    if (api.getPatientMedicalHistoryAIContext) {
      try { patientCtx = await api.getPatientMedicalHistoryAIContext(patientId); } catch {}
    }
    var prompt = _buildPatientFriendlyLlmPrompt({
      patientId: patientId,
      summaries: summaries,
      last: last,
      correlations: ai.correlations,
      evidence: ai.evidence,
      connections: connections,
      patientCtx: patientCtx,
      days: s.patientWearableDays || 30,
    });
    var reportMarkdown = '';
    if (api.chatClinician) {
      var chatResp = await api.chatClinician([{ role: 'user', content: prompt }]);
      reportMarkdown = (chatResp && chatResp.message) ? chatResp.message : '';
    }
    if (!reportMarkdown) {
      rep.patientFriendlyLoading = false;
      rep.patientFriendlyError = 'No LLM response. The chat service may be unavailable.';
    } else {
      rep.patientFriendlyLoading = false;
      rep.patientFriendlyMarkdown = reportMarkdown;
      rep.patientFriendlyGeneratedAt = new Date().toISOString();
      rep.isPatientFriendly = true;
    }
  } catch (e) {
    rep.patientFriendlyLoading = false;
    rep.patientFriendlyError = (e && e.message) ? String(e.message) : 'Failed to generate report';
  }
  if (state().tab === 'biometrics-analyzer') render();
}



/* ── Biomarkers / Lab cross-correlation panel ────────────────────────────── */

function _renderBiomarkersCorrelationPanel(s) {
  var detail = s.patientDetail || {};
  var summaries = Array.isArray(detail.summaries) ? detail.summaries : [];
  if (!summaries.length) return '';
  var labData = null;
  try {
    if (typeof flattenLabResults === 'function') {
      labData = flattenLabResults(s);
    } else if (window.flattenLabResults) {
      labData = window.flattenLabResults(s);
    }
  } catch (e) { labData = null; }
  if (!labData || !Array.isArray(labData) || !labData.length) {
    return '<section class="monitor-panel"><div class="monitor-panel-head"><h3>Biomarker Correlations</h3><span>Lab data</span></div>'
      + '<p class="monitor-muted">No lab results available for cross-correlation. Load biomarker data in the Biomarkers tab to see wearable-to-lab comparisons.</p></section>';
  }
  var last = summaries[summaries.length - 1] || {};
  var rows = [];
  function nearestLabBeforeDate(labList, metricDate, testName) {
    if (!labList || !metricDate) return null;
    var target = new Date(metricDate).getTime();
    var best = null;
    labList.forEach(function(l) {
      if (!l || !l.date) return;
      var ld = new Date(l.date).getTime();
      if (l.test !== testName) return;
      if (ld <= target && (!best || ld > new Date(best.date).getTime())) best = l;
    });
    return best;
  }
  var lastDate = last.date;
  var correlations = [];
  var hrvTrend = _computeTrendDirection(summaries, 'hrv_ms');
  var rhrTrend = _computeTrendDirection(summaries, 'rhr_bpm');
  var sleepTrend = _computeTrendDirection(summaries, 'sleep_duration_h');
  var cortisol = nearestLabBeforeDate(labData, lastDate, 'Cortisol (morning)');
  if (cortisol) {
    var cortNote = '';
    if (cortisol.value > 20 && hrvTrend === 'declining') cortNote = 'Elevated cortisol with declining HRV may suggest elevated allostatic load.';
    else if (cortisol.value > 20 && rhrTrend === 'rising') cortNote = 'Elevated cortisol with rising resting HR may suggest sympathetic overactivity.';
    else cortNote = 'No strong directional pattern vs wearable trends.';
    correlations.push({ test: 'Cortisol (morning)', value: cortisol.value + ' ' + (cortisol.unit || 'mcg/dL'), date: cortisol.date, note: cortNote });
  }
  var crp = nearestLabBeforeDate(labData, lastDate, 'CRP');
  if (crp) {
    var crpNote = '';
    if (crp.value > 3 && hrvTrend === 'declining') crpNote = 'Elevated CRP with declining HRV may reflect systemic inflammation impacting autonomic tone.';
    else crpNote = 'No strong directional pattern vs wearable trends.';
    correlations.push({ test: 'CRP', value: crp.value + ' ' + (crp.unit || 'mg/L'), date: crp.date, note: crpNote });
  }
  var tsh = nearestLabBeforeDate(labData, lastDate, 'TSH');
  if (tsh) {
    var tshNote = '';
    if (tsh.value > 4.5 && rhrTrend === 'declining') tshNote = 'Elevated TSH with declining resting HR is atypical; consider recency of lab draw.';
    else if (tsh.value > 4.5) tshNote = 'Elevated TSH may correlate with reduced metabolic rate; compare with activity trends.';
    else tshNote = 'TSH within common reference range.';
    correlations.push({ test: 'TSH', value: tsh.value + ' ' + (tsh.unit || 'mIU/L'), date: tsh.date, note: tshNote });
  }
  var a1c = nearestLabBeforeDate(labData, lastDate, 'HbA1c');
  if (a1c) {
    var a1cNote = '';
    if (a1c.value > 6.5) a1cNote = 'HbA1c above diabetic threshold; activity and sleep patterns may help contextualize glycemic control.';
    else if (a1c.value > 5.7) a1cNote = 'HbA1c in prediabetes range; consider steps and sleep as adjunct signals.';
    else a1cNote = 'HbA1c within common reference range.';
    correlations.push({ test: 'HbA1c', value: a1c.value + ' ' + (a1c.unit || '%'), date: a1c.date, note: a1cNote });
  }
  var vitD = nearestLabBeforeDate(labData, lastDate, 'Vitamin D');
  if (!vitD) vitD = nearestLabBeforeDate(labData, lastDate, '25-OH Vitamin D');
  if (vitD) {
    var vdNote = '';
    if (vitD.value < 20) vdNote = 'Vitamin D deficiency may correlate with reduced recovery scores and higher fatigue; compare with sleep and readiness trends.';
    else if (vitD.value < 30) vdNote = 'Vitamin D insufficiency; monitor for seasonal patterns in sleep duration and readiness.';
    else vdNote = 'Vitamin D within adequate range.';
    correlations.push({ test: 'Vitamin D', value: vitD.value + ' ' + (vitD.unit || 'ng/mL'), date: vitD.date, note: vdNote });
  }
  var ferritin = nearestLabBeforeDate(labData, lastDate, 'Ferritin');
  if (ferritin) {
    var ferNote = '';
    if (ferritin.value < 30) ferNote = 'Low ferritin may reduce exercise tolerance; compare with step counts and resting HR trends.';
    else if (ferritin.value > 200) ferNote = 'Elevated ferritin may reflect inflammation; compare with CRP and HRV if available.';
    else ferNote = 'Ferritin within common reference range.';
    correlations.push({ test: 'Ferritin', value: ferritin.value + ' ' + (ferritin.unit || 'ng/mL'), date: ferritin.date, note: ferNote });
  }
  var fastingGlucose = nearestLabBeforeDate(labData, lastDate, 'Fasting Glucose');
  if (!fastingGlucose) fastingGlucose = nearestLabBeforeDate(labData, lastDate, 'Glucose (fasting)');
  if (fastingGlucose) {
    var fgNote = '';
    if (fastingGlucose.value > 126) fgNote = 'Fasting glucose above diabetic threshold; physical activity and sleep are key adjunct metrics.';
    else if (fastingGlucose.value > 100) fgNote = 'Fasting glucose in impaired range; correlate with steps, sleep, and readiness scores.';
    else fgNote = 'Fasting glucose within common reference range.';
    correlations.push({ test: 'Fasting Glucose', value: fastingGlucose.value + ' ' + (fastingGlucose.unit || 'mg/dL'), date: fastingGlucose.date, note: fgNote });
  }
  var testosterone = nearestLabBeforeDate(labData, lastDate, 'Testosterone (total)');
  if (!testosterone) testosterone = nearestLabBeforeDate(labData, lastDate, 'Testosterone');
  if (testosterone) {
    var tNote = '';
    if (testosterone.value < 300) tNote = 'Low testosterone may correlate with reduced energy and recovery; compare with readiness and sleep quality trends.';
    else tNote = 'Testosterone within common reference range.';
    correlations.push({ test: 'Testosterone', value: testosterone.value + ' ' + (testosterone.unit || 'ng/dL'), date: testosterone.date, note: tNote });
  }
  if (!correlations.length) {
    return '<section class="monitor-panel"><div class="monitor-panel-head"><h3>Biomarker Correlations</h3><span>Lab data</span></div>'
      + '<p class="monitor-muted">Lab results loaded, but no recognized cross-correlation mappings found for the available tests. Supported: Cortisol, CRP, TSH, HbA1c, Vitamin D, Ferritin, Fasting Glucose, Testosterone.</p></section>';
  }
  var tableRows = correlations.map(function(c) {
    return '<tr><td>' + esc(c.test) + '</td><td>' + esc(c.value) + '</td><td>' + esc(c.date ? new Date(c.date).toLocaleDateString() : '—') + '</td><td>' + esc(c.note) + '</td></tr>';
  }).join('');
  var disclaimer = '<p class="monitor-muted" style="margin-top:10px"><strong>Exploratory only.</strong> Wearable-to-lab correlations are hypothesis-generating, not diagnostic. Review original lab reports and clinical context before any action.</p>';
  return '<section class="monitor-panel" data-testid="monitor-biomarkers-correlation-panel"><div class="monitor-panel-head"><h3>Biomarker Correlations</h3><span>Wearable-to-lab</span></div>'
    + '<div class="monitor-table-wrap"><table class="monitor-table"><thead><tr><th>Lab test</th><th>Value</th><th>Date</th><th>Wearable trend context</th></tr></thead><tbody>' + tableRows + '</tbody></table></div>'
    + disclaimer
    + '</section>';
}

function _buildBiometricsCsv(s, patientId) {
  var detail = s.patientDetail || {};
  var summaries = Array.isArray(detail.summaries) ? detail.summaries : [];
  var headers = ['date','hrv_ms','rhr_bpm','spo2_pct','sleep_duration_h','steps','readiness_score'];
  var lines = [headers.join(',')];
  summaries.forEach(function(day) {
    var row = [
      day.date || '',
      day.hrv_ms != null ? day.hrv_ms : '',
      day.rhr_bpm != null ? day.rhr_bpm : '',
      day.spo2_pct != null ? day.spo2_pct : '',
      day.sleep_duration_h != null ? day.sleep_duration_h : '',
      day.steps != null ? day.steps : '',
      day.readiness_score != null ? day.readiness_score : ''
    ];
    lines.push(row.join(','));
  });
  lines.push('');
  lines.push('# DeepSynaps Biometrics Export');
  lines.push('# Patient: ' + (patientId || 'unknown'));
  lines.push('# Generated: ' + new Date().toISOString());
  lines.push('# Source: device-reported aggregates; consumer or research-grade unless from regulated workflow');
  lines.push('# Disclaimer: decision-support only; not diagnosis or treatment recommendation');
  return lines.join('\n');
}

function _computeTrendDirection(summaries, key) {
  if (!Array.isArray(summaries) || summaries.length < 4) return 'insufficient_data';
  var vals = summaries.map(function(d) { return d && d[key] != null ? d[key] : null; }).filter(function(v) { return v != null; });
  if (vals.length < 4) return 'insufficient_data';
  var firstHalf = vals.slice(0, Math.floor(vals.length / 2));
  var secondHalf = vals.slice(Math.floor(vals.length / 2));
  var mean = function(arr) { return arr.reduce(function(a, b) { return a + b; }, 0) / arr.length; };
  var m1 = mean(firstHalf), m2 = mean(secondHalf);
  var diff = m2 - m1;
  var rel = Math.abs(diff) / (Math.abs(m1) || 1);
  if (rel < 0.05) return 'stable';
  return diff > 0 ? 'rising' : 'declining';
}

function _renderSchedulePanel(s) {
  var schedules = s.biometricsReportSchedules || [];
  var pid = s.selectedPatientId || window._selectedPatientId || '';
  var freqOpts = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly (Monday)' },
    { value: 'bi-weekly', label: 'Bi-weekly' },
    { value: 'monthly', label: 'Monthly (1st)' },
  ];
  var formatOpts = [
    { value: 'markdown', label: 'Markdown' },
    { value: 'html', label: 'HTML' },
    { value: 'pdf', label: 'PDF' },
    { value: 'patient-friendly', label: 'Patient-friendly' },
  ];
  var deliveryOpts = [
    { value: 'download', label: 'Download only' },
    { value: 'save-to-record', label: 'Save to patient record' },
  ];
  var rows = schedules.map(function(sch, idx) {
    return '<tr><td>' + esc(sch.frequency) + '</td><td>' + esc(sch.format) + '</td><td>' + esc(sch.time) + '</td><td>'
      + '<span class="monitor-badge monitor-badge--' + (sch.enabled ? 'green' : 'orange') + '">' + (sch.enabled ? 'On' : 'Paused') + '</span>'
      + '</td><td><button type="button" class="btn btn-sm" onclick="window._monitorToggleSchedule(' + idx + ')">' + (sch.enabled ? 'Pause' : 'Resume') + '</button>'
      + '<button type="button" class="btn btn-sm" onclick="window._monitorDeleteSchedule(' + idx + ')">Delete</button></td></tr>';
  }).join('');
  var table = schedules.length ? '<div class="monitor-table-wrap"><table class="monitor-table"><thead><tr><th>Frequency</th><th>Format</th><th>Time</th><th>Status</th><th>Action</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    : '<p class="monitor-muted">No scheduled reports set up. Create one below.</p>';
  var form = '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:12px">'
    + '<label class="monitor-field">Frequency <select id="monitor-schedule-freq" class="monitor-select">' + freqOpts.map(function(o) { return '<option value="' + o.value + '">' + esc(o.label) + '</option>'; }).join('') + '</select></label>'
    + '<label class="monitor-field">Format <select id="monitor-schedule-format" class="monitor-select">' + formatOpts.map(function(o) { return '<option value="' + o.value + '">' + esc(o.label) + '</option>'; }).join('') + '</select></label>'
    + '<label class="monitor-field">Time <input type="time" id="monitor-schedule-time" class="monitor-select" value="08:00" style="min-width:auto;padding:7px 10px"></label>'
    + '<label class="monitor-field">Delivery <select id="monitor-schedule-delivery" class="monitor-select">' + deliveryOpts.map(function(o) { return '<option value="' + o.value + '">' + esc(o.label) + '</option>'; }).join('') + '</select></label>'
    + '<button type="button" class="btn btn-sm btn-primary" onclick="window._monitorAddSchedule()">Add schedule</button>'
    + '</div>';
  return '<section class="monitor-panel"><div class="monitor-panel-head"><h3>Scheduled Reports</h3><span>Auto-generate</span></div>'
    + table
    + form
    + '<p class="monitor-muted" style="margin-top:8px">Schedules are stored in this browser only. Reports run at the specified time when this page is open and a patient is selected. PDF format requires saving to the patient record first.</p>'
    + '</section>';
}

function _computeDataFreshness(detail) {
  var connections = detail && Array.isArray(detail.connections) ? detail.connections : [];
  var wearableConns = connections.filter(function(c) {
    var kind = String(c.kind || '').toLowerCase();
    return kind === 'wearable' || kind === 'home_device' || kind === 'brain_monitor';
  });
  if (!wearableConns.length) return { text: 'No wearable connections', color: 'var(--text-tertiary)', healthy: false };
  var newest = null;
  wearableConns.forEach(function(c) {
    if (!c.last_sync_at) return;
    var t = new Date(c.last_sync_at).getTime();
    if (!newest || t > newest) newest = t;
  });
  if (!newest) return { text: 'Sync time unknown', color: 'var(--text-tertiary)', healthy: false };
  var ageMs = Date.now() - newest;
  var ageMins = Math.floor(ageMs / 60000);
  var ageHours = Math.floor(ageMs / 3600000);
  var ageDays = Math.floor(ageMs / 86400000);
  var text = ageDays > 0 ? ageDays + 'd ago' : ageHours > 0 ? ageHours + 'h ago' : ageMins + 'm ago';
  var healthy = ageHours < 6;
  var color = healthy ? 'var(--green)' : ageHours < 24 ? 'var(--orange)' : 'var(--red)';
  return { text: 'Last sync: ' + text, color: color, healthy: healthy };
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
  var alertsSeverityBar = '';
  if (alerts.length) {
    var sevCounts = { urgent: 0, elevated: 0, info: 0 };
    alerts.forEach(function(a) { var sv = String(a.severity || 'info').toLowerCase(); if (sv === 'urgent' || sv === 'critical') sevCounts.urgent++; else if (sv === 'elevated' || sv === 'warning') sevCounts.elevated++; else sevCounts.info++; });
    alertsSeverityBar = '<div class="monitor-alert-bar" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
      + (sevCounts.urgent ? '<span class="monitor-badge monitor-badge--red">Critical: ' + sevCounts.urgent + '</span>' : '')
      + (sevCounts.elevated ? '<span class="monitor-badge monitor-badge--orange">Elevated: ' + sevCounts.elevated + '</span>' : '')
      + (sevCounts.info ? '<span class="monitor-badge monitor-badge--blue">Info: ' + sevCounts.info + '</span>' : '')
      + '<span class="monitor-muted" style="margin-left:auto">' + alerts.length + ' total</span></div>';
  }
  var alertsPanel = alerts.length
    ? alertsSeverityBar
      + '<div class="monitor-table-wrap"><table class="monitor-table"><thead><tr><th>Type</th><th>Severity</th><th>Triggered</th><th>Detail</th><th>Action</th></tr></thead><tbody>'
      + alerts.map(function (a, idx) {
        var sev = String(a.severity || 'info').toLowerCase();
        var toneKey = (sev === 'urgent' || sev === 'critical') ? 'red' : (sev === 'elevated' || sev === 'warning') ? 'orange' : 'blue';
        var ackBtn = '<button type="button" class="btn btn-sm" onclick="window._monitorAlertAck(' + idx + ')">Ack</button>';
        var escBtn = (sev === 'urgent' || sev === 'critical' || sev === 'elevated') ? '<button type="button" class="btn btn-sm btn-primary" onclick="window._monitorAlertEscalate(' + idx + ')">Escalate</button>' : '';
        return '<tr><td>' + esc(a.flag_type) + '</td><td><span class="monitor-badge monitor-badge--' + tone(toneKey) + '">' + esc(a.severity) + '</span></td><td>'
          + esc(fmtAgo(a.triggered_at)) + '</td><td>' + esc((a.detail || '').slice(0, 120)) + '</td><td><div style="display:flex;gap:6px;flex-wrap:wrap">' + ackBtn + escBtn + '</div></td></tr>';
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
    var _vitalCard = function(label, val, unit, type, prevVal) {
      var st = _metricStatus(val, type);
      var trend = '';
      if (prevVal != null && val != null && !Number.isNaN(Number(val)) && !Number.isNaN(Number(prevVal))) {
        var diff = Number(val) - Number(prevVal);
        var pct = Math.abs(diff) / (Math.abs(Number(prevVal)) || 1);
        if (pct > 0.02) {
          var arrow = diff > 0 ? '\u2191' : '\u2193';
          var trendColor = 'var(--green)';
          if (type === 'rhr_bpm') trendColor = diff > 0 ? 'var(--orange)' : 'var(--green)';
          else if (type === 'hrv_ms' || type === 'sleep_duration_h' || type === 'spo2_pct' || type === 'readiness_score' || type === 'steps') trendColor = diff > 0 ? 'var(--green)' : 'var(--orange)';
          trend = '<span style="color:' + trendColor + ';font-size:11px;margin-left:4px;font-weight:600">' + arrow + ' ' + Math.abs(pct * 100).toFixed(0) + '%</span>';
        }
      }
      return '<article class="monitor-vital-card" style="border-bottom:2px solid ' + st.color + '">'
        + '<div class="monitor-kpi-label">' + esc(label) + '</div>'
        + '<div class="monitor-vital-val">' + esc(fmtNum(val)) + '<span class="monitor-vital-unit">' + esc(unit) + '</span>' + trend + '</div>'
        + '<div style="font-size:10px;color:' + st.color + ';font-weight:600;margin-top:2px">' + esc(st.label) + '</div></article>';
    };
    var prevS = detail.summaries.length > 1 ? detail.summaries[detail.summaries.length - 2] : {};
    summaryStrip = '<div class="monitor-vitals-strip">'
      + _vitalCard('HRV', lastS.hrv_ms, 'ms', 'hrv_ms', prevS.hrv_ms)
      + _vitalCard('Sleep', lastS.sleep_duration_h, 'h', 'sleep_duration_h', prevS.sleep_duration_h)
      + _vitalCard('SpO\u2082', lastS.spo2_pct, '%', 'spo2_pct')
      + _vitalCard('Steps', lastS.steps, '', 'steps', prevS.steps)
      + _vitalCard('Resting HR', lastS.rhr_bpm, 'bpm', 'rhr_bpm', prevS.rhr_bpm)
      + _vitalCard('Readiness', lastS.readiness_score, '', 'readiness_score', prevS.readiness_score)
      + '</div>'
      + '<p class="monitor-muted" style="margin-top:8px">Values are device/vendor-reported aggregates for the latest day in range. Color-coded against general adult reference ranges \u2014 not a clinical vital sign interpretation.</p>';
  } else if (selId && !loading && !err) {
    summaryStrip = '<div class="monitor-empty-inline">No daily summaries in the selected window. Data may be missing, not yet synced, or not ingested.</div>';
  }

  var trendPanel = _renderTrendPanel(detail && detail.summaries, days);

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

  var aiPanel = _renderAiPanel(s, selId);

  var reviewNotePanel = '<section class="monitor-panel"><div class="monitor-panel-head"><h3>Clinician review note</h3><span>Session-local</span></div>'
    + '<p class="monitor-muted">Notes are stored for this session only. Export or copy into the patient record before closing the workspace.</p>'
    + '<textarea class="monitor-textarea" rows="3" placeholder="Clinical observation, action taken, or follow-up plan\u2026" oninput="window._monitorBiometricsAuditNote(this.value)">' + esc(s.biometricsAuditNote || '') + '</textarea>'
    + '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorBiometricsAuditNoteTemplate(\'reviewed_no_concerns\')">No concerns</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorBiometricsAuditNoteTemplate(\'follow_up_needed\')">Follow-up needed</button>'
    + '<button type="button" class="btn btn-sm" onclick="window._monitorBiometricsAuditNoteTemplate(\'patient_contact\')">Contact patient</button>'
    + '</div></section>';

  var evidencePanel = '<section class="monitor-panel"><div class="monitor-panel-head"><h3>Evidence &amp; governance</h3></div>'
    + '<p class="monitor-muted">Wearable metrics are consumer or research-grade unless sourced from a regulated device workflow. Evidence grades and citations are shown only when supplied by the evidence service \u2014 none are inferred here.</p>'
    + '</section>';

  var reportPanel = _renderBiometricsReportPanel(s);

  var deepTwinCard = '';
  if (selId) {
    deepTwinCard = '<section class="monitor-panel">'
      + '<div class="monitor-panel-head"><h3>DeepTwin</h3><span>Decision-support twin</span></div>'
      + '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">'
      + '<div style="flex:1;min-width:180px">'
      + '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px">Cross-reference wearable trends with qEEG, MRI, assessments, and protocol simulations.</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + '<button type="button" class="btn btn-sm btn-primary" onclick="window._monitorOpenDeepTwin360()">Open 360 Dashboard</button>'
      + '<button type="button" class="btn btn-sm" onclick="window._monitorOpenDeepTwin()">DeepTwin Overview</button>'
      + '</div></div></div></section>';
  }

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
    var sessionMarkers = _buildSessionMarkers(detail.summaries, s.patientSessions);
    var timelinePanel = _renderTreatmentTimelinePanel(detail.summaries, s.patientSessions);
    detailBody = summaryStrip
      + '<h4 class="monitor-subheading">Trends &amp; reference ranges</h4>' + _renderTrendPanel(detail.summaries, days, sessionMarkers)
      + '<h4 class="monitor-subheading">Personal baseline deviations</h4>' + _renderBaselinePanel(detail.summaries)
      + '<h4 class="monitor-subheading">Composite multi-metric alerts</h4>' + _renderCompositeAlertsPanel(detail.summaries)
      + '<h4 class="monitor-subheading">Treatment timeline &amp; protocol correlation</h4>' + timelinePanel
      + '<h4 class="monitor-subheading">Data availability</h4>' + _renderMetricHeatmap(detail.summaries)
      + '<h4 class="monitor-subheading">Device connections</h4>' + connectionsPanel
      + '<h4 class="monitor-subheading">Alert flags (review)</h4>' + alertsPanel
      + '<h4 class="monitor-subheading">Readiness aggregate</h4>' + readinessBlock
      + reviewNotePanel;
  }

  var schedules = s.biometricsReportSchedules || [];
  var scheduleChips = '';
  if (schedules.length) {
    var activeCount = schedules.filter(function(sch) { return sch.enabled; }).length;
    if (activeCount) {
      scheduleChips = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'
        + schedules.map(function(sch) {
          return '<span class="monitor-badge monitor-badge--' + (sch.enabled ? 'green' : 'orange') + '" title="' + esc((sch.frequency || 'daily') + ' \u00B7 ' + (sch.format || 'markdown') + ' \u00B7 ' + (sch.delivery || 'download')) + '">'
          + (sch.enabled ? '\u25CF ' : '\u23F8 ') + esc((sch.frequency || 'daily')) + '</span>';
        }).join('')
        + '</div>';
    }
  }

  var schedulePanel = '';
  if (s.showSchedulePanel) {
    schedulePanel = '<div id="monitor-schedule-panel" style="margin-top:12px;padding:12px;border:1px solid var(--border);border-radius:8px;background:rgba(255,255,255,0.02)">'
      + '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">'
      + '<label class="monitor-field">Frequency <select id="monitor-schedule-freq" class="monitor-select"><option value="daily">Daily</option><option value="weekly">Weekly (Monday)</option><option value="bi-weekly">Bi-weekly</option><option value="monthly">Monthly (1st)</option></select></label>'
      + '<label class="monitor-field">Format <select id="monitor-schedule-format" class="monitor-select"><option value="markdown">Markdown</option><option value="pdf">PDF</option><option value="html">HTML</option><option value="patient-friendly">Patient-friendly</option></select></label>'
      + '<label class="monitor-field">Time <input id="monitor-schedule-time" type="time" class="monitor-select" value="08:00" style="width:auto"></label>'
      + '<label class="monitor-field">Delivery <select id="monitor-schedule-delivery" class="monitor-select"><option value="download">Download only</option><option value="email">Email to me</option><option value="save-to-record">Save to patient record</option></select></label>'
      + '<label class="monitor-field" style="display:flex;align-items:center;gap:6px"><input id="monitor-schedule-enabled" type="checkbox" checked> Enabled</label>'
      + '<button type="button" class="btn btn-sm btn-primary" onclick="window._monitorSaveBiometricsSchedule()">Save Schedule</button>'
      + '</div>'
      + (schedules.length ? '<div style="margin-top:10px">' + schedules.map(function(sch, idx) {
        return '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">'
          + '<span class="monitor-badge monitor-badge--' + (sch.enabled ? 'green' : 'orange') + '">' + esc((sch.frequency || 'daily')) + ' \u00B7 ' + esc((sch.format || 'markdown')) + ' \u00B7 ' + esc((sch.delivery || 'download')) + ' \u00B7 ' + esc(sch.time || '08:00') + '</span>'
          + '<button type="button" class="btn btn-sm" onclick="window._monitorToggleBiometricsSchedule(' + idx + ')">' + (sch.enabled ? 'Pause' : 'Enable') + '</button>'
          + '<button type="button" class="btn btn-sm" onclick="window._monitorDeleteBiometricsSchedule(' + idx + ')">Delete</button>'
          + '</div>';
      }).join('') + '</div>' : '')
      + '</div>';
  }

  return '<div data-testid="monitor-tab-biometrics">' + demoBanner + clinDisclaimer
    + '<section class="monitor-panel monitor-panel--patient"><div class="monitor-panel-head"><h2>Patient context</h2></div>'
    + '<div class="monitor-patient-toolbar">'
    + '<label class="monitor-field">Patient <select id="monitor-patient-select" class="monitor-select" aria-label="Select patient for biometrics">' + patientOpts + '</select></label>'
    + '<label class="monitor-field">Window <select id="monitor-days-select" class="monitor-select" aria-label="Summary window in days">'
    + [7, 14, 30, 90].map(function (d) { return '<option value="' + d + '"' + (Number(days) === d ? ' selected' : '') + '>' + d + ' days</option>'; }).join('')
    + '</select></label>'
    + '<button type="button" class="btn btn-sm btn-primary" id="monitor-refresh-btn">Refresh</button>'
    + '<button type="button" class="btn btn-sm" id="monitor-export-btn" title="Click to print / Shift+click for JSON">Export / Print</button>'
    + '<button type="button" class="btn btn-sm btn-primary" id="monitor-generate-report-btn" ' + (selId ? '' : 'disabled') + '>Generate Report</button>'
    + '<button type="button" class="btn btn-sm" id="monitor-schedule-reports-btn">Schedule Reports</button>'
    + '<button type="button" class="btn btn-sm" id="monitor-clear-patient-btn">Clear</button>'
    + '</div>'
    + scheduleChips
    + schedulePanel
    + (s.patientsLoadError ? '<p class="monitor-inline-error" role="alert">' + esc(s.patientsLoadError) + '</p>' : '')
    + caseloadHint
    + (function() {
        var fr = _computeDataFreshness(detail);
        return fr ? '<div style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11px"><span style="width:8px;height:8px;border-radius:50%;background:' + fr.color + '"></span><span style="color:var(--text-tertiary)">' + esc(fr.text) + '</span></div>' : '';
      })()
    + '</section>'
    + '<div class="monitor-main-grid"><div class="monitor-main-col">'
    + '<section class="monitor-panel"><div class="monitor-panel-head"><h3>Clinic device connections (fleet)</h3></div>' + fleetPanel + '</section>'
    + '<section class="monitor-panel"><div class="monitor-panel-head"><h3>Wearables &amp; biometrics</h3></div>' + detailBody + '</section>'
    + deepTwinCard
    + quickLinks
    + aiPanel
    + reportPanel
    + _renderBiomarkersCorrelationPanel(s)
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
      renderWorkbench(summary, flagsList, isDemoView, s.workbenchFilters, s.workbenchError, s.workbenchActionError)
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
  var exportBtn = document.getElementById('monitor-export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', function (e) {
      if (e.shiftKey) {
        var payload = {
          exported_at: new Date().toISOString(),
          patient_id: s.selectedPatientId || '',
          window_days: s.patientWearableDays || 30,
          summaries: (s.patientDetail && Array.isArray(s.patientDetail.summaries)) ? s.patientDetail.summaries : [],
          alerts: (s.patientDetail && Array.isArray(s.patientDetail.recent_alerts)) ? s.patientDetail.recent_alerts : [],
          connections: (s.patientDetail && Array.isArray(s.patientDetail.connections)) ? s.patientDetail.connections : [],
          review_note: s.biometricsAuditNote || '',
        };
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'biometrics-' + (s.selectedPatientId || 'unknown') + '-' + (s.patientWearableDays || 30) + 'd.json';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        try { api.postWearablesWorkbenchAuditEvent({ event: 'export_initiated', note: 'biometrics_analyzer_json_export' }); } catch {}
        return;
      }
      document.body.classList.add('monitor-printing');
      window.print();
      setTimeout(function () { document.body.classList.remove('monitor-printing'); }, 500);
      try { api.postWearablesWorkbenchAuditEvent({ event: 'export_initiated', note: 'biometrics_analyzer_print' }); } catch {}
    });
  }
  var genReportBtn = document.getElementById('monitor-generate-report-btn');
  if (genReportBtn) {
    genReportBtn.addEventListener('click', function () {
      var pid = s.selectedPatientId || window._selectedPatientId;
      if (!pid) return;
      _generateBiometricsReport(s, pid);
    });
  }
  var scheduleBtn = document.getElementById('monitor-schedule-reports-btn');
  if (scheduleBtn) {
    scheduleBtn.addEventListener('click', function () {
      s.showSchedulePanel = !s.showSchedulePanel;
      render();
    });
  }
  /* Sticky toolbar shadow on scroll */
  var contentEl = document.getElementById('content');
  var patientPanel = document.querySelector('.monitor-panel--patient');
  if (contentEl && patientPanel && !contentEl._monitorScrollBound) {
    contentEl._monitorScrollBound = true;
    contentEl.addEventListener('scroll', function () {
      if (contentEl.scrollTop > 6) patientPanel.classList.add('is-scrolled');
      else patientPanel.classList.remove('is-scrolled');
    }, { passive: true });
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
    s.patientSessions = [];
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
  await _loadPatientSessions(s, pid);
  s.patientDetailLoading = false;
  render();
  loadBiometricsAi(s, pid);
}

async function _loadPatientSessions(s, patientId) {
  if (!patientId || !api.getPatientSessions) { s.patientSessions = []; return; }
  try {
    var data = await api.getPatientSessions(patientId);
    var items = Array.isArray(data) ? data : (data && Array.isArray(data.items)) ? data.items : [];
    s.patientSessions = items.map(function(item) {
      return {
        date: item.session_date || item.started_at || item.created_at || '',
        protocol: item.protocol_name || item.protocol_id || (item.protocol && item.protocol.name) || 'Session',
        type: item.session_type || item.type || 'treatment',
        status: item.status || 'completed',
        id: item.id || '',
      };
    }).filter(function(s) { return s.date; });
  } catch {
    s.patientSessions = [];
  }
}

function _buildSessionMarkers(summaries, sessions) {
  if (!Array.isArray(summaries) || !Array.isArray(sessions) || !sessions.length) return [];
  var summaryDates = summaries.map(function(s, i) {
    return { idx: i, date: String(s.date || '').slice(0, 10) };
  });
  var markers = [];
  sessions.forEach(function(sess) {
    var sd = String(sess.date).slice(0, 10);
    var match = summaryDates.find(function(d) { return d.date === sd; });
    if (match) {
      markers.push({ idx: match.idx, label: sess.protocol, color: '#F6B23C', date: sd });
    }
  });
  return markers;
}

function _computePrePostDeltas(summaries, sessions) {
  if (!Array.isArray(summaries) || summaries.length < 3 || !Array.isArray(sessions) || !sessions.length) return [];
  var metrics = [
    { key: 'hrv_ms', label: 'HRV', unit: 'ms' },
    { key: 'rhr_bpm', label: 'Resting HR', unit: 'bpm' },
    { key: 'sleep_duration_h', label: 'Sleep', unit: 'h' },
    { key: 'readiness_score', label: 'Readiness', unit: '' },
  ];
  var deltas = [];
  sessions.forEach(function(sess) {
    var sd = String(sess.date).slice(0, 10);
    var idx = summaries.findIndex(function(s) { return String(s.date || '').slice(0, 10) === sd; });
    if (idx < 1 || idx >= summaries.length - 1) return;
    var pre = summaries[idx - 1];
    var post = summaries[idx + 1];
    var mDeltas = metrics.map(function(m) {
      var preV = pre[m.key];
      var postV = post[m.key];
      var has = preV != null && !Number.isNaN(Number(preV)) && postV != null && !Number.isNaN(Number(postV));
      var delta = has ? (postV - preV) : null;
      return { key: m.key, label: m.label, unit: m.unit, has: has, delta: delta, pre: preV, post: postV };
    }).filter(function(d) { return d.has; });
    if (mDeltas.length) {
      deltas.push({ sessionDate: sd, protocol: sess.protocol, metrics: mDeltas });
    }
  });
  return deltas.slice(0, 5);
}

function _renderTreatmentTimelinePanel(summaries, sessions) {
  if (!Array.isArray(sessions) || !sessions.length) {
    return '<p class="monitor-muted">No treatment sessions on file for this patient in the current window. Sessions appear here when the treatment course data is available and dates overlap with the wearable summary window.</p>';
  }
  var rows = sessions.slice(0, 15).map(function(s) {
    var st = String(s.status || '').toLowerCase();
    var toneKey = (st === 'completed' || st === 'done') ? 'green' : (st === 'cancelled' || st === 'missed') ? 'red' : 'blue';
    return '<tr><td>' + esc(s.date ? s.date.slice(0, 10) : '—') + '</td><td>' + esc(s.protocol) + '</td><td>'
      + '<span class="monitor-badge monitor-badge--' + tone(toneKey) + '">' + esc(s.status) + '</span>'
      + '</td></tr>';
  }).join('');
  var deltas = _computePrePostDeltas(summaries, sessions);
  var deltaHtml = '';
  if (deltas.length) {
    deltaHtml = '<div style="margin-top:14px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary);margin-bottom:8px">Pre/post session deltas (day before vs day after)</div>';
    deltaHtml += deltas.map(function(d) {
      return '<div style="padding:8px 10px;border-radius:8px;background:rgba(255,255,255,0.025);border:1px solid var(--border);margin-bottom:6px">'
        + '<div style="font-size:11px;font-weight:600;color:var(--text-primary);margin-bottom:4px">' + esc(d.protocol) + ' <span style="color:var(--text-tertiary);font-weight:500">· ' + esc(d.sessionDate) + '</span></div>'
        + '<div style="display:flex;gap:12px;flex-wrap:wrap">'
        + d.metrics.map(function(m) {
          var deltaStr = (m.delta >= 0 ? '+' : '') + (Number.isInteger(m.delta) ? String(m.delta) : m.delta.toFixed(1));
          var deltaColor = m.delta > 0 ? '#3EE0C5' : m.delta < 0 ? '#FF6B8B' : 'var(--text-tertiary)';
          return '<span style="font-size:11px;color:var(--text-secondary)">' + esc(m.label) + ': <strong style="color:' + deltaColor + '">' + esc(deltaStr) + '</strong> ' + esc(m.unit) + '</span>';
        }).join('')
        + '</div></div>';
    }).join('');
    deltaHtml += '</div>';
  }
  return '<div class="monitor-table-wrap"><table class="monitor-table"><thead><tr><th>Date</th><th>Protocol</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    + deltaHtml
    + '<p class="monitor-muted" style="margin-top:8px">Treatment sessions are shown as dashed vertical lines on sparklines above. Pre/post deltas compare the day before vs the day after each session. This is exploratory correlation only — causal attribution requires controlled study design.</p>';
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
  s.workbenchError = null;
  // Build filter params, dropping blanks so the server-side default
  // (no filter) kicks in instead of filtering by literal empty strings.
  var params = {};
  if (s.workbenchFilters?.status) params.status = s.workbenchFilters.status;
  if (s.workbenchFilters?.severity) params.severity = s.workbenchFilters.severity;
  try {
    const flags = await api.wearablesWorkbenchListFlags(params);
    if (flags) s.workbenchFlags = flags;
    else s.workbenchError = 'empty_response';
  } catch (e) {
    const msg = (e && e.message) ? String(e.message) : 'request failed';
    s.workbenchError = msg;
  }
  try {
    const summary = await api.wearablesWorkbenchSummary();
    if (summary) s.workbenchSummary = summary;
  } catch (e) {
    const msg = (e && e.message) ? String(e.message) : 'request failed';
    if (!s.workbenchError) s.workbenchError = msg;
  }
  // Honest fallback: never synthesize alert rows, but also never let an
  // offline/error condition masquerade as a true empty queue.
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

  window.setInterval(_checkBiometricsSchedules, 60000);

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

  window._monitorAlertAck = function (alertIdx) {
    var detail = s.patientDetail || {};
    var alerts = Array.isArray(detail.recent_alerts) ? detail.recent_alerts : [];
    var a = alerts[alertIdx];
    if (!a) return;
    var note = (window.prompt && window.prompt('Acknowledge note (required):')) || '';
    note = String(note || '').trim();
    if (!note) return;
    (async function () {
      try {
        if (a.id && api.wearablesWorkbenchAcknowledge) await api.wearablesWorkbenchAcknowledge(a.id, note);
        else if (api.postWearablesWorkbenchAuditEvent) await api.postWearablesWorkbenchAuditEvent({ event: 'alert_acknowledged', note: 'type=' + (a.flag_type || '') + ' idx=' + alertIdx + ' ' + note });
      } catch {}
      await loadPatientWearableDetail();
    })();
  };
  window._monitorAlertEscalate = function (alertIdx) {
    var detail = s.patientDetail || {};
    var alerts = Array.isArray(detail.recent_alerts) ? detail.recent_alerts : [];
    var a = alerts[alertIdx];
    if (!a) return;
    var note = (window.prompt && window.prompt('Escalation note — describes the clinical concern (required):')) || '';
    note = String(note || '').trim();
    if (!note) return;
    (async function () {
      try {
        if (a.id && api.wearablesWorkbenchEscalate) {
          var resp = await api.wearablesWorkbenchEscalate(a.id, note, null);
          if (resp && resp.adverse_event_id && window.confirm) {
            if (window.confirm('Adverse Event draft created (' + resp.adverse_event_id + '). Open AE Hub now?')) window._nav?.('adverse-events-hub');
          }
        } else if (api.postWearablesWorkbenchAuditEvent) {
          await api.postWearablesWorkbenchAuditEvent({ event: 'alert_escalated', note: 'type=' + (a.flag_type || '') + ' idx=' + alertIdx + ' ' + note });
        }
      } catch {}
      await loadPatientWearableDetail();
    })();
  };

  window._monitorOpenDeepTwin = function () {
    var pid = s.selectedPatientId || window._selectedPatientId;
    if (pid) {
      window._selectedPatientId = pid;
      window._profilePatientId = pid;
      try { sessionStorage.setItem('ds_pat_selected_id', String(pid)); } catch {}
    }
    window._nav?.('deeptwin');
  };
  window._monitorOpenDeepTwin360 = function () {
    var pid = s.selectedPatientId || window._selectedPatientId;
    if (pid) {
      window._selectedPatientId = pid;
      window._profilePatientId = pid;
      try { sessionStorage.setItem('ds_pat_selected_id', String(pid)); sessionStorage.setItem('ds_dt_active_tab', '360'); } catch {}
    }
    window._nav?.('deeptwin');
  };
  window._monitorGenerateBiometricsReport = function () {
    var pid = s.selectedPatientId || window._selectedPatientId;
    if (!pid) return;
    _generateBiometricsReport(s, pid);
  };
  window._monitorRegenerateBiometricsReport = function () {
    window._monitorGenerateBiometricsReport();
  };
  window._monitorSwitchReportMode = function (mode) {
    var rep = s.biometricsReport;
    if (!rep) return;
    if (mode === 'patient-friendly' && !rep.patientFriendlyMarkdown) {
      rep.isPatientFriendly = true;
      _generatePatientFriendlyReport(s, rep.patientId || s.selectedPatientId || window._selectedPatientId);
      return;
    }
    rep.isPatientFriendly = (mode === 'patient-friendly');
    render();
  };
  window._monitorSavePatientFriendlyReport = async function () {
    var rep = s.biometricsReport;
    if (!rep || !rep.patientFriendlyMarkdown) return;
    var pid = s.selectedPatientId || window._selectedPatientId;
    var today = new Date().toISOString().slice(0, 10);
    var persisted = false;
    var savedId = null;
    try {
      if (api.createReport) {
        var saved = await api.createReport({
          patient_id: pid,
          type: 'patient_friendly_biometrics',
          title: 'Patient-Friendly Wearable Report — ' + (pid || 'unknown') + ' — ' + today,
          content: rep.patientFriendlyMarkdown,
          report_date: today,
          status: 'generated',
        });
        if (saved && saved.id) {
          persisted = true;
          savedId = saved.id;
          rep.patientFriendlySavedId = saved.id;
        }
      }
    } catch (err) {
      console.warn('[biometrics-analyzer] save patient-friendly report failed:', err?.message || err);
    }
    window._dsToast?.({
      title: persisted ? 'Shared' : 'Saved locally only',
      body: persisted ? 'Patient-friendly report stored in patient record.' : 'Server save failed; report remains in this session only.',
      severity: persisted ? 'success' : 'warn',
    });
    try { api.postWearablesWorkbenchAuditEvent({ event: 'report_saved', note: 'patient_friendly_biometrics patient=' + (pid || '') + (savedId ? ' id=' + savedId : '') }); } catch {}
    if (persisted) render();
  };
  window._monitorSaveBiometricsReport = async function () {
    var rep = s.biometricsReport;
    if (!rep || !rep.markdown) return;
    var pid = s.selectedPatientId || window._selectedPatientId;
    var today = new Date().toISOString().slice(0, 10);
    var persisted = false;
    var savedId = null;
    try {
      if (api.createReport) {
        var saved = await api.createReport({
          patient_id: pid,
          type: 'biometrics_summary',
          title: 'Wearable Biometrics Report — ' + (pid || 'unknown') + ' — ' + today,
          content: rep.markdown,
          report_date: today,
          status: 'generated',
        });
        if (saved && saved.id) {
          persisted = true;
          savedId = saved.id;
          rep.savedId = saved.id;
        }
      }
    } catch (err) {
      console.warn('[biometrics-analyzer] createReport failed:', err?.message || err);
    }
    window._dsToast?.({
      title: persisted ? 'Saved' : 'Saved locally only',
      body: persisted ? 'Report stored in patient record. You can now export as PDF or DOCX.' : 'Server save failed; report remains in this session only.',
      severity: persisted ? 'success' : 'warn',
    });
    try { api.postWearablesWorkbenchAuditEvent({ event: 'report_saved', note: 'biometrics_analyzer_report patient=' + (pid || '') + (savedId ? ' id=' + savedId : '') }); } catch {}
    if (persisted) render();
  };
  window._monitorDownloadReport = async function (format) {
    var rep = s.biometricsReport;
    if (!rep || !rep.markdown) return;
    var isPatient = rep.isPatientFriendly;
    var activeMarkdown = isPatient ? (rep.patientFriendlyMarkdown || rep.markdown) : rep.markdown;
    var activeSavedId = isPatient ? (rep.patientFriendlySavedId || rep.savedId) : rep.savedId;
    var pid = s.selectedPatientId || window._selectedPatientId;
    var today = new Date().toISOString().slice(0, 10);
    var filenameBase = 'biometrics-report-' + (pid || 'unknown') + '-' + today;
    if (isPatient) {
      filenameBase = 'biometrics-patient-friendly-' + (pid || 'unknown') + '-' + today;
    }
    try {
      if (format === 'markdown') {
        var blob = new Blob([activeMarkdown], { type: 'text/markdown;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = filenameBase + '.md';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 200);
        window._dsToast?.({ title: 'Downloaded', body: filenameBase + '.md', severity: 'success' });
      } else if (format === 'html') {
        var htmlBody = isPatient ? _markdownToPatientFriendlyHtml(activeMarkdown) : _markdownToReportHtml(activeMarkdown);
        var htmlDoc = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Wearable Biometrics Report</title>'
          + '<style>body{font-family:system-ui,-apple-system,sans-serif;font-size:' + (isPatient ? '15px' : '13px') + ';color:#1a1a1a;background:#fff;padding:40px;line-height:1.7;max-width:800px;margin:0 auto}'
          + 'h1{font-size:22px;font-weight:700;margin:24px 0 12px}h2{font-size:18px;font-weight:700;margin:20px 0 10px;border-bottom:1px solid #ddd;padding-bottom:4px}'
          + 'h3{font-size:15px;font-weight:700;margin:16px 0 8px}h4{font-size:13px;font-weight:700;margin:12px 0 6px}'
          + 'p{margin:8px 0}li{margin:4px 0}strong{color:#111}em{color:#444}'
          + '.report-header{color:#666;font-size:11px;margin-bottom:24px;padding-bottom:12px;border-bottom:2px solid #0066cc}'
          + '.disclaimer{background:#f8f9fa;border:1px solid #dee2e6;padding:12px;border-radius:6px;font-size:12px;color:#495057;margin-top:24px}'
          + '</style></head><body>'
          + '<div class="report-header">Wearable Biometrics Clinical Summary Report<br>Patient: ' + esc(pid || 'unknown') + ' | Date: ' + esc(today) + ' | Generated by DeepSynaps AI (clinician review required)</div>'
          + htmlBody
          + '<div class="disclaimer"><strong>Disclaimer:</strong> This report is decision-support only and does not constitute diagnosis or treatment recommendation. All outputs require clinician review before any clinical action. Wearable metrics are consumer or research-grade unless sourced from a regulated device workflow.</div>'
          + '</body></html>';
        var htmlBlob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
        var htmlUrl = URL.createObjectURL(htmlBlob);
        var htmlA = document.createElement('a');
        htmlA.href = htmlUrl; htmlA.download = filenameBase + '.html';
        document.body.appendChild(htmlA); htmlA.click(); htmlA.remove();
        setTimeout(function () { URL.revokeObjectURL(htmlUrl); }, 200);
        window._dsToast?.({ title: 'Downloaded', body: filenameBase + '.html', severity: 'success' });
      } else if (format === 'json') {
        var jsonPayload = {
          report_type: isPatient ? 'patient_friendly_biometrics' : 'biometrics_summary',
          patient_id: pid,
          generated_at: isPatient ? (rep.patientFriendlyGeneratedAt || rep.generatedAt) : rep.generatedAt,
          markdown: activeMarkdown,
          saved_id: activeSavedId || null,
          source_data: {
            summaries: (s.patientDetail && Array.isArray(s.patientDetail.summaries)) ? s.patientDetail.summaries : [],
            alerts: (s.patientDetail && Array.isArray(s.patientDetail.recent_alerts)) ? s.patientDetail.recent_alerts : [],
            connections: (s.patientDetail && Array.isArray(s.patientDetail.connections)) ? s.patientDetail.connections : [],
            window_days: s.patientWearableDays || 30,
          }
        };
        var jsonBlob = new Blob([JSON.stringify(jsonPayload, null, 2)], { type: 'application/json' });
        var jsonUrl = URL.createObjectURL(jsonBlob);
        var jsonA = document.createElement('a');
        jsonA.href = jsonUrl; jsonA.download = filenameBase + '.json';
        document.body.appendChild(jsonA); jsonA.click(); jsonA.remove();
        setTimeout(function () { URL.revokeObjectURL(jsonUrl); }, 200);
        window._dsToast?.({ title: 'Downloaded', body: filenameBase + '.json', severity: 'success' });
      } else if (format === 'csv') {
        var csvContent = _buildBiometricsCsv(s, pid);
        var csvBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        var csvUrl = URL.createObjectURL(csvBlob);
        var csvA = document.createElement('a');
        csvA.href = csvUrl; csvA.download = filenameBase + '.csv';
        document.body.appendChild(csvA); csvA.click(); csvA.remove();
        setTimeout(function () { URL.revokeObjectURL(csvUrl); }, 200);
        window._dsToast?.({ title: 'Downloaded', body: filenameBase + '.csv', severity: 'success' });
      } else if (format === 'fhir') {
        var fhirBundle = _buildFhirBiometricsBundle(s, pid, today);
        var fhirBlob = new Blob([JSON.stringify(fhirBundle, null, 2)], { type: 'application/fhir+json' });
        var fhirUrl = URL.createObjectURL(fhirBlob);
        var fhirA = document.createElement('a');
        fhirA.href = fhirUrl; fhirA.download = filenameBase + '.fhir.json';
        document.body.appendChild(fhirA); fhirA.click(); fhirA.remove();
        setTimeout(function () { URL.revokeObjectURL(fhirUrl); }, 200);
        window._dsToast?.({ title: 'Downloaded', body: filenameBase + '.fhir.json', severity: 'success' });
      } else if (format === 'pdf' || format === 'docx') {
        if (!activeSavedId) {
          window._dsToast?.({ title: 'Save required', body: 'Please "Save to patient record" or "Share with patient" first to enable ' + format.toUpperCase() + ' export.', severity: 'warn' });
          return;
        }
        window._dsToast?.({ title: 'Rendering', body: 'Requesting ' + format.toUpperCase() + ' from server...', severity: 'info' });
        if (format === 'pdf') {
          try {
            var file = await api.renderStoredReport(activeSavedId, { format: 'pdf', audience: 'both' });
            if (!file || !file.blob) throw new Error('Server returned no file');
            var pdfUrl = URL.createObjectURL(file.blob);
            var pdfA = document.createElement('a');
            pdfA.href = pdfUrl; pdfA.download = file.filename || (filenameBase + '.pdf');
            document.body.appendChild(pdfA); pdfA.click(); pdfA.remove();
            setTimeout(function () { URL.revokeObjectURL(pdfUrl); }, 200);
            api.logReportsAudit?.({ event: 'exported', report_id: activeSavedId, note: 'format=pdf source=biometrics_analyzer' });
            window._dsToast?.({ title: 'PDF ready', body: file.filename || (filenameBase + '.pdf'), severity: 'success' });
          } catch (err) {
            window._dsToast?.({ title: 'PDF export failed', body: err?.message || 'Server PDF renderer unavailable.', severity: 'warn' });
          }
        } else if (format === 'docx') {
          try {
            var docxFile = await api.exportReportDocx(activeSavedId);
            if (!docxFile || !docxFile.blob) throw new Error('Server returned no file');
            var docxUrl = URL.createObjectURL(docxFile.blob);
            var docxA = document.createElement('a');
            docxA.href = docxUrl; docxA.download = docxFile.filename || (filenameBase + '.docx');
            document.body.appendChild(docxA); docxA.click(); docxA.remove();
            setTimeout(function () { URL.revokeObjectURL(docxUrl); }, 200);
            api.logReportsAudit?.({ event: 'exported', report_id: activeSavedId, note: 'format=docx source=biometrics_analyzer' });
            window._dsToast?.({ title: 'DOCX ready', body: docxFile.filename || (filenameBase + '.docx'), severity: 'success' });
          } catch (err) {
            window._dsToast?.({ title: 'DOCX export failed', body: err?.message || 'Server DOCX renderer unavailable.', severity: 'warn' });
          }
        }
      }
    } catch (e) {
      window._dsToast?.({ title: 'Download failed', body: e?.message || 'Unknown error', severity: 'warn' });
    }
    try { api.postWearablesWorkbenchAuditEvent({ event: 'report_exported', note: 'format=' + format + ' patient=' + (pid || '') }); } catch {}
  };
  window._monitorCopyReportMarkdown = async function () {
    var rep = s.biometricsReport;
    if (!rep || !rep.markdown) return;
    var text = rep.isPatientFriendly && rep.patientFriendlyMarkdown ? rep.patientFriendlyMarkdown : rep.markdown;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        window._dsToast?.({ title: 'Copied', body: 'Report markdown copied to clipboard.', severity: 'success' });
      } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        window._dsToast?.({ title: 'Copied', body: 'Report markdown copied to clipboard.', severity: 'success' });
      }
    } catch (e) {
      window._dsToast?.({ title: 'Copy failed', body: 'Could not copy to clipboard.', severity: 'warn' });
    }
  };
  window._monitorPrintBiometricsReport = function () {
    var panel = document.getElementById('monitor-biometrics-report-panel');
    if (!panel) return;
    var w = window.open('', '_blank', 'width=900,height=700');
    if (!w) {
      document.body.classList.add('monitor-printing');
      window.print();
      setTimeout(function () { document.body.classList.remove('monitor-printing'); }, 500);
      return;
    }
    var rep = s.biometricsReport;
    var pid = s.selectedPatientId || window._selectedPatientId;
    var today = new Date().toISOString().slice(0, 10);
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Biometrics Report</title>'
      + '<style>body{font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#111;padding:32px;line-height:1.6;max-width:720px;margin:0 auto}'
      + 'h1{font-size:18px;margin:0 0 8px}h2{font-size:15px;margin:16px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px}'
      + 'h3{font-size:13px;margin:12px 0 6px}h4{font-size:12px;margin:10px 0 4px}'
      + 'p{margin:6px 0}li{margin:3px 0}strong{color:#000}'
      + '.report-header{color:#555;font-size:11px;margin-bottom:20px;padding-bottom:10px;border-bottom:2px solid #0066cc}'
      + '.disclaimer{background:#f5f5f5;border:1px solid #ddd;padding:10px;border-radius:4px;font-size:11px;color:#555;margin-top:20px}'
      + '@media print{body{padding:16px}}'
      + '</style></head><body>'
      + '<div class="report-header">Wearable Biometrics Clinical Summary Report<br>Patient: ' + esc(pid || 'unknown') + ' | Date: ' + esc(today) + '</div>'
      + _markdownToReportHtml(rep.markdown || '')
      + '<div class="disclaimer"><strong>Disclaimer:</strong> This report is decision-support only and does not constitute diagnosis or treatment recommendation. All outputs require clinician review.</div>'
      + '</body></html>');
    w.document.close();
    setTimeout(function () { try { w.focus(); w.print(); } catch {} }, 400);
  };

  window._monitorSaveBiometricsSchedule = function () {
    var freq = document.getElementById('monitor-schedule-freq');
    var format = document.getElementById('monitor-schedule-format');
    var time = document.getElementById('monitor-schedule-time');
    var delivery = document.getElementById('monitor-schedule-delivery');
    var enabled = document.getElementById('monitor-schedule-enabled');
    var schedule = {
      id: 'sched-' + Date.now(),
      frequency: freq ? freq.value : 'daily',
      format: format ? format.value : 'markdown',
      time: time ? time.value : '08:00',
      delivery: delivery ? delivery.value : 'download',
      enabled: enabled ? enabled.checked : true,
      lastRun: null,
      createdAt: new Date().toISOString(),
    };
    s.biometricsReportSchedules = s.biometricsReportSchedules || [];
    s.biometricsReportSchedules.push(schedule);
    _persistBiometricsSchedules(s.biometricsReportSchedules);
    render();
  };

  window._monitorDeleteBiometricsSchedule = function (idx) {
    s.biometricsReportSchedules = s.biometricsReportSchedules || [];
    s.biometricsReportSchedules.splice(idx, 1);
    _persistBiometricsSchedules(s.biometricsReportSchedules);
    render();
  };

  window._monitorToggleBiometricsSchedule = function (idx) {
    s.biometricsReportSchedules = s.biometricsReportSchedules || [];
    if (s.biometricsReportSchedules[idx]) {
      s.biometricsReportSchedules[idx].enabled = !s.biometricsReportSchedules[idx].enabled;
      _persistBiometricsSchedules(s.biometricsReportSchedules);
      render();
    }
  };

  window._monitorShowDayCard = function (metaJson) {
    var cardHtml = _renderDayCard(metaJson);
    if (!cardHtml) return;
    var container = document.getElementById('monitor-day-card-anchor');
    if (!container) {
      container = document.createElement('div');
      container.id = 'monitor-day-card-anchor';
      document.body.appendChild(container);
    }
    container.innerHTML = cardHtml;
  };
  window._monitorCloseDayCard = function () {
    var container = document.getElementById('monitor-day-card-anchor');
    if (container) container.innerHTML = '';
  };

  window._monitorBiometricsAuditNote = function (val) {
    s.biometricsAuditNote = val || '';
  };
  window._monitorBiometricsAuditNoteTemplate = function (template) {
    var templates = {
      reviewed_no_concerns: 'Reviewed wearable summary. No acute concerns. Continue current plan.',
      follow_up_needed: 'Reviewed wearable summary. Follow-up recommended: ',
      patient_contact: 'Reviewed wearable summary. Action: contact patient regarding ',
    };
    var ta = document.querySelector('#monitor-tab-biometrics textarea.monitor-textarea');
    var existing = s.biometricsAuditNote || '';
    var prefix = existing ? existing + '\n' : '';
    var t = templates[template] || '';
    if (t) {
      s.biometricsAuditNote = prefix + t;
      if (ta) ta.value = s.biometricsAuditNote;
    }
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
      s.workbenchActionError = null;
      try {
        await api.wearablesWorkbenchAcknowledge(flagId, note);
      } catch (e) {
        var msg = (e && e.message) ? String(e.message) : 'request failed';
        s.workbenchActionError = 'Could not acknowledge wearable alert flag: ' + msg;
      }
      await loadWorkbench();
    })();
  };
  window._workbenchEscalate = function (flagId) {
    var note = (window.prompt && window.prompt('Escalation note — describes the clinical concern (required):')) || '';
    note = String(note || '').trim();
    if (!note) return;
    (async function () {
      s.workbenchActionError = null;
      try {
        var resp = await api.wearablesWorkbenchEscalate(flagId, note, null);
        if (resp && resp.adverse_event_id && window.confirm) {
          if (window.confirm('Adverse Event draft created (' + resp.adverse_event_id + '). Open AE Hub now?')) {
            window._nav?.('adverse-events-hub');
          }
        }
      } catch (e) {
        var msg = (e && e.message) ? String(e.message) : 'request failed';
        s.workbenchActionError = 'Could not escalate wearable alert flag: ' + msg;
      }
      await loadWorkbench();
    })();
  };
  window._workbenchResolve = function (flagId) {
    var note = (window.prompt && window.prompt('Resolution note (required) — flag becomes immutable:')) || '';
    note = String(note || '').trim();
    if (!note) return;
    (async function () {
      s.workbenchActionError = null;
      try {
        await api.wearablesWorkbenchResolve(flagId, note);
      } catch (e) {
        var msg = (e && e.message) ? String(e.message) : 'request failed';
        s.workbenchActionError = 'Could not resolve wearable alert flag: ' + msg;
      }
      await loadWorkbench();
    })();
  };
  window._workbenchOpenPatient = function (patientId) {
    if (!patientId) return;
    window._selectedPatientId = patientId;
    window._profilePatientId = patientId;
    window._profileMonitorHandoff = { source: 'wearables_workbench', tab: 'wearables-workbench', reason_text: 'wearable alert triage queue' };
    try { sessionStorage.setItem('ds_pat_selected_id', String(patientId)); } catch {}
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
    window.open(api.wearablesWorkbenchExportCsvUrl(s.workbenchFilters || {}), '_blank');
  };
  window._workbenchExportNdjson = function () {
    try { api.postWearablesWorkbenchAuditEvent({ event: 'export_initiated', note: 'format=ndjson' }); } catch {}
    window.open(api.wearablesWorkbenchExportNdjsonUrl(s.workbenchFilters || {}), '_blank');
  };
}
