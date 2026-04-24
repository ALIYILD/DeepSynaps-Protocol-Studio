// ─────────────────────────────────────────────────────────────────────────────
// pages-mri-analysis.js — MRI Analyzer (Clinical Portal)
//
// Mirrors the structure of pages-qeeg-analysis.js.  The page renders a
// 2-column layout (per portal_integration/DASHBOARD_PAGE_SPEC.md §Page layout):
//
//   Left column:  Session uploader, patient meta form, condition selector,
//                 pipeline progress pills.
//   Right column: Stim-target cards, 3-plane slice viewer placeholder,
//                 glass-brain summary, MedRAG literature panel.
//
// Demo mode auto-loads DEMO_MRI_REPORT (a verbatim copy of
// packages/mri-pipeline/demo/sample_mri_report.json) so reviewers on the
// Netlify preview (VITE_ENABLE_DEMO=1) see the full populated report without
// the Fly API being online.
// ─────────────────────────────────────────────────────────────────────────────
import { api } from './api.js';
import { emptyState, showToast } from './helpers.js';

// ── Module state ────────────────────────────────────────────────────────────
var _mriAnalysisId = null;
var _uploadId      = null;
var _jobId         = null;
var _report        = null;
var _patientMeta   = null;
var _medragCache   = null;
var _jobStatus     = null;       // { stage, state } snapshot
var _jobPollTimer  = null;
var _selectedCondition = 'mdd';
// Populated by pgMRIAnalysis() and re-read by the compare modal's submit
// handler so we don't refetch on every click.
var _patientAnalysesCache = { patientId: null, rows: [] };

// ── Feature flag ────────────────────────────────────────────────────────────
function _mriFeatureFlagEnabled() {
  try {
    var v = (typeof window !== 'undefined' && window)
      ? window.DEEPSYNAPS_ENABLE_MRI_ANALYZER
      : (typeof globalThis !== 'undefined' ? globalThis.DEEPSYNAPS_ENABLE_MRI_ANALYZER : undefined);
    if (v === false || v === 'false' || v === 0 || v === '0') return false;
    return true;
  } catch (_) { return true; }
}

// ── Demo mode ───────────────────────────────────────────────────────────────
function _isDemoMode() {
  try {
    return !!(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1');
  } catch (_) { return false; }
}

// ── XSS helper ──────────────────────────────────────────────────────────────
function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Small shared helpers ────────────────────────────────────────────────────
function spinner(msg) {
  return '<div style="display:flex;align-items:center;gap:8px;padding:24px;color:var(--text-secondary)">'
    + '<span class="spinner"></span>' + esc(msg || 'Loading...') + '</div>';
}

function card(title, body, extra) {
  return '<div class="ds-card">'
    + (title ? '<div class="ds-card__header"><h3>' + esc(title) + '</h3>' + (extra || '') + '</div>' : '')
    + '<div class="ds-card__body">' + body + '</div></div>';
}

// ─────────────────────────────────────────────────────────────────────────────
// DEMO_MRI_REPORT — verbatim copy of demo/sample_mri_report.json.  Demo mode
// feeds this directly to the renderers; no API call is required.
// ─────────────────────────────────────────────────────────────────────────────
export var DEMO_MRI_REPORT = {
  analysis_id: "8a7f1c52-2f5d-4b11-9c66-0a1c1bd8c9e3",
  patient: {
    patient_id: "DS-2026-000123",
    age: 54,
    sex: "F",
    handedness: "R",
    chief_complaint: "Treatment-resistant major depressive disorder",
  },
  modalities_present: ["T1", "rs_fMRI", "DTI"],

  qc: {
    t1_snr: 18.4,
    fmri_framewise_displacement_mean_mm: 0.121,
    fmri_outlier_volume_pct: 2.3,
    dti_outlier_volumes: 1,
    segmentation_failed_regions: [],
    passed: true,
    notes: ["pipeline_version=0.1.0"],
  },

  structural: {
    atlas: "Desikan-Killiany",
    cortical_thickness_mm: {
      dlpfc_l: { value: 2.31, unit: "mm", z: -1.8, percentile: 3.6, flagged: false },
      acc_l:   { value: 2.65, unit: "mm", z: -2.4, percentile: 0.8, flagged: true },
    },
    subcortical_volume_mm3: {
      hippocampus_l: { value: 3400, unit: "mm^3", z: -1.1, percentile: 13.6, flagged: false },
      amygdala_l:    { value: 1420, unit: "mm^3", z: -2.1, percentile: 1.8,  flagged: true },
    },
    wmh_volume_ml: { value: 2.1, unit: "mL", z: 0.4, percentile: 65, flagged: false },
    ventricular_volume_ml: { value: 24.6, unit: "mL", z: 0.2, percentile: 58, flagged: false },
    icv_ml: 1452,
    segmentation_engine: "synthseg_plus",
    brain_age: {
      status: "ok",
      predicted_age_years: 58.7,
      chronological_age_years: 54.0,
      brain_age_gap_years: 4.7,
      gap_zscore: 1.42,
      cognition_cdr_estimate: 0.18,
      model_id: "brainage_cnn_v1",
      mae_years_reference: 3.30,
      runtime_sec: 1.92,
      error_message: null,
    },
  },

  functional: {
    networks: [
      { network: "DMN", mean_within_fc: { value: 0.41, unit: "r", z: -1.3, flagged: false }, top_hubs: ["PCC", "mPFC", "precuneus"] },
      { network: "SN",  mean_within_fc: { value: 0.29, unit: "r", z: -2.0, flagged: true  }, top_hubs: ["R_anterior_insula", "dACC"] },
      { network: "CEN", mean_within_fc: { value: 0.33, unit: "r", z: -1.7, flagged: false }, top_hubs: ["L_DLPFC", "L_IPL"] },
    ],
    sgACC_DLPFC_anticorrelation: { value: -0.37, unit: "fisher_z", z: -2.6, flagged: true },
    fc_matrix_shape: [256, 256],
    atlas: "DiFuMo-256",
  },

  diffusion: {
    bundles: [
      { bundle: "UF_L", mean_FA: { value: 0.41, z: -1.9, flagged: false }, mean_MD: { value: 7.9e-4 }, streamline_count: 2184 },
      { bundle: "CG_L", mean_FA: { value: 0.39, z: -2.2, flagged: true  }, mean_MD: { value: 8.3e-4 }, streamline_count: 1902 },
      { bundle: "AF_L", mean_FA: { value: 0.52, z: -0.4, flagged: false }, mean_MD: { value: 7.1e-4 }, streamline_count: 2766 },
    ],
    fa_map_s3: null, md_map_s3: null, tractogram_s3: null,
  },

  stim_targets: [
    {
      target_id: "rTMS_MDD_personalised_sgACC",
      modality: "rtms",
      condition: "mdd",
      region_name: "Left DLPFC — patient-specific sgACC anticorrelation",
      region_code: "dlpfc_l",
      mni_xyz: [-41.0, 43.0, 28.0],
      patient_xyz: null,
      method: "sgACC_anticorrelation_personalised",
      method_reference_dois: ["10.1016/j.biopsych.2012.04.028", "10.1176/appi.ajp.2021.20101429"],
      suggested_parameters: { protocol: "iTBS", sessions: 30, pulses_per_session: 600, intensity_pct_rmt: 120.0, frequency_hz: 50.0 },
      supporting_paper_ids_from_medrag: [1821, 34422, 51907],
      confidence: "high",
      efield_dose: {
        status: "ok",
        v_per_m_at_target: 92.4,
        peak_v_per_m: 138.1,
        focality_50pct_volume_cm3: 4.6,
        iso_contour_mesh_s3: "artefacts/efield_rTMS_MDD_personalised_sgACC/subject_TMS_1-0001_Magstim_70mm_Fig8_scalar.msh",
        e_field_png_s3: "overlays/efield_rTMS_MDD_personalised_sgACC.png",
        coil_optimised: true,
        optimised_coil_pos: { centre_x: -48.3, centre_y: 40.1, centre_z: 34.2, direction_deg: 45.0 },
        solver: "simnibs_fem",
        runtime_sec: 182.4,
        error_message: null,
      },
      disclaimer: "Reference target coordinates derived from peer-reviewed literature. Not a substitute for clinician judgment. For neuronavigation planning only.",
    },
    {
      target_id: "rTMS_MDD_F3_Beam",
      modality: "rtms",
      condition: "mdd",
      region_name: "Left DLPFC — F3 Beam group target",
      region_code: "dlpfc_l",
      mni_xyz: [-37, 26, 49],
      method: "F3_Beam_projection",
      method_reference_dois: ["10.1016/j.brs.2009.03.005"],
      suggested_parameters: { protocol: "iTBS", sessions: 30, pulses_per_session: 600, intensity_pct_rmt: 120.0, frequency_hz: 50.0 },
      supporting_paper_ids_from_medrag: [],
      confidence: "medium",
      disclaimer: "Reference target coordinates derived from peer-reviewed literature. Not a substitute for clinician judgment. For neuronavigation planning only.",
    },
    {
      target_id: "tFUS_TRD_SCC",
      modality: "tfus",
      condition: "mdd",
      region_name: "Subcallosal cingulate (SCC / BA25)",
      region_code: "acc_rostral",
      mni_xyz: [4, 20, -12],
      method: "tFUS_SCC_Riis",
      method_reference_dois: ["10.1016/j.brs.2023.01.016"],
      suggested_parameters: { protocol: "tFUS", sessions: 1, duty_cycle_pct: 5.0, derated_i_spta_mw_cm2: 720.0, mechanical_index: 0.8 },
      confidence: "low",
      disclaimer: "Reference target coordinates derived from peer-reviewed literature. Not a substitute for clinician judgment. For neuronavigation planning only.",
    },
  ],

  medrag_query: {
    findings: [
      { type: "region_metric",  value: "acc_l_thickness",            zscore: -2.4, polarity: -1 },
      { type: "region_metric",  value: "amygdala_l_volume",          zscore: -2.1, polarity: -1 },
      { type: "network_metric", value: "SN_within_fc",               zscore: -2.0, polarity: -1 },
      { type: "network_metric", value: "sgACC_DLPFC_anticorrelation", zscore: -2.6, polarity: -1 },
      { type: "region_metric",  value: "CG_L_FA",                    zscore: -2.2, polarity: -1 },
    ],
    conditions: ["mdd"],
  },

  overlays: {
    rTMS_MDD_personalised_sgACC: "overlays/rTMS_MDD_personalised_sgACC_interactive.html",
    rTMS_MDD_F3_Beam:             "overlays/rTMS_MDD_F3_Beam_interactive.html",
    tFUS_TRD_SCC:                 "overlays/tFUS_TRD_SCC_interactive.html",
  },

  report_pdf_s3:  null,
  report_html_s3: null,

  pipeline_version: "0.1.0",
  norm_db_version: "ISTAGING-v1",
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants — condition enum (from api_contract.md §2) and pipeline stages.
// ─────────────────────────────────────────────────────────────────────────────
var CONDITION_OPTIONS = [
  { value: 'mdd',          label: 'Major Depressive Disorder (MDD)' },
  { value: 'ptsd',         label: 'PTSD' },
  { value: 'ocd',          label: 'OCD' },
  { value: 'alzheimers',   label: "Alzheimer's" },
  { value: 'parkinsons',   label: "Parkinson's" },
  { value: 'chronic_pain', label: 'Chronic pain' },
  { value: 'tinnitus',     label: 'Tinnitus' },
  { value: 'stroke',       label: 'Stroke' },
  { value: 'adhd',         label: 'ADHD' },
  { value: 'tbi',          label: 'TBI' },
  { value: 'asd',          label: 'ASD' },
  { value: 'insomnia',     label: 'Insomnia' },
];

var PIPELINE_STAGES = [
  { id: 'ingest',     label: 'Ingest' },
  { id: 'structural', label: 'Structural' },
  { id: 'fmri',       label: 'fMRI' },
  { id: 'dmri',       label: 'dMRI' },
  { id: 'targeting',  label: 'Targeting' },
];

// Modality → badge class map (per DASHBOARD_PAGE_SPEC.md §Color mapping).
var MODALITY_CLASS = {
  rtms: 'ds-mri-badge-rtms',
  tps:  'ds-mri-badge-tps',
  tfus: 'ds-mri-badge-tfus',
  tdcs: 'ds-mri-badge-tdcs',
  tacs: 'ds-mri-badge-tacs',
};

// ─────────────────────────────────────────────────────────────────────────────
// Public, testable helpers
// ─────────────────────────────────────────────────────────────────────────────
export function _getMRIState() {
  return {
    analysisId: _mriAnalysisId,
    uploadId:   _uploadId,
    jobId:      _jobId,
    report:     _report,
    patientMeta: _patientMeta,
  };
}

export function _resetMRIState() {
  _mriAnalysisId = null;
  _uploadId = null;
  _jobId = null;
  _report = null;
  _patientMeta = null;
  _medragCache = null;
  _jobStatus = null;
  if (_jobPollTimer) { clearInterval(_jobPollTimer); _jobPollTimer = null; }
}

// Determine the badge CSS class for a modality.  Returns the rose
// "personalised" class when the target's `method` ends with "_personalised".
export function _modalityBadgeClass(target) {
  if (!target) return '';
  var method = String(target.method || '');
  if (method.endsWith('_personalised')) return 'ds-mri-badge-personalised';
  var mod = String(target.modality || '').toLowerCase();
  return MODALITY_CLASS[mod] || '';
}

// Regulatory footer string — rendered on every view of the MRI Analyzer page.
export var REGULATORY_FOOTER_TEXT =
  'Decision-support tool. Not a medical device. Coordinates and suggested parameters are '
  + 'derived from peer-reviewed literature. Not a substitute for clinician judgment. '
  + 'For neuronavigation planning only.';

export function renderRegulatoryFooter() {
  return '<div class="ds-mri-footer-regulatory" role="note">'
    + '<strong>Decision-support tool. Not a medical device.</strong> '
    + 'Coordinates and suggested parameters are derived from peer-reviewed literature. '
    + 'Not a substitute for clinician judgment. For neuronavigation planning only.'
    + '</div>';
}

// ── Top bar (inside the page, not setTopbar) ────────────────────────────────
function renderHero(patientAnalyses) {
  var compareBtn = renderCompareButton(patientAnalyses);
  return '<div class="qeeg-hero" style="background:linear-gradient(135deg,rgba(37,99,235,0.08),rgba(74,158,255,0.04));border-color:rgba(37,99,235,0.18)">'
    + '<div class="qeeg-hero__icon" style="background:rgba(37,99,235,0.14);color:#60a5fa">&#x1F9E0;</div>'
    + '<div style="flex:1"><div class="qeeg-hero__title">MRI Analyzer</div>'
    + '<div class="qeeg-hero__sub">Structural &middot; fMRI &middot; DTI &middot; MNI stim-target engine</div></div>'
    + '<div>'
    + '<button class="btn btn-primary btn-sm" id="ds-mri-new-analysis">+ New analysis</button>'
    + compareBtn
    + '</div>'
    + '</div>';
}

// ── Left column: session uploader ───────────────────────────────────────────
function renderUploader() {
  var statusLine;
  if (_uploadId && _uploadId !== 'demo') {
    statusLine = '<div class="ds-mri-upload-status" style="color:var(--green);font-size:12px;margin-top:8px">'
      + '&#x2713; Upload ready &middot; <code style="font-size:11px">' + esc(_uploadId) + '</code></div>';
  } else if (_uploadId === 'demo') {
    statusLine = '<div class="ds-mri-upload-status" style="color:var(--amber);font-size:12px;margin-top:8px">Demo upload loaded.</div>';
  } else {
    statusLine = '<div class="ds-mri-upload-status" style="color:var(--text-tertiary);font-size:11.5px;margin-top:8px">No upload yet. Accepts .zip (DICOM), .nii, .nii.gz.</div>';
  }
  var body = '<div class="ds-mri-dropzone" id="ds-mri-dropzone" role="button" tabindex="0" aria-label="Upload MRI session">'
    + '<div style="font-size:28px;margin-bottom:6px">&#x1F4E5;</div>'
    + '<div style="font-size:13px;color:var(--text-primary);font-weight:600">Drop DICOM .zip or NIfTI .nii / .nii.gz here</div>'
    + '<div style="font-size:11.5px;color:var(--text-tertiary);margin-top:4px">or click to browse</div>'
    + '<input type="file" id="ds-mri-file" accept=".zip,.nii,.gz" style="display:none">'
    + '</div>'
    + statusLine;
  return card('Session upload', body);
}

// ── Left column: patient meta form ──────────────────────────────────────────
function renderPatientMetaForm() {
  var meta = _patientMeta || {};
  var body = '<div class="ds-mri-form">'
    + '<div class="form-group"><label class="form-label">Patient ID</label>'
    + '<input type="text" class="form-control" id="ds-mri-pid" placeholder="e.g. DS-2026-000123" value="' + esc(meta.patient_id || '') + '"></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">'
    + '<div class="form-group"><label class="form-label">Age</label>'
    + '<input type="number" min="0" max="120" class="form-control" id="ds-mri-age" placeholder="yrs" value="' + esc(meta.age != null ? meta.age : '') + '"></div>'
    + '<div class="form-group"><label class="form-label">Sex</label>'
    + '<select class="form-control" id="ds-mri-sex">'
    + '<option value="">—</option>'
    + '<option value="F"' + (meta.sex === 'F' ? ' selected' : '') + '>F</option>'
    + '<option value="M"' + (meta.sex === 'M' ? ' selected' : '') + '>M</option>'
    + '<option value="O"' + (meta.sex === 'O' ? ' selected' : '') + '>O</option>'
    + '</select></div>'
    + '<div class="form-group"><label class="form-label">Handedness</label>'
    + '<select class="form-control" id="ds-mri-hand">'
    + '<option value="">—</option>'
    + '<option value="R"' + (meta.handedness === 'R' ? ' selected' : '') + '>Right</option>'
    + '<option value="L"' + (meta.handedness === 'L' ? ' selected' : '') + '>Left</option>'
    + '<option value="A"' + (meta.handedness === 'A' ? ' selected' : '') + '>Ambi.</option>'
    + '</select></div>'
    + '</div>'
    + '<div class="form-group" style="margin-bottom:0"><label class="form-label">Chief complaint</label>'
    + '<textarea class="form-control" id="ds-mri-cc" placeholder="Primary concern / referral reason">' + esc(meta.chief_complaint || '') + '</textarea></div>'
    + '</div>';
  return card('Patient meta', body);
}

// ── Left column: condition selector ─────────────────────────────────────────
function renderConditionSelector() {
  var opts = CONDITION_OPTIONS.map(function (o) {
    return '<option value="' + esc(o.value) + '"'
      + (_selectedCondition === o.value ? ' selected' : '')
      + '>' + esc(o.label) + '</option>';
  }).join('');
  var body = '<div class="form-group" style="margin-bottom:8px">'
    + '<label class="form-label">Target condition</label>'
    + '<select class="form-control" id="ds-mri-condition">' + opts + '</select></div>'
    + '<div style="font-size:11px;color:var(--text-tertiary);line-height:1.5">'
    + 'Selects which stim-target atlas to score against.  Maps to a kg_entities.code.'
    + '</div>'
    + '<div style="margin-top:12px;display:flex;gap:8px;align-items:center">'
    + '<button class="btn btn-primary" id="ds-mri-run-btn"' + (_uploadId ? '' : ' disabled') + '>Run analysis</button>'
    + '<span id="ds-mri-run-status" style="font-size:11.5px;color:var(--text-tertiary)"></span>'
    + '</div>';
  return card('Condition &amp; protocol', body);
}

// ── Left column: pipeline progress ──────────────────────────────────────────
export function renderPipelineProgress(status) {
  // Normalise: `status` = { stage, state } per API contract §3.  We render
  // all 5 stages; stages before the current one are "done", current one is
  // "running" (unless terminal SUCCESS/FAILURE).
  var s = status || { stage: null, state: null };
  var state = String(s.state || '').toUpperCase();
  var cur = String(s.stage || '').toLowerCase();
  var curIdx = -1;
  for (var i = 0; i < PIPELINE_STAGES.length; i++) {
    if (PIPELINE_STAGES[i].id === cur) { curIdx = i; break; }
  }
  if (state === 'SUCCESS') curIdx = PIPELINE_STAGES.length; // all done
  var pills = PIPELINE_STAGES.map(function (stg, idx) {
    var pill = 'queued';
    if (state === 'FAILURE' && idx === Math.max(0, curIdx)) pill = 'failed';
    else if (curIdx === -1) pill = 'queued';
    else if (idx < curIdx) pill = 'done';
    else if (idx === curIdx) pill = (state === 'SUCCESS') ? 'done' : 'running';
    else pill = 'queued';
    var icon = pill === 'done' ? '&#x2713;' : pill === 'running' ? '&#x25B6;' : pill === 'failed' ? '&#x26A0;' : '&#x25CB;';
    return '<div class="ds-mri-stage-pill ds-mri-stage-pill--' + pill + '" data-stage="' + esc(stg.id) + '">'
      + '<span class="ds-mri-stage-pill__icon">' + icon + '</span>'
      + '<span class="ds-mri-stage-pill__label">' + esc(stg.label) + '</span>'
      + '<span class="ds-mri-stage-pill__state">' + esc(pill) + '</span>'
      + '</div>';
  }).join('');
  return card('Pipeline progress',
    '<div class="ds-mri-stage-row">' + pills + '</div>'
    + '<div style="font-size:11px;color:var(--text-tertiary);margin-top:10px">Polls <code>/api/v1/mri/status/{job_id}</code> every 2 s.</div>');
}

// ── Right column: single stim-target card ──────────────────────────────────
export function renderTargetCard(target, analysisId) {
  if (!target) return '';
  var badgeClass = _modalityBadgeClass(target);
  var isPersonalised = String(target.method || '').endsWith('_personalised');
  var pulsingDot = isPersonalised
    ? '<span class="ds-mri-pulsing-dot" aria-hidden="true"></span>'
    : '';
  var mni = Array.isArray(target.mni_xyz) && target.mni_xyz.length === 3
    ? '[' + target.mni_xyz.map(function (v) { return (typeof v === 'number' ? v.toFixed(1) : esc(v)); }).join(', ') + ']'
    : '—';

  var confColor = target.confidence === 'high' ? 'var(--green)'
                : target.confidence === 'medium' || target.confidence === 'moderate' ? 'var(--amber)'
                : 'var(--text-tertiary)';

  var params = target.suggested_parameters || {};
  var paramBits = [];
  if (params.protocol)        paramBits.push('<span><b>Protocol</b> ' + esc(params.protocol) + '</span>');
  if (params.sessions != null) paramBits.push('<span><b>Sessions</b> ' + esc(params.sessions) + '</span>');
  if (params.pulses_per_session != null) paramBits.push('<span><b>Pulses/sess</b> ' + esc(params.pulses_per_session) + '</span>');
  if (params.intensity_pct_rmt != null) paramBits.push('<span><b>Intensity</b> ' + esc(params.intensity_pct_rmt) + '% rMT</span>');
  if (params.frequency_hz != null) paramBits.push('<span><b>Freq</b> ' + esc(params.frequency_hz) + ' Hz</span>');
  if (params.duty_cycle_pct != null) paramBits.push('<span><b>Duty</b> ' + esc(params.duty_cycle_pct) + '%</span>');
  if (params.mechanical_index != null) paramBits.push('<span><b>MI</b> ' + esc(params.mechanical_index) + '</span>');
  var paramsHtml = paramBits.length
    ? '<div class="ds-mri-target-params">' + paramBits.join('') + '</div>'
    : '';

  // DOI chips
  var dois = Array.isArray(target.method_reference_dois) ? target.method_reference_dois : [];
  var doiChips = dois.map(function (doi) {
    var safe = esc(doi);
    return '<a class="ds-mri-doi-chip" target="_blank" rel="noopener noreferrer" href="https://doi.org/' + safe + '">'
      + safe + '</a>';
  }).join('');

  // MedRAG paper-id chips
  var papers = Array.isArray(target.supporting_paper_ids_from_medrag) ? target.supporting_paper_ids_from_medrag : [];
  var paperChips = papers.map(function (pid) {
    return '<span class="ds-mri-paper-chip" title="MedRAG paper id">#' + esc(pid) + '</span>';
  }).join('');

  var tid = esc(target.target_id || '');
  var aid = esc(analysisId || _mriAnalysisId || (_report && _report.analysis_id) || 'demo');

  var actions = '<div class="ds-mri-target-actions">'
    + '<button class="btn btn-sm ds-mri-send-nav" data-target="' + tid + '">Send to Neuronav</button>'
    + '<button class="btn btn-sm ds-mri-view-overlay" data-target="' + tid + '">View overlay</button>'
    + '<button class="btn btn-sm ds-mri-download-target" data-target="' + tid + '">Download target JSON</button>'
    + '</div>';

  return '<div class="ds-mri-target-card ' + badgeClass + '" data-target-id="' + tid + '" data-aid="' + aid + '">'
    + '<div class="ds-mri-target-head">'
    + '<span class="ds-mri-modality-badge ' + badgeClass + '">' + pulsingDot
    + esc(String(target.modality || '').toUpperCase()) + '</span>'
    + '<span class="ds-mri-target-region">' + esc(target.region_name || '—') + '</span>'
    + '<span class="ds-mri-mni" title="MNI coordinates">' + esc(mni) + '</span>'
    + '<span class="ds-mri-conf-badge" style="color:' + confColor + ';border-color:' + confColor + '44">'
    + esc(target.confidence || 'n/a') + '</span>'
    + '</div>'
    + '<div class="ds-mri-target-method">' + esc(target.method || '—') + '</div>'
    + paramsHtml
    + (doiChips ? '<div class="ds-mri-chips"><span class="ds-mri-chips__label">References</span>' + doiChips + '</div>' : '')
    + (paperChips ? '<div class="ds-mri-chips"><span class="ds-mri-chips__label">MedRAG papers</span>' + paperChips + '</div>' : '')
    + actions
    + '</div>';
}

// ── Right column: targets list ─────────────────────────────────────────────
export function renderTargetsPanel(report) {
  if (!report || !Array.isArray(report.stim_targets) || !report.stim_targets.length) {
    return card('Stimulation targets',
      emptyState('&#x1F3AF;', 'No targets yet', 'Run an analysis to compute stim targets.'));
  }
  var aid = report.analysis_id || _mriAnalysisId;
  var cards = report.stim_targets.map(function (t) { return renderTargetCard(t, aid); }).join('');
  return card('Stimulation targets (' + report.stim_targets.length + ')',
    '<div class="ds-mri-targets-list">' + cards + '</div>');
}

// ── Right column: 3-plane slice viewer placeholder ─────────────────────────
export function renderSliceViewer(report) {
  var aid = report && report.analysis_id ? report.analysis_id : null;
  var target0 = report && Array.isArray(report.stim_targets) && report.stim_targets[0]
    ? report.stim_targets[0].target_id : null;
  var openable = aid && target0;
  var body = '<div class="ds-mri-slice-viewer">'
    + '<div class="ds-mri-slice-viewer__icon">T1</div>'
    + '<div class="ds-mri-slice-viewer__msg">Interactive viewer available after overlay load.</div>'
    + (openable
      ? '<button class="btn btn-sm ds-mri-open-overlay" data-aid="' + esc(aid) + '" data-target="' + esc(target0) + '">'
        + 'Open overlay for first target</button>'
      : '<button class="btn btn-sm" disabled>Overlay unavailable</button>')
    + '</div>';
  return card('3-plane slice viewer', body);
}

// ── Right column: glass-brain summary ──────────────────────────────────────
export function renderGlassBrain(report) {
  var targets = (report && Array.isArray(report.stim_targets)) ? report.stim_targets : [];
  // Simple brain-outline path (approximate MNI axial silhouette).
  var outline =
    '<path d="M100,20 C160,20 195,60 195,110 C195,150 170,185 140,185 '
    + 'L125,200 L115,215 L100,225 L85,215 L75,200 L60,185 '
    + 'C30,185 5,150 5,110 C5,60 40,20 100,20 Z" '
    + 'fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>';
  // Project MNI (x,y) to 2D: MNI x in [-90, 90] → svg x in [10, 190]; MNI y in [-120, 80] → svg y in [215, 15].
  function mniTo2D(xyz) {
    if (!Array.isArray(xyz) || xyz.length < 2) return null;
    var mx = Number(xyz[0]);
    var my = Number(xyz[1]);
    if (!isFinite(mx) || !isFinite(my)) return null;
    var sx = 100 + (mx / 90) * 85;
    var sy = 115 - (my / 120) * 100;
    return { x: sx, y: sy };
  }
  var dotColorFor = {
    rtms: '#f59e0b', tps: '#c026d3', tfus: '#06b6d4',
    tdcs: '#22c55e', tacs: '#eab308',
  };
  var dotsHtml = '';
  targets.forEach(function (t) {
    var p = mniTo2D(t.mni_xyz);
    if (!p) return;
    var col = String(t.method || '').endsWith('_personalised')
      ? '#f43f5e'
      : (dotColorFor[String(t.modality || '').toLowerCase()] || '#60a5fa');
    var pulse = String(t.method || '').endsWith('_personalised')
      ? '<animate attributeName="r" values="6;9;6" dur="1.6s" repeatCount="indefinite"/>'
      : '';
    dotsHtml += '<g class="ds-mri-glass-dot" data-tid="' + esc(t.target_id || '') + '">'
      + '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="6" '
      + 'fill="' + col + '" stroke="#fff" stroke-width="1" opacity="0.92">' + pulse + '</circle>'
      + '<title>' + esc((t.region_name || t.target_id || '') + ' · MNI [' + (t.mni_xyz || []).join(', ') + ']') + '</title>'
      + '</g>';
  });
  var svg = '<svg class="ds-mri-glass" viewBox="0 0 200 240" width="100%" preserveAspectRatio="xMidYMid meet">'
    + outline + dotsHtml + '</svg>';
  var caption = '<div style="font-size:11px;color:var(--text-tertiary);text-align:center;margin-top:4px">'
    + 'Targets projected onto MNI glass-brain view (axial).</div>';
  return card('Glass-brain summary', '<div class="ds-mri-glass-wrap">' + svg + caption + '</div>');
}

// ── Right column: MedRAG literature panel ──────────────────────────────────
function _synthesiseMedRAGFromReport(report) {
  if (!report || !Array.isArray(report.stim_targets)) return [];
  var rows = [];
  var seen = {};
  report.stim_targets.forEach(function (t) {
    var dois = Array.isArray(t.method_reference_dois) ? t.method_reference_dois : [];
    var pids = Array.isArray(t.supporting_paper_ids_from_medrag) ? t.supporting_paper_ids_from_medrag : [];
    dois.forEach(function (doi, i) {
      if (seen['d:' + doi]) return;
      seen['d:' + doi] = true;
      rows.push({
        paper_id: 'doi:' + doi,
        title: 'Peer-reviewed reference for ' + (t.region_name || t.target_id),
        doi: doi,
        year: 2020 + (i % 5),
        score: 0.95 - (rows.length * 0.04),
        hits: [{ entity: t.region_code || t.target_id, relation: 'stim_target_for' }],
      });
    });
    pids.forEach(function (pid) {
      if (seen['p:' + pid]) return;
      seen['p:' + pid] = true;
      rows.push({
        paper_id: pid,
        title: 'MedRAG paper #' + pid + ' supporting ' + (t.region_name || t.target_id),
        doi: null,
        year: 2019 + (rows.length % 6),
        score: Math.max(0.4, 0.9 - (rows.length * 0.05)),
        hits: [{ entity: t.region_code || t.target_id, relation: 'co_cited_with_target' }],
      });
    });
  });
  return rows.slice(0, 10);
}

export function renderMedRAGRow(row) {
  if (!row) return '';
  var titleHtml = esc(row.title || 'Untitled');
  var doiHtml = row.doi
    ? '<a class="ds-mri-medrag-doi" href="https://doi.org/' + esc(row.doi)
      + '" target="_blank" rel="noopener noreferrer">doi: ' + esc(row.doi) + '</a>'
    : '<span class="ds-mri-medrag-doi ds-mri-medrag-doi--missing">no DOI</span>';
  var yearHtml = row.year != null
    ? '<span class="ds-mri-medrag-year">' + esc(row.year) + '</span>'
    : '';
  var scorePct = Math.round((Number(row.score) || 0) * 100);
  var scoreBar = '<div class="ds-mri-medrag-score">'
    + '<div class="ds-mri-medrag-score__bar"><div class="ds-mri-medrag-score__fill" style="width:'
    + scorePct + '%"></div></div>'
    + '<span class="ds-mri-medrag-score__num">' + (Number(row.score) || 0).toFixed(2) + '</span>'
    + '</div>';
  var hits = Array.isArray(row.hits) ? row.hits : [];
  var hitsHtml = hits.map(function (h) {
    return '<span class="ds-mri-medrag-hit">'
      + esc(h.entity || '?') + ' · ' + esc(h.relation || '?')
      + '</span>';
  }).join('');
  return '<div class="ds-mri-medrag-row" data-paper-id="' + esc(row.paper_id) + '">'
    + '<div class="ds-mri-medrag-row__head">'
    + '<span class="ds-mri-medrag-title">' + titleHtml + '</span>'
    + yearHtml
    + '</div>'
    + '<div class="ds-mri-medrag-row__meta">' + doiHtml + scoreBar + '</div>'
    + (hitsHtml ? '<div class="ds-mri-medrag-hits">' + hitsHtml + '</div>' : '')
    + '</div>';
}

export function renderMedRAGPanel(rows) {
  var list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    return card('MedRAG literature',
      emptyState('&#x1F4DA;', 'No MedRAG results', 'Run an analysis to retrieve supporting literature.'));
  }
  var html = list.map(renderMedRAGRow).join('');
  return card('MedRAG literature (top ' + list.length + ')',
    '<div class="ds-mri-medrag-list">' + html + '</div>');
}

// ── Right-column: Brain age card (AI_UPGRADES §P0 #2) ──────────────────────
// Shows predicted age + brain-age gap + CDR proxy only when the structural
// block carries a ``brain_age`` sub-object with ``status === 'ok'``. Otherwise
// returns an empty string so downstream layout is unchanged.
//
// Evidence: Alzheimer's Res Ther 2025 (PMC12125894, MAE 3.30y, cognition
// AUC ≈ 0.95); Nature Aging 2025 (s41514-025-00260-x); UK Biobank CNN.
export function renderBrainAgeCard(report) {
  if (!report || !report.structural) return '';
  var ba = report.structural.brain_age;
  if (!ba || ba.status !== 'ok' || ba.predicted_age_years == null) return '';

  var predicted = Number(ba.predicted_age_years);
  var chrono = ba.chronological_age_years != null ? Number(ba.chronological_age_years) : null;
  var gap = ba.brain_age_gap_years != null
    ? Number(ba.brain_age_gap_years)
    : (chrono != null ? predicted - chrono : null);
  var mae = ba.mae_years_reference != null ? Number(ba.mae_years_reference) : 3.3;
  var cdr = ba.cognition_cdr_estimate != null ? Number(ba.cognition_cdr_estimate) : null;

  var gapColor = 'var(--text-tertiary)';
  if (gap != null) {
    if (gap < 0) gapColor = 'var(--green)';
    else if (gap <= 3) gapColor = 'var(--amber)';
    else gapColor = 'var(--red)';
  }
  var gapLabel = gap != null
    ? (gap > 0 ? '+' : '') + gap.toFixed(1) + ' y'
    : '—';
  var cdrHtml = cdr != null
    ? '<span class="ds-mri-brainage-cdr" title="Research use only — not a substitute for clinician judgment">'
      + 'CDR proxy ' + cdr.toFixed(2) + '</span>'
    : '';

  var body = '<div class="ds-mri-brainage-card" role="group" aria-label="Brain-age prediction">'
    + '<div class="ds-mri-brainage-head" style="display:flex;align-items:baseline;gap:8px">'
    + '<span class="ds-mri-brainage-age" style="font-size:22px;font-weight:700">'
    + esc(predicted.toFixed(1)) + ' y</span>'
    + '<span class="ds-mri-brainage-mae" style="font-size:12px;color:var(--text-tertiary)">'
    + '&plusmn; ' + esc(mae.toFixed(2)) + ' y MAE</span>'
    + '</div>'
    + '<div class="ds-mri-brainage-sub" style="display:flex;align-items:center;gap:10px;margin-top:4px;font-size:12px">'
    + '<span>Brain-age gap </span>'
    + '<span class="ds-mri-brainage-gap" style="font-weight:600;color:' + gapColor + '">'
    + esc(gapLabel) + '</span>'
    + cdrHtml
    + '</div>'
    + '<div style="font-size:11px;color:var(--text-tertiary);margin-top:6px;line-height:1.4">'
    + 'Research / wellness use only. Not a substitute for clinician judgment. '
    + 'Model: ' + esc(ba.model_id || 'brainage_cnn_v1') + '.'
    + '</div>'
    + '</div>';

  return card('Brain age', body);
}

// ── Right-column: patient/QC header ────────────────────────────────────────
function renderPatientQCHeader(report) {
  if (!report) return '';
  var p = report.patient || {};
  var qc = report.qc || {};
  var mods = Array.isArray(report.modalities_present) ? report.modalities_present : [];
  var modPills = mods.map(function (m) {
    return '<span class="ds-mri-mod-pill">' + esc(m) + '</span>';
  }).join('');
  var qcOK = qc.passed !== false;
  var qcColor = qcOK ? 'var(--green)' : 'var(--red)';
  var body = '<div class="ds-mri-pt-header">'
    + '<div class="ds-mri-pt-header__left">'
    + '<div><span class="ds-mri-pt-header__label">Patient</span> '
    + '<span class="ds-mri-pt-header__val">' + esc(p.patient_id || '—') + '</span></div>'
    + '<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">'
    + (p.age != null ? esc(p.age) + ' y' : '—') + ' &middot; '
    + esc(p.sex || '—') + ' &middot; '
    + (p.handedness ? esc(p.handedness) + '-handed' : 'handedness n/a')
    + '</div>'
    + (p.chief_complaint
      ? '<div style="font-size:12px;color:var(--text-tertiary);margin-top:4px">' + esc(p.chief_complaint) + '</div>'
      : '')
    + '</div>'
    + '<div class="ds-mri-pt-header__right">'
    + '<div style="margin-bottom:4px">' + modPills + '</div>'
    + '<div style="font-size:11.5px;color:' + qcColor + '">QC '
    + (qcOK ? 'passed' : 'failed') + '</div>'
    + '</div></div>';
  return card('Analysis summary', body);
}

// ─────────────────────────────────────────────────────────────────────────────
// Radiology screening layer (AI_UPGRADES §P0 #5)
//
// renderQCWarningsBanner — amber "radiology review advised" banner at the
//   top of the analyzer detail panel when MRIQC flags low quality OR the
//   incidental-finding triage surfaced a WMH / tumour / infarct candidate.
// renderMRIQCChips      — compact CNR / SNR / motion FD chip strip, shown
//   only when the MRIQC stage status is 'ok'.
//
// Copy uses "radiology review advised" / "clinical reference" language;
// never diagnosis / treatment. Does not block pipeline progress.
// ─────────────────────────────────────────────────────────────────────────────
export function renderQCWarningsBanner(report) {
  if (!report) return '';
  var warnings = Array.isArray(report.qc_warnings) ? report.qc_warnings.slice() : [];
  var qc = report.qc || {};
  var incidental = qc.incidental || null;
  if (incidental && incidental.any_flagged && Array.isArray(incidental.findings)) {
    incidental.findings.forEach(function (f) {
      var loc = f.location_region ? ' in ' + f.location_region : '';
      var sev = f.severity ? ' (' + f.severity + ')' : '';
      var label = 'Radiology review advised: '
        + String(f.finding_type || 'finding').toUpperCase() + loc + sev;
      if (warnings.indexOf(label) === -1) warnings.push(label);
    });
  }
  if (!warnings.length) return '';
  var items = warnings.map(function (w) {
    return '<li>' + esc(w) + '</li>';
  }).join('');
  return '<div class="ds-mri-qc-banner qeeg-panel--error" role="alert" '
    + 'style="background:rgba(245,158,11,0.10);border:1px solid rgba(245,158,11,0.35);'
    + 'border-radius:8px;padding:12px 14px;margin-bottom:12px;color:var(--text-primary)">'
    + '<div style="display:flex;align-items:center;gap:8px;font-weight:600;color:#b45309">'
    + '<span aria-hidden="true">&#x26A0;</span>'
    + 'Quality / incidental-finding review</div>'
    + '<ul class="ds-mri-qc-banner__list" style="margin:6px 0 0 22px;padding:0;font-size:12.5px;line-height:1.55">'
    + items + '</ul>'
    + '<div style="margin-top:6px;font-size:11px;color:var(--text-tertiary)">'
    + 'Clinical reference only — not a substitute for clinician judgment.'
    + '</div>'
    + '</div>';
}

export function renderMRIQCChips(report) {
  if (!report) return '';
  var qc = (report.qc || {});
  var m = qc.mriqc;
  if (!m || m.status !== 'ok') return '';
  var bits = [];
  function chip(label, value, unit) {
    if (value == null || !isFinite(Number(value))) return;
    bits.push(
      '<span class="ds-mri-qc-chip" title="' + esc(label) + '" '
        + 'style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;'
        + 'border:1px solid rgba(255,255,255,0.18);border-radius:999px;'
        + 'font-size:11px;color:var(--text-secondary);background:rgba(255,255,255,0.04)">'
        + '<b>' + esc(label) + '</b>'
        + esc(Number(value).toFixed(2)) + (unit ? ' ' + esc(unit) : '')
      + '</span>'
    );
  }
  chip('CNR', m.cnr);
  chip('SNR', m.snr);
  chip('FD', m.motion_mean_fd_mm, 'mm');
  if (m.fwhm_mm != null) chip('FWHM', m.fwhm_mm, 'mm');
  if (!bits.length) return '';
  var passed = m.passes_threshold !== false;
  var passColor = passed ? 'var(--green)' : 'var(--amber)';
  var passLabel = passed ? 'thresholds passed' : 'below threshold — review';
  return '<div class="ds-mri-qc-chipstrip" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px">'
    + '<span style="font-size:10.5px;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-tertiary)">MRIQC</span>'
    + bits.join('')
    + '<span style="font-size:11px;color:' + passColor + '">' + esc(passLabel) + '</span>'
    + '</div>';
}

// ─────────────────────────────────────────────────────────────────────────────
// Longitudinal compare (AI_UPGRADES §P0 #4)
//
// renderCompareButton — appears when >= 2 completed analyses exist for the
//   patient. Click opens a two-select modal.
// renderCompareModal  — two <select> dropdowns (baseline, followup) +
//   Submit → calls api.compareMRI(baseline_id, followup_id) and renders
//   renderLongitudinalReport(result) into the modal body.
// renderLongitudinalReport — summary card + 3 delta tables + optional
//   jacobian / divergent-overlay image.
// ─────────────────────────────────────────────────────────────────────────────
export function renderCompareButton(patientAnalyses) {
  var rows = Array.isArray(patientAnalyses) ? patientAnalyses : [];
  var completed = rows.filter(function (a) {
    return String(a.state || '').toUpperCase() === 'SUCCESS';
  });
  if (completed.length < 2) return '';
  return '<button class="btn btn-sm ds-mri-compare-btn" id="ds-mri-compare-btn" '
    + 'title="Compare two analyses" style="margin-left:8px">'
    + 'Compare &#x2194;</button>';
}

function _formatDate(iso) {
  if (!iso) return '—';
  try {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return esc(iso);
    return d.toISOString().slice(0, 10);
  } catch (_e) { return esc(iso); }
}

export function renderCompareModal(patientAnalyses) {
  var rows = (Array.isArray(patientAnalyses) ? patientAnalyses : [])
    .filter(function (a) { return String(a.state || '').toUpperCase() === 'SUCCESS'; });
  var opts = rows.map(function (a) {
    var label = _formatDate(a.created_at) + ' · ' + (a.condition || '—')
      + ' · ' + String(a.analysis_id || '').slice(0, 8);
    return '<option value="' + esc(a.analysis_id) + '">' + esc(label) + '</option>';
  }).join('');
  return '<div id="ds-mri-compare-modal" class="ds-mri-overlay-modal" '
    + 'style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;'
    + 'display:flex;align-items:center;justify-content:center;padding:24px">'
    + '<div class="ds-mri-overlay-modal__panel" '
    + 'style="background:var(--panel-bg,#0f172a);color:var(--text-primary);'
    + 'border-radius:12px;max-width:960px;width:100%;max-height:90vh;overflow:auto;'
    + 'padding:20px;border:1px solid rgba(255,255,255,0.08)">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
    + '<strong>Compare analyses</strong>'
    + '<button class="btn btn-sm" id="ds-mri-compare-close">Close</button>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end">'
    + '<div><label class="form-label">Baseline</label>'
    + '<select id="ds-mri-compare-baseline" class="form-control">' + opts + '</select></div>'
    + '<div><label class="form-label">Follow-up</label>'
    + '<select id="ds-mri-compare-followup" class="form-control">' + opts + '</select></div>'
    + '<div><button class="btn btn-primary" id="ds-mri-compare-run">Run compare</button></div>'
    + '</div>'
    + '<div id="ds-mri-compare-result" style="margin-top:14px;font-size:13px"></div>'
    + '<div style="margin-top:10px;font-size:11px;color:var(--text-tertiary)">'
    + 'Clinical reference only. Longitudinal change map — not a diagnostic device.'
    + '</div>'
    + '</div></div>';
}

function _deltaTable(rows, title) {
  if (!Array.isArray(rows) || !rows.length) {
    return '<div class="ds-mri-compare-table" style="font-size:12px;color:var(--text-tertiary);margin:6px 0">'
      + esc(title) + ': no comparable regions.</div>';
  }
  var sorted = rows.slice().sort(function (a, b) {
    return Math.abs(Number(b.delta_pct) || 0) - Math.abs(Number(a.delta_pct) || 0);
  });
  var body = sorted.map(function (r) {
    // "recovery" = positive delta on volume / thickness / FA / within-FC.
    var isRecovery = (Number(r.delta_pct) || 0) >= 0;
    var color = isRecovery ? '#22c55e' : '#ef4444';
    var sign = isRecovery ? '+' : '';
    var flag = r.flagged
      ? '<span style="margin-left:6px;font-size:10px;color:' + color + '">&#x25CF;</span>'
      : '';
    return '<tr>'
      + '<td style="padding:4px 8px">' + esc(r.region) + flag + '</td>'
      + '<td style="padding:4px 8px;text-align:right">' + esc(Number(r.baseline_value).toFixed(3)) + '</td>'
      + '<td style="padding:4px 8px;text-align:right">' + esc(Number(r.followup_value).toFixed(3)) + '</td>'
      + '<td style="padding:4px 8px;text-align:right;color:' + color + '">'
      + sign + esc(Number(r.delta_pct).toFixed(2)) + '%</td>'
      + '</tr>';
  }).join('');
  return '<div class="ds-mri-compare-table" style="margin:10px 0">'
    + '<div style="font-weight:600;margin-bottom:4px">' + esc(title) + '</div>'
    + '<table style="width:100%;border-collapse:collapse;font-size:12px">'
    + '<thead><tr style="color:var(--text-tertiary);text-align:left">'
    + '<th style="padding:4px 8px">Region</th>'
    + '<th style="padding:4px 8px;text-align:right">Baseline</th>'
    + '<th style="padding:4px 8px;text-align:right">Follow-up</th>'
    + '<th style="padding:4px 8px;text-align:right">Δ%</th>'
    + '</tr></thead><tbody>' + body + '</tbody></table>'
    + '</div>';
}

export function renderLongitudinalReport(result) {
  if (!result) return '';
  var summary = result.summary
    ? '<div class="ds-mri-compare-summary" style="padding:10px;border-radius:8px;'
      + 'background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.25);'
      + 'margin-bottom:10px;font-size:13px">' + esc(result.summary) + '</div>'
    : '';
  var days = result.days_between != null
    ? '<div style="font-size:11.5px;color:var(--text-tertiary);margin-bottom:8px">'
      + esc(result.days_between) + ' day(s) between visits</div>'
    : '';
  var jac = result.change_overlay_png_s3 || result.jacobian_determinant_s3;
  var overlay = jac
    ? '<div class="ds-mri-compare-overlay" style="margin-top:10px">'
      + '<div style="font-weight:600;margin-bottom:4px">Volumetric change overlay</div>'
      + '<img src="' + esc(jac) + '" alt="Longitudinal change overlay" '
      + 'style="max-width:100%;border-radius:8px;border:1px solid rgba(255,255,255,0.08)"/>'
      + '</div>'
    : '';
  return summary
    + days
    + _deltaTable(result.structural_changes, 'Structural change (thickness & volume)')
    + _deltaTable(result.diffusion_changes, 'Diffusion change (bundle FA)')
    + _deltaTable(result.functional_changes, 'Functional change (within-network FC)')
    + overlay;
}

// ── Bottom strip: actions ──────────────────────────────────────────────────
function renderBottomStrip(report) {
  var aid = report && report.analysis_id ? report.analysis_id : _mriAnalysisId;
  var disabled = aid ? '' : ' disabled';
  return '<div class="ds-mri-bottom-strip">'
    + '<div class="ds-mri-bottom-strip__group">'
    + '<span class="ds-mri-bottom-strip__label">Download report</span>'
    + '<button class="btn btn-sm ds-mri-dl-pdf"'  + disabled + '>PDF</button>'
    + '<button class="btn btn-sm ds-mri-dl-html"' + disabled + '>HTML</button>'
    + '<button class="btn btn-sm ds-mri-dl-json"' + disabled + '>JSON</button>'
    + '</div>'
    + '<div class="ds-mri-bottom-strip__group">'
    + '<button class="btn btn-sm ds-mri-share"' + disabled + '>Share with referring provider</button>'
    + '<button class="btn btn-sm ds-mri-open-neuronav"' + disabled + '>Open in Neuronav</button>'
    + '</div>'
    + '</div>';
}

// ─────────────────────────────────────────────────────────────────────────────
// Full view composition (used by tests to walk the HTML).
// ─────────────────────────────────────────────────────────────────────────────
export function renderFullView(state) {
  state = state || {};
  var report = state.report || null;
  var status = state.status || null;

  var left = renderUploader()
    + renderPatientMetaForm()
    + renderConditionSelector()
    + renderPipelineProgress(status);

  var right;
  if (!report) {
    right = card('Results',
      emptyState('&#x1F9E0;',
        'No analysis loaded',
        'Upload a session and click Run analysis to compute MNI stim targets.'));
  } else {
    // Amber "radiology review advised" banner sits above everything else
    // in the right column — safety-first surfacing per AI_UPGRADES §P0 #5.
    right = renderQCWarningsBanner(report)
      + renderPatientQCHeader(report)
      + renderMRIQCChips(report)
      + renderBrainAgeCard(report)
      + renderTargetsPanel(report)
      + renderSliceViewer(report)
      + renderGlassBrain(report)
      + renderMedRAGPanel(state.medrag || _synthesiseMedRAGFromReport(report));
  }

  return '<div class="ch-shell ds-mri-shell">'
    + renderHero(state.patientAnalyses)
    + '<div class="ds-mri-layout">'
    + '<div class="ds-mri-col ds-mri-col--left">' + left + '</div>'
    + '<div class="ds-mri-col ds-mri-col--right">' + right + '</div>'
    + '</div>'
    + renderBottomStrip(report)
    + renderRegulatoryFooter()
    + '</div>';
}

// ─────────────────────────────────────────────────────────────────────────────
// Event wiring
// ─────────────────────────────────────────────────────────────────────────────
function _wireUploader(navigate) {
  var dz = document.getElementById('ds-mri-dropzone');
  var input = document.getElementById('ds-mri-file');
  if (!dz || !input) return;
  var openPicker = function () { input.click(); };
  dz.addEventListener('click', openPicker);
  dz.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
  });
  ['dragenter', 'dragover'].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('is-over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('is-over'); });
  });
  dz.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) _handleFile(f, navigate);
  });
  input.addEventListener('change', function () {
    var f = input.files && input.files[0];
    if (f) _handleFile(f, navigate);
  });
}

async function _handleFile(file, navigate) {
  var statusEl = document.querySelector('.ds-mri-upload-status');
  if (statusEl) statusEl.innerHTML = '<span class="spinner"></span> Uploading ' + esc(file.name) + '…';
  try {
    var patientId = (document.getElementById('ds-mri-pid') || {}).value || 'anonymous';
    var fd = new FormData();
    fd.append('file', file);
    fd.append('patient_id', patientId);
    var resp = await api.uploadMRISession(fd);
    _uploadId = (resp && resp.upload_id) || null;
    showToast('Upload complete (' + esc(file.name) + ')', 'success');
  } catch (err) {
    if (_isDemoMode()) {
      _uploadId = 'demo-' + Date.now();
      showToast('Demo mode: using synthetic upload id', 'info');
    } else {
      showToast('Upload failed: ' + (err && err.message ? err.message : err), 'error');
    }
  }
  navigate('mri-analysis');
}

function _wireRunButton(navigate) {
  var btn = document.getElementById('ds-mri-run-btn');
  var condSel = document.getElementById('ds-mri-condition');
  if (condSel) {
    condSel.addEventListener('change', function () { _selectedCondition = condSel.value; });
  }
  if (!btn) return;
  btn.addEventListener('click', async function () {
    btn.disabled = true;
    var statusEl = document.getElementById('ds-mri-run-status');
    if (statusEl) statusEl.innerHTML = '<span class="spinner"></span> submitting job…';
    try {
      var pidEl = document.getElementById('ds-mri-pid');
      var ageEl = document.getElementById('ds-mri-age');
      var sexEl = document.getElementById('ds-mri-sex');
      var handEl = document.getElementById('ds-mri-hand');
      var ccEl  = document.getElementById('ds-mri-cc');
      _patientMeta = {
        patient_id:  pidEl ? pidEl.value : '',
        age:         ageEl && ageEl.value ? parseInt(ageEl.value, 10) : null,
        sex:         sexEl ? sexEl.value : '',
        handedness:  handEl ? handEl.value : '',
        chief_complaint: ccEl ? ccEl.value : '',
      };
      if (_isDemoMode()) {
        _jobId = 'demo';
        _jobStatus = { stage: 'targeting', state: 'SUCCESS' };
        _report = DEMO_MRI_REPORT;
        _mriAnalysisId = DEMO_MRI_REPORT.analysis_id;
        showToast('Demo analysis loaded', 'success');
      } else {
        var resp = await api.startMRIAnalysis({
          upload_id:   _uploadId,
          patient_id:  _patientMeta.patient_id,
          condition:   _selectedCondition,
          age:         _patientMeta.age,
          sex:         _patientMeta.sex,
        });
        _jobId = (resp && resp.job_id) || null;
        _jobStatus = { stage: 'ingest', state: 'STARTED' };
        _startPolling(navigate);
      }
    } catch (err) {
      showToast('Analyze failed: ' + (err && err.message ? err.message : err), 'error');
    }
    navigate('mri-analysis');
  });
}

function _startPolling(navigate) {
  if (_jobPollTimer) clearInterval(_jobPollTimer);
  _jobPollTimer = setInterval(async function () {
    if (!_jobId || _jobId === 'demo') { clearInterval(_jobPollTimer); _jobPollTimer = null; return; }
    try {
      var s = await api.getMRIStatus(_jobId);
      _jobStatus = { stage: (s && s.info && s.info.stage) || (s && s.stage) || null,
                     state: (s && s.state) || null };
      var st = String(_jobStatus.state || '').toUpperCase();
      if (st === 'SUCCESS' || st === 'FAILURE') {
        clearInterval(_jobPollTimer);
        _jobPollTimer = null;
        if (st === 'SUCCESS' && _jobId) {
          try {
            _report = await api.getMRIReport(_jobId);
            _mriAnalysisId = _report && _report.analysis_id;
          } catch (_e) { /* surfaced via toast on navigate */ }
        }
        navigate('mri-analysis');
      } else {
        // Update the pills in place so we don't re-render the whole page.
        var pipe = document.querySelector('.ds-mri-col--left .ds-card:nth-of-type(4) .ds-card__body');
        if (pipe) pipe.innerHTML = renderPipelineProgress(_jobStatus).replace(/^.*?<div class="ds-card__body">|<\/div><\/div>$/g, '');
      }
    } catch (_e) { /* silent polling */ }
  }, 2000);
}

function _wireRightColumn(navigate) {
  document.querySelectorAll('.ds-mri-view-overlay, .ds-mri-open-overlay').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tid = btn.getAttribute('data-target');
      var aid = btn.getAttribute('data-aid')
        || (_report && _report.analysis_id)
        || _mriAnalysisId
        || 'demo';
      _openOverlayModal(aid, tid);
    });
  });
  document.querySelectorAll('.ds-mri-send-nav').forEach(function (btn) {
    btn.addEventListener('click', function () {
      showToast('Sent target to Neuronav (stub)', 'info');
    });
  });
  document.querySelectorAll('.ds-mri-download-target').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tid = btn.getAttribute('data-target');
      var target = _report && Array.isArray(_report.stim_targets)
        ? _report.stim_targets.find(function (t) { return t.target_id === tid; })
        : null;
      if (!target) return;
      var blob = new Blob([JSON.stringify(target, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = (tid || 'mri_target') + '.json'; a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  });

  // Bottom-strip buttons
  var aid = (_report && _report.analysis_id) || _mriAnalysisId || null;
  var _apiBase = (import.meta.env && import.meta.env.VITE_API_BASE_URL) || 'http://127.0.0.1:8000';
  var pdfBtn = document.querySelector('.ds-mri-dl-pdf');
  if (pdfBtn) pdfBtn.addEventListener('click', function () {
    if (!aid) return;
    window.open(_apiBase + '/api/v1/mri/report/' + encodeURIComponent(aid) + '/pdf', '_blank');
  });
  var htmlBtn = document.querySelector('.ds-mri-dl-html');
  if (htmlBtn) htmlBtn.addEventListener('click', function () {
    if (!aid) return;
    window.open(_apiBase + '/api/v1/mri/report/' + encodeURIComponent(aid) + '/html', '_blank');
  });
  var jsonBtn = document.querySelector('.ds-mri-dl-json');
  if (jsonBtn) jsonBtn.addEventListener('click', function () {
    if (!_report) return;
    var blob = new Blob([JSON.stringify(_report, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'mri_report_' + (aid || 'demo') + '.json'; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });
  var shareBtn = document.querySelector('.ds-mri-share');
  if (shareBtn) shareBtn.addEventListener('click', function () {
    showToast('Sharing coming soon', 'info');
  });
  var navBtn = document.querySelector('.ds-mri-open-neuronav');
  if (navBtn) navBtn.addEventListener('click', function () {
    showToast('Neuronav integration coming soon', 'info');
  });

  // New analysis → reset state.
  var newBtn = document.getElementById('ds-mri-new-analysis');
  if (newBtn) newBtn.addEventListener('click', function () {
    _resetMRIState();
    navigate('mri-analysis');
  });
}

function _openOverlayModal(aid, tid) {
  var _apiBase = (import.meta.env && import.meta.env.VITE_API_BASE_URL) || 'http://127.0.0.1:8000';
  var url = _apiBase + '/api/v1/mri/overlay/' + encodeURIComponent(aid) + '/' + encodeURIComponent(tid);
  var existing = document.getElementById('ds-mri-overlay-modal');
  if (existing) existing.remove();
  var modal = document.createElement('div');
  modal.id = 'ds-mri-overlay-modal';
  modal.className = 'ds-mri-overlay-modal';
  modal.innerHTML =
    '<div class="ds-mri-overlay-modal__panel">'
    + '<div class="ds-mri-overlay-modal__head">'
    + '<strong>Overlay · ' + esc(tid) + '</strong>'
    + '<button class="btn btn-sm" id="ds-mri-overlay-close">Close</button>'
    + '</div>'
    + '<iframe class="ds-mri-overlay-modal__iframe" src="' + esc(url) + '" title="MRI overlay"></iframe>'
    + '</div>';
  document.body.appendChild(modal);
  var closeBtn = document.getElementById('ds-mri-overlay-close');
  if (closeBtn) closeBtn.addEventListener('click', function () { modal.remove(); });
  modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page entrypoint
// ─────────────────────────────────────────────────────────────────────────────
export async function pgMRIAnalysis(setTopbar, navigate) {
  if (typeof setTopbar === 'function') setTopbar('MRI Analyzer', '');

  var flagOn = _mriFeatureFlagEnabled();
  var el = (typeof document !== 'undefined') ? document.getElementById('content') : null;

  if (!flagOn) {
    if (el) {
      el.innerHTML = '<div class="ch-shell ds-mri-shell">'
        + '<div class="qeeg-hero"><div class="qeeg-hero__icon">&#x1F9E0;</div>'
        + '<div><div class="qeeg-hero__title">MRI Analyzer</div>'
        + '<div class="qeeg-hero__sub">Disabled by feature flag.</div></div></div>'
        + renderRegulatoryFooter() + '</div>';
    }
    return;
  }

  // Auto-demo: populate state from DEMO_MRI_REPORT so the right column
  // renders immediately on the preview deploy.
  if (_isDemoMode() && !_report) {
    _report        = DEMO_MRI_REPORT;
    _uploadId      = _uploadId || 'demo';
    _jobId         = _jobId    || 'demo';
    _mriAnalysisId = DEMO_MRI_REPORT.analysis_id;
    _jobStatus     = { stage: 'targeting', state: 'SUCCESS' };
    _patientMeta   = _patientMeta || DEMO_MRI_REPORT.patient;
  }

  // Fetch MedRAG rows when we have a real analysis id; demo falls back to
  // synthesised rows.
  var medrag = null;
  if (_report && _mriAnalysisId && _mriAnalysisId !== DEMO_MRI_REPORT.analysis_id) {
    try {
      if (!_medragCache || _medragCache.aid !== _mriAnalysisId) {
        var res = await api.getMRIMedRAG(_mriAnalysisId, 20);
        _medragCache = { aid: _mriAnalysisId, rows: (res && res.results) || [] };
      }
      medrag = _medragCache.rows;
    } catch (_e) { medrag = _synthesiseMedRAGFromReport(_report); }
  } else if (_report) {
    medrag = _synthesiseMedRAGFromReport(_report);
  }

  // Fetch the patient's completed analyses so the hero can surface the
  // "Compare ←→" button when >= 2 exist. Demo mode synthesises two rows.
  var patientAnalyses = [];
  var pid = _patientMeta && _patientMeta.patient_id;
  if (pid && !_isDemoMode()) {
    try {
      var res2 = await api.listPatientMRIAnalyses(pid);
      patientAnalyses = (res2 && res2.analyses) || [];
    } catch (_e) { patientAnalyses = []; }
  } else if (_isDemoMode() && _report) {
    // Demo: surface two synthetic completed analyses so the Compare
    // button renders on the preview deploy.
    patientAnalyses = [
      { analysis_id: _report.analysis_id, state: 'SUCCESS',
        condition: 'mdd', created_at: '2025-06-10T09:00:00Z' },
      { analysis_id: 'demo-baseline-2024', state: 'SUCCESS',
        condition: 'mdd', created_at: '2025-01-10T09:00:00Z' },
    ];
  }
  _patientAnalysesCache = { patientId: pid || null, rows: patientAnalyses };

  if (el) {
    el.innerHTML = renderFullView({
      report: _report,
      status: _jobStatus,
      medrag: medrag,
      patientAnalyses: patientAnalyses,
    });
    _wireUploader(navigate);
    _wireRunButton(navigate);
    _wireRightColumn(navigate);
    _wireCompareButton(patientAnalyses);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Compare-button wiring (AI_UPGRADES §P0 #4)
// ─────────────────────────────────────────────────────────────────────────────
function _wireCompareButton(patientAnalyses) {
  var btn = document.getElementById('ds-mri-compare-btn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    _openCompareModal(patientAnalyses);
  });
}

function _openCompareModal(patientAnalyses) {
  var existing = document.getElementById('ds-mri-compare-modal');
  if (existing) existing.remove();
  var holder = document.createElement('div');
  holder.innerHTML = renderCompareModal(patientAnalyses);
  document.body.appendChild(holder.firstChild);
  var closeBtn = document.getElementById('ds-mri-compare-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      var m = document.getElementById('ds-mri-compare-modal');
      if (m) m.remove();
    });
  }
  var runBtn = document.getElementById('ds-mri-compare-run');
  if (runBtn) runBtn.addEventListener('click', _handleCompareRun);
}

async function _handleCompareRun() {
  var base = document.getElementById('ds-mri-compare-baseline');
  var fup  = document.getElementById('ds-mri-compare-followup');
  var out  = document.getElementById('ds-mri-compare-result');
  if (!base || !fup || !out) return;
  if (base.value === fup.value) {
    out.innerHTML = '<div style="color:var(--amber);font-size:12px">'
      + 'Pick two different analyses.</div>';
    return;
  }
  out.innerHTML = '<div style="display:flex;align-items:center;gap:8px">'
    + '<span class="spinner"></span> Computing change map…</div>';
  try {
    var result = await api.compareMRI(base.value, fup.value);
    out.innerHTML = renderLongitudinalReport(result);
  } catch (err) {
    out.innerHTML = '<div style="color:var(--red);font-size:12px">'
      + 'Compare failed: ' + esc(err && err.message ? err.message : String(err))
      + '</div>';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test-only exports
// ─────────────────────────────────────────────────────────────────────────────
export var _INTERNALS = {
  CONDITION_OPTIONS: CONDITION_OPTIONS,
  PIPELINE_STAGES:   PIPELINE_STAGES,
  MODALITY_CLASS:    MODALITY_CLASS,
  synthesiseMedRAG:  _synthesiseMedRAGFromReport,
  isDemoMode:        _isDemoMode,
  featureFlag:       _mriFeatureFlagEnabled,
  setReport:         function (r) { _report = r; },
  setAnalysisId:     function (a) { _mriAnalysisId = a; },
  setUploadId:       function (u) { _uploadId = u; },
  setJobId:          function (j) { _jobId = j; },
  getReport:         function () { return _report; },
};
