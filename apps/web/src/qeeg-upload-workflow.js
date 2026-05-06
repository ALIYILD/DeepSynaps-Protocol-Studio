// ─────────────────────────────────────────────────────────────────────────────
// qeeg-upload-workflow.js — 6-step unified Upload workflow for QEEG Analyzer
//
// Replaces the legacy Patient & Upload tab content with a guided flow:
//   Step 1: Patient Search & Select
//   Step 2: Pre-QEEG Scan Intake Form
//   Step 3: EDF/EEG File Upload
//   Step 4: Reports Panel (scan history)
//   Step 5: Analysis Pipeline Timeline
//   Step 6: Inline PDF Viewer
//
// Exports:
//   renderUploadWorkflow(state) → HTML string
//   mountUploadWorkflow(container) → wires event delegation
//   resetUploadWorkflow() → clears all state
// ─────────────────────────────────────────────────────────────────────────────

import { api, downloadBlob } from './api.js';
import { emptyState, showToast } from './helpers.js';

// ── XSS escape ────────────────────────────────────────────────────────────────
function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Demo mode detection ───────────────────────────────────────────────────────
function _isDemoMode() {
  try { return !!(import.meta.env && (import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1')); }
  catch (_e) { return false; }
}
function _isDemoPatientId(id) { return id && String(id).startsWith('demo-'); }

// ── Constants ─────────────────────────────────────────────────────────────────
const STEP_LABELS = ['Patient', 'Intake', 'Upload', 'Reports', 'Pipeline', 'Report PDF'];
const STEP_TOOLTIPS = [
  'Select or create a patient record',
  'Complete clinical intake form (optional)',
  'Upload EEG recording files',
  'View past analyses and results',
  'Monitor analysis processing stages',
  'View and print the final qEEG report',
];
const ACCEPTED_EXTENSIONS = ['.edf', '.bdf', '.eeg', '.vhdr', '.vmrk', '.fif', '.set', '.cnt', '.mff'];
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const CONDITIONS = ['Eyes Open', 'Eyes Closed', 'Task', 'Hyperventilation', 'Photic', 'Sleep', 'Custom'];
const CONDITION_TO_BACKEND_ENUM = {
  'Eyes Open': 'awake_eo', 'Eyes Closed': 'awake_ec',
  'Task': 'task', 'Hyperventilation': 'hyperventilation',
  'Photic': 'photic', 'Sleep': 'sleep', 'Custom': 'custom',
};
const INTAKE_SUBTABS = ['demographics', 'symptoms', 'diagnoses', 'medications', 'notes'];
const INTAKE_SUBTAB_LABELS = { demographics: 'Demographics', symptoms: 'Symptoms', diagnoses: 'Diagnoses', medications: 'Medications', notes: 'Notes' };

const PIPELINE_STAGES = [
  { id: 'queued', label: 'Queued' },
  { id: 'preprocessing', label: 'Preprocessing' },
  { id: 'artifact_removal', label: 'Artifact Removal (ICA)' },
  { id: 'spectral', label: 'Spectral Analysis' },
  { id: 'normative', label: 'Normative Comparison' },
  { id: 'report_gen', label: 'Report Generation' },
  { id: 'ready', label: 'Ready' },
];

const SYMPTOM_CATEGORIES = {
  cognitive: ['Brain fog', 'Memory complaints', 'Attention/focus issues', 'Executive dysfunction', 'Slowed processing'],
  mood: ['Depression', 'Anxiety', 'Panic attacks', 'Irritability', 'Anhedonia'],
  sleep: ['Insomnia', 'Hypersomnia', 'Fragmented sleep', 'Nightmares'],
  pain: ['Chronic pain', 'Headaches', 'Migraines'],
  trauma: ['PTSD symptoms', 'Flashbacks', 'Hypervigilance'],
  movement: ['Tremor', 'Dystonia', 'Tics', 'Gait disturbance'],
  sensory: ['Tinnitus', 'Photosensitivity', 'Sound sensitivity'],
  autonomic: ['Dizziness', 'Palpitations', 'Fatigue'],
};

// ── Module State ──────────────────────────────────────────────────────────────
let _uwStep = 1;
let _uwPatientId = null;
let _uwPatient = null;
let _uwPatients = [];
let _uwIntakeDraft = _emptyIntake();
let _uwIntakeLocked = false;
let _uwIntakeSubTab = 'demographics';
let _uwFileQueue = [];       // { file, condition, status, errors[], analysisId }
let _uwAnalyses = [];
let _uwActiveAnalysisId = null;
let _uwPipelineStages = [];
let _uwPdfBlobUrl = null;
let _uwPollTimer = null;
let _uwPollCount = 0; // Total polls for timeout detection
let _uwPollFailures = 0; // Consecutive poll failures
let _uwReportGenerating = false; // Report generation in progress
let _uwSearchTimer = null;
let _uwSearchQuery = '';
let _uwSearchResults = [];
let _uwDragOver = false;
let _uwContainer = null;
let _uwCreateSlideOverOpen = false;
let _uwSaveDraftTimer = null;
let _uwSaveStatus = ''; // '', 'saving', 'saved'
let _uwExpandedLogNodes = new Set(); // Stage IDs with expanded logs
let _uwShowConfirm = false; // Pre-upload confirmation panel
let _uwShowShortcuts = false; // Keyboard shortcuts overlay

function _emptyIntake() {
  return {
    demographics: { sex: '', handedness: '', sleep_hours: '', caffeine: 'no', alertness: 5, stress: 5 },
    symptoms: { chief_complaint: '', checked: [], severities: {} },
    diagnoses: { primary_dx: '', secondary: '', icd10: '', hypothesis: '', family_history: '' },
    medications: [{ name: '', class_name: '', dose: '', frequency: '', last_taken: '' }],
    notes: { referral_reason: '', clinical_question: '', protocol: '', free_text: '' },
  };
}

// ── localStorage helpers ──────────────────────────────────────────────────────
function _lsKey(suffix) { return `qeeg_intake_draft_${_uwPatientId}_${suffix}`; }

function _loadDraft() {
  if (!_uwPatientId) return;
  try {
    const raw = localStorage.getItem(_lsKey('data'));
    if (raw) _uwIntakeDraft = JSON.parse(raw);
    _uwIntakeLocked = localStorage.getItem(_lsKey('locked')) === 'true';
    const savedStep = localStorage.getItem(_lsKey('step'));
    if (savedStep) _uwStep = Math.max(1, Math.min(6, parseInt(savedStep, 10) || 1));
  } catch (_e) { /* degrade gracefully */ }
}

function _saveDraft() {
  if (!_uwPatientId) return;
  try {
    localStorage.setItem(_lsKey('data'), JSON.stringify(_uwIntakeDraft));
    if (_uwIntakeLocked) localStorage.setItem(_lsKey('locked'), 'true');
    localStorage.setItem(_lsKey('step'), String(_uwStep));
  } catch (_e) { /* localStorage full — data stays in memory */ }
}

// ── Utility ───────────────────────────────────────────────────────────────────
function _humanSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function _computeAge(dob) {
  if (!dob) return '';
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return '';
  const diff = Date.now() - birth.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

function _initials(first, last) {
  return ((first || '')[0] || '') + ((last || '')[0] || '');
}

function _validateFile(file) {
  const errors = [];
  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
  if (!ACCEPTED_EXTENSIONS.includes(ext)) errors.push('Unsupported format');
  if (file.size > MAX_FILE_SIZE) errors.push('Exceeds 100 MB');
  if (file.size === 0) errors.push('Empty file');
  return { valid: errors.length === 0, errors };
}

function _conditionToEnum(display) {
  return CONDITION_TO_BACKEND_ENUM[display] || display.toLowerCase().replace(/\s+/g, '_');
}

function _friendlyErrorMessage(err) {
  if (!err) return 'An unexpected error occurred. Please try again.';
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch'))
    return 'Network error — please check your connection and try again.';
  if (msg.includes('401') || msg.includes('unauthorized'))
    return 'Session expired — please log in again.';
  if (msg.includes('403') || msg.includes('forbidden'))
    return 'Access denied — you may not have permission for this action.';
  if (msg.includes('413') || msg.includes('too large'))
    return 'File is too large for the server. Try a smaller file.';
  if (msg.includes('500') || msg.includes('internal server'))
    return 'Server error — our team has been notified. Please try again shortly.';
  if (msg.includes('timeout'))
    return 'Request timed out — please try again.';
  return err.message || 'An unexpected error occurred. Please try again.';
}

function _validateIntakeRequired() {
  const missing = [];
  if (!_uwIntakeDraft.demographics.sex) missing.push('Sex (Demographics)');
  if (!_uwIntakeDraft.symptoms.chief_complaint) missing.push('Chief complaint (Symptoms)');
  if (!_uwIntakeDraft.diagnoses.primary_dx) missing.push('Primary diagnosis (Diagnoses)');
  return { valid: missing.length === 0, missing };
}

function _canGoToStep(n) {
  if (n === 1) return true;
  if (n >= 2 && !_uwPatientId) return false;
  // Intake is optional — doctors can skip directly to upload
  if (n >= 5 && !_uwActiveAnalysisId) return false;
  return true;
}

// ── Re-render helper ──────────────────────────────────────────────────────────
function _rerender() {
  if (!_uwContainer) return;
  const prevStep = _uwContainer.dataset.uwCurrentStep;
  const state = { patientId: _uwPatientId, patient: _uwPatient, patients: _uwPatients, analyses: _uwAnalyses };
  _uwContainer.innerHTML = renderUploadWorkflow(state);
  _uwContainer.dataset.uwCurrentStep = String(_uwStep);
  // Focus management: move focus to step content heading on step change
  if (prevStep && prevStep !== String(_uwStep)) {
    const heading = _uwContainer.querySelector('.qeeg-uw-step' + _uwStep + ' h4');
    if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDERERS
// ══════════════════════════════════════════════════════════════════════════════

// ── Stepper ───────────────────────────────────────────────────────────────────
function _renderStepper() {
  let html = '<nav class="qeeg-uw-stepper" role="tablist" aria-label="Upload workflow steps">';
  STEP_LABELS.forEach((label, i) => {
    const num = i + 1;
    const active = num === _uwStep;
    const done = num < _uwStep;
    const disabled = !_canGoToStep(num);
    let cls = 'qeeg-uw-step';
    if (active) cls += ' qeeg-uw-step--active';
    else if (done) cls += ' qeeg-uw-step--done';
    html += '<button class="' + cls + '" role="tab" aria-selected="' + active + '"'
      + (disabled ? ' disabled' : '')
      + ' data-uw-action="go-step" data-uw-step="' + num + '"'
      + ' title="' + esc(STEP_TOOLTIPS[i]) + '"'
      + ' aria-label="Step ' + num + ' of 6: ' + esc(label) + (done ? ' (completed)' : '') + '">'
      + '<span class="qeeg-uw-step__num">' + (done ? '&#x2713;' : num) + '</span>'
      + '<span class="qeeg-uw-step__label">' + esc(label) + '</span>'
      + (num < 6 ? '<span class="qeeg-uw-step__conn"></span>' : '')
      + '</button>';
  });
  html += '</nav>';
  return html;
}

// ── Step 1: Patient Search & Select ──────────────────────────────────────────
function _renderStep1() {
  let html = '<div class="qeeg-uw-step1">';

  // If patient selected, show side-by-side: patient card + recent scans
  if (_uwPatientId && _uwPatient) {
    const age = _computeAge(_uwPatient.dob);
    const ini = _initials(_uwPatient.first_name, _uwPatient.last_name);

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">';

    // Left: Patient card
    html += '<div>';
    html += '<div class="qeeg-uw-patient-card">'
      + '<div class="qeeg-uw-patient-card__avatar">' + esc(ini.toUpperCase()) + '</div>'
      + '<div class="qeeg-uw-patient-card__info">'
      + '<div class="qeeg-uw-patient-card__name">' + esc(_uwPatient.first_name) + ' ' + esc(_uwPatient.last_name) + '</div>'
      + '<div class="qeeg-uw-patient-card__meta">'
      + (age ? esc(String(age)) + ' y/o' : '') + (age && _uwPatient.gender ? ' &middot; ' : '')
      + esc(_uwPatient.gender || '')
      + (_uwPatient.mrn ? ' &middot; MRN: ' + esc(_uwPatient.mrn) : '')
      + (_uwPatient.primary_condition ? ' &middot; ' + esc(_uwPatient.primary_condition) : '')
      + '</div></div>'
      + '<button class="qeeg-uw-patient-card__change" data-uw-action="clear-patient">Change</button>'
      + '</div>';
    if (_uwPatient.is_demo) {
      html += '<div style="margin-top:8px;padding:6px 10px;border-radius:6px;background:rgba(255,181,71,0.08);border:1px solid rgba(255,181,71,0.2);font-size:11px;color:var(--amber)">'
        + 'Demo patient &mdash; synthetic data for preview purposes only</div>';
    }
    html += '<div style="margin-top:16px;display:flex;gap:8px">'
      + '<button class="btn btn-primary btn-sm" data-uw-action="go-step" data-uw-step="2">Continue to Intake &rarr;</button>'
      + '<button class="btn btn-sm btn-outline" data-uw-action="go-step" data-uw-step="3">Skip to Upload</button>'
      + '</div>';
    html += '</div>';

    // Right: Recent scans mini-panel
    html += '<div>'
      + '<h4 style="font-size:13px;font-weight:600;margin:0 0 10px;color:var(--text-secondary)">Recent Scans</h4>';
    if (_uwAnalyses.length === 0) {
      html += '<div style="padding:20px;text-align:center;border:1px dashed var(--border);border-radius:8px;color:var(--text-tertiary);font-size:12px">'
        + 'No analyses yet</div>';
    } else {
      _uwAnalyses.slice(0, 5).forEach(a => {
        const date = a.created_at || a.analyzed_at ? new Date(a.created_at || a.analyzed_at).toLocaleDateString() : '—';
        const status = (a.status || a.analysis_status || 'unknown').toLowerCase();
        const isReady = status === 'completed' || status === 'ready';
        html += '<div class="qeeg-uw-scan-row" style="padding:8px 10px;margin-bottom:6px">'
          + '<span class="qeeg-uw-scan-row__date" style="min-width:70px;font-size:11px">' + esc(date) + '</span>'
          + '<span style="flex:1;font-size:11px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
          + esc(a.original_filename || a.eyes_condition || '—') + '</span>'
          + '<span class="qeeg-uw-scan-row__status ' + (isReady ? 'qeeg-uw-scan-row__status--ready' : 'qeeg-uw-scan-row__status--processing') + '" style="font-size:10px">'
          + (isReady ? 'Ready' : 'Processing') + '</span>'
          + (isReady ? '<button class="btn btn-sm btn-ghost" style="padding:2px 6px;font-size:10px" data-uw-action="view-report" data-uw-id="' + esc(a.id) + '">View</button>' : '')
          + '</div>';
      });
      if (_uwAnalyses.length > 5) {
        html += '<div style="text-align:center;margin-top:4px">'
          + '<button class="btn btn-sm btn-ghost" data-uw-action="go-step" data-uw-step="4" style="font-size:11px">'
          + 'View all ' + _uwAnalyses.length + ' scans &rarr;</button></div>';
      }
    }
    html += '</div></div>';

  } else {
    // Search box
    html += '<h4 style="font-size:14px;font-weight:600;margin:0 0 12px;color:var(--text-primary)">Select a Patient</h4>';
    html += '<div style="position:relative">'
      + '<input class="qeeg-uw-intake__input" type="text" placeholder="Search by name, ID, or DOB... (press / to focus)"'
      + ' data-uw-action="search-input" id="uw-patient-search" value="' + esc(_uwSearchQuery) + '"'
      + ' aria-label="Search patients" autocomplete="off" />';

    // Results dropdown
    if (_uwSearchQuery.length > 0 && _uwSearchResults.length > 0) {
      html += '<div style="position:absolute;top:100%;left:0;right:0;z-index:100;'
        + 'background:var(--navy-800);border:1px solid var(--border);border-radius:8px;'
        + 'max-height:240px;overflow-y:auto;margin-top:4px;box-shadow:0 8px 24px rgba(0,0,0,0.4)">';
      _uwSearchResults.forEach(p => {
        const age = _computeAge(p.dob);
        html += '<div class="qeeg-uw-scan-row" style="cursor:pointer;margin:4px;border-radius:6px"'
          + ' data-uw-action="select-patient" data-uw-id="' + esc(p.id) + '">'
          + '<span style="font-weight:500;color:var(--text-primary)">' + esc(p.first_name) + ' ' + esc(p.last_name) + '</span>'
          + '<span style="font-size:11px;color:var(--text-tertiary);margin-left:auto">'
          + (age ? age + 'y' : '') + (p.gender ? ' ' + esc(p.gender) : '')
          + (p.primary_condition ? ' &middot; ' + esc(p.primary_condition) : '')
          + '</span>'
          + (p.is_demo ? '<span style="font-size:9px;padding:2px 5px;border-radius:3px;background:rgba(255,181,71,0.15);color:var(--amber);margin-left:6px">DEMO</span>' : '')
          + '</div>';
      });
      html += '</div>';
    } else if (_uwSearchQuery.length > 1 && _uwSearchResults.length === 0) {
      html += '<div style="position:absolute;top:100%;left:0;right:0;z-index:100;'
        + 'background:var(--navy-800);border:1px solid var(--border);border-radius:8px;'
        + 'padding:16px;margin-top:4px;text-align:center;font-size:12px;color:var(--text-tertiary)">'
        + 'No patients found</div>';
    }
    html += '</div>';

    // Create new patient button + keyboard hint
    html += '<div style="margin-top:14px;display:flex;align-items:center;gap:12px">'
      + '<button class="btn btn-sm btn-outline" data-uw-action="create-patient-open">'
      + '+ Create New Patient</button>'
      + '<span style="font-size:10px;color:var(--text-tertiary)">Press <kbd style="padding:1px 4px;border:1px solid var(--border);border-radius:3px;font-size:10px">N</kbd> for new patient</span>'
      + '</div>';

    // Empty state hint OR quick-pick demo patients
    if (!_uwSearchQuery) {
      const demoPatients = (_uwPatients || []).filter(p => p.is_demo);
      if (demoPatients.length > 0) {
        html += '<div style="margin-top:20px">'
          + '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px">Quick pick (demo patients):</div>';
        demoPatients.forEach(p => {
          html += '<button class="qeeg-uw-scan-row" style="cursor:pointer;width:100%;text-align:left;margin-bottom:6px;background:var(--bg-card)"'
            + ' data-uw-action="select-patient" data-uw-id="' + esc(p.id) + '">'
            + '<span style="font-weight:500;color:var(--text-primary)">' + esc(p.first_name) + ' ' + esc(p.last_name) + '</span>'
            + '<span style="font-size:11px;color:var(--text-tertiary);margin-left:auto">' + esc(p.primary_condition || '') + '</span>'
            + '<span style="font-size:9px;padding:2px 5px;border-radius:3px;background:rgba(255,181,71,0.15);color:var(--amber);margin-left:6px">DEMO</span>'
            + '</button>';
        });
        html += '</div>';
      } else {
        html += '<div style="margin-top:24px;text-align:center;padding:24px;opacity:0.6">'
          + '<div style="font-size:28px;margin-bottom:8px">&#x1F50D;</div>'
          + '<div style="font-size:13px;color:var(--text-secondary)">Search for a patient or create a new one to begin</div>'
          + '</div>';
      }
    }
  }

  html += '</div>';

  // Slide-over for creating patient
  if (_uwCreateSlideOverOpen) {
    html += _renderCreatePatientSlideOver();
  }

  return html;
}

function _renderCreatePatientSlideOver() {
  return '<div class="qeeg-uw-slideover">'
    + '<div class="qeeg-uw-slideover__backdrop" data-uw-action="create-patient-close"></div>'
    + '<div class="qeeg-uw-slideover__panel">'
    + '<div class="qeeg-uw-slideover__header">'
    + '<h3>New Patient</h3>'
    + '<button class="btn btn-sm btn-ghost" data-uw-action="create-patient-close" aria-label="Close">&times;</button>'
    + '</div>'
    + '<div class="qeeg-uw-slideover__body">'
    + '<div class="qeeg-uw-intake__row">'
    + '<div><label class="qeeg-uw-intake__label qeeg-uw-intake__label--req">First Name</label>'
    + '<input class="qeeg-uw-intake__input" id="uw-new-fname" /></div>'
    + '<div><label class="qeeg-uw-intake__label qeeg-uw-intake__label--req">Last Name</label>'
    + '<input class="qeeg-uw-intake__input" id="uw-new-lname" /></div>'
    + '</div>'
    + '<div class="qeeg-uw-intake__row">'
    + '<div><label class="qeeg-uw-intake__label">Date of Birth</label>'
    + '<input class="qeeg-uw-intake__input" type="date" id="uw-new-dob" /></div>'
    + '<div><label class="qeeg-uw-intake__label">Sex</label>'
    + '<select class="qeeg-uw-intake__input" id="uw-new-sex">'
    + '<option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>'
    + '</select></div>'
    + '</div>'
    + '<div class="qeeg-uw-intake__row">'
    + '<div><label class="qeeg-uw-intake__label">Email</label>'
    + '<input class="qeeg-uw-intake__input" type="email" id="uw-new-email" /></div>'
    + '<div><label class="qeeg-uw-intake__label">Phone</label>'
    + '<input class="qeeg-uw-intake__input" type="tel" id="uw-new-phone" /></div>'
    + '</div>'
    + '<div class="qeeg-uw-intake__row">'
    + '<div><label class="qeeg-uw-intake__label">Handedness</label>'
    + '<select class="qeeg-uw-intake__input" id="uw-new-hand">'
    + '<option value="">—</option><option value="right">Right</option><option value="left">Left</option><option value="ambidextrous">Ambidextrous</option>'
    + '</select></div>'
    + '<div><label class="qeeg-uw-intake__label">Primary Condition</label>'
    + '<input class="qeeg-uw-intake__input" id="uw-new-condition" placeholder="e.g., ADHD, TBI, Depression" /></div>'
    + '</div>'
    + '<div style="margin-top:20px;text-align:right">'
    + '<button class="btn btn-sm btn-outline" data-uw-action="create-patient-close" style="margin-right:8px">Cancel</button>'
    + '<button class="btn btn-sm btn-primary" data-uw-action="create-patient-submit">Create Patient</button>'
    + '</div>'
    + '</div></div></div>';
}

// ── Step 2: Intake Form ──────────────────────────────────────────────────────
function _renderStep2() {
  let html = '<div class="qeeg-uw-intake">';

  // Status bar
  const { valid, missing } = _validateIntakeRequired();
  html += '<div class="qeeg-uw-intake__status-bar">'
    + '<span style="font-size:12px;color:var(--text-secondary)">'
    + 'Pre-QEEG Scan Intake'
    + '<span id="uw-save-indicator" style="margin-left:10px;font-size:10px;font-weight:500">'
    + (_uwSaveStatus === 'saving' ? 'Saving...' : _uwSaveStatus === 'saved' ? 'Saved' : '')
    + '</span></span>'
    + '<span class="qeeg-uw-intake__status-badge '
    + (_uwIntakeLocked ? 'qeeg-uw-intake__status-badge--complete' : 'qeeg-uw-intake__status-badge--draft') + '">'
    + (_uwIntakeLocked ? 'Complete' : 'Draft') + '</span>'
    + '</div>';

  // Sub-tabs
  html += '<div class="qeeg-uw-intake__subtabs" role="tablist">';
  INTAKE_SUBTABS.forEach(t => {
    html += '<button class="qeeg-uw-intake__subtab' + (t === _uwIntakeSubTab ? ' qeeg-uw-intake__subtab--active' : '') + '"'
      + ' role="tab" aria-selected="' + (t === _uwIntakeSubTab) + '"'
      + ' data-uw-action="intake-subtab" data-uw-tab="' + t + '">'
      + esc(INTAKE_SUBTAB_LABELS[t]) + '</button>';
  });
  html += '</div>';

  // Sub-tab body
  html += '<div class="qeeg-uw-intake__body">';
  const d = _uwIntakeDraft;
  const disabled = _uwIntakeLocked ? ' disabled' : '';

  if (_uwIntakeSubTab === 'demographics') {
    html += '<div class="qeeg-uw-intake__row">'
      + '<div><label class="qeeg-uw-intake__label qeeg-uw-intake__label--req">Sex</label>'
      + '<select class="qeeg-uw-intake__input" data-uw-action="intake-field" data-uw-path="demographics.sex"' + disabled + '>'
      + '<option value="">—</option><option value="male"' + (d.demographics.sex === 'male' ? ' selected' : '') + '>Male</option>'
      + '<option value="female"' + (d.demographics.sex === 'female' ? ' selected' : '') + '>Female</option>'
      + '<option value="other"' + (d.demographics.sex === 'other' ? ' selected' : '') + '>Other</option></select></div>'
      + '<div><label class="qeeg-uw-intake__label">Handedness</label>'
      + '<select class="qeeg-uw-intake__input" data-uw-action="intake-field" data-uw-path="demographics.handedness"' + disabled + '>'
      + '<option value="">—</option><option value="right"' + (d.demographics.handedness === 'right' ? ' selected' : '') + '>Right</option>'
      + '<option value="left"' + (d.demographics.handedness === 'left' ? ' selected' : '') + '>Left</option>'
      + '<option value="ambidextrous"' + (d.demographics.handedness === 'ambidextrous' ? ' selected' : '') + '>Ambidextrous</option></select></div>'
      + '</div>';
    html += '<div class="qeeg-uw-intake__row">'
      + '<div><label class="qeeg-uw-intake__label">Sleep Last Night (hours)</label>'
      + '<input class="qeeg-uw-intake__input" type="number" min="0" max="24" step="0.5"'
      + ' value="' + esc(d.demographics.sleep_hours) + '"'
      + ' data-uw-action="intake-field" data-uw-path="demographics.sleep_hours"' + disabled + ' /></div>'
      + '<div><label class="qeeg-uw-intake__label">Caffeine in last 4h</label>'
      + '<select class="qeeg-uw-intake__input" data-uw-action="intake-field" data-uw-path="demographics.caffeine"' + disabled + '>'
      + '<option value="no"' + (d.demographics.caffeine === 'no' ? ' selected' : '') + '>No</option>'
      + '<option value="yes"' + (d.demographics.caffeine === 'yes' ? ' selected' : '') + '>Yes</option></select></div>'
      + '</div>';
    html += '<div class="qeeg-uw-intake__row">'
      + '<div><label class="qeeg-uw-intake__label">Alertness (1-10)</label>'
      + '<div class="qeeg-uw-intake__slider-wrap">'
      + '<input type="range" class="qeeg-uw-intake__slider" min="1" max="10" value="' + (d.demographics.alertness || 5) + '"'
      + ' data-uw-action="intake-field" data-uw-path="demographics.alertness"' + disabled + ' />'
      + '<span class="qeeg-uw-intake__slider-val">' + (d.demographics.alertness || 5) + '</span></div></div>'
      + '<div><label class="qeeg-uw-intake__label">Stress (1-10)</label>'
      + '<div class="qeeg-uw-intake__slider-wrap">'
      + '<input type="range" class="qeeg-uw-intake__slider" min="1" max="10" value="' + (d.demographics.stress || 5) + '"'
      + ' data-uw-action="intake-field" data-uw-path="demographics.stress"' + disabled + ' />'
      + '<span class="qeeg-uw-intake__slider-val">' + (d.demographics.stress || 5) + '</span></div></div>'
      + '</div>';

  } else if (_uwIntakeSubTab === 'symptoms') {
    html += '<div><label class="qeeg-uw-intake__label qeeg-uw-intake__label--req">Chief Complaint</label>'
      + '<input class="qeeg-uw-intake__input" placeholder="Primary presenting symptom"'
      + ' value="' + esc(d.symptoms.chief_complaint) + '"'
      + ' data-uw-action="intake-field" data-uw-path="symptoms.chief_complaint"' + disabled + ' /></div>';
    html += '<div style="margin-top:14px">';
    Object.entries(SYMPTOM_CATEGORIES).forEach(([cat, items]) => {
      html += '<div style="margin-bottom:12px"><div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;text-transform:capitalize">' + esc(cat) + '</div>';
      html += '<div class="qeeg-uw-intake__check-group">';
      items.forEach(item => {
        const checked = (d.symptoms.checked || []).includes(item);
        const severity = (d.symptoms.severities && d.symptoms.severities[item]) || 0;
        html += '<label class="qeeg-uw-intake__check-item' + (checked ? ' qeeg-uw-intake__check-item--checked' : '') + '"'
          + ' style="flex-direction:column;align-items:stretch;gap:4px">'
          + '<div style="display:flex;align-items:center;gap:6px">'
          + '<input type="checkbox"' + (checked ? ' checked' : '') + disabled
          + ' data-uw-action="intake-symptom-check" data-uw-item="' + esc(item) + '" style="accent-color:var(--teal)" />'
          + '<span>' + esc(item) + '</span></div>';
        if (checked) {
          html += '<div class="qeeg-uw-intake__slider-wrap" style="padding-left:20px">'
            + '<span style="font-size:9px;color:var(--text-tertiary)">Severity:</span>'
            + '<input type="range" class="qeeg-uw-intake__slider" min="0" max="10" value="' + severity + '"'
            + ' data-uw-action="intake-symptom-severity" data-uw-item="' + esc(item) + '"' + disabled + ' style="flex:1;max-width:80px" />'
            + '<span class="qeeg-uw-intake__slider-val" style="font-size:10px;min-width:14px">' + severity + '</span>'
            + '</div>';
        }
        html += '</label>';
      });
      html += '</div></div>';
    });
    html += '</div>';

  } else if (_uwIntakeSubTab === 'diagnoses') {
    html += '<div class="qeeg-uw-intake__row">'
      + '<div><label class="qeeg-uw-intake__label qeeg-uw-intake__label--req">Primary Diagnosis</label>'
      + '<input class="qeeg-uw-intake__input" placeholder="e.g., Major Depressive Disorder"'
      + ' value="' + esc(d.diagnoses.primary_dx) + '"'
      + ' data-uw-action="intake-field" data-uw-path="diagnoses.primary_dx"' + disabled + ' /></div>'
      + '<div><label class="qeeg-uw-intake__label">ICD-10 Code</label>'
      + '<input class="qeeg-uw-intake__input" placeholder="e.g., F32.1"'
      + ' value="' + esc(d.diagnoses.icd10) + '"'
      + ' data-uw-action="intake-field" data-uw-path="diagnoses.icd10"' + disabled + ' /></div>'
      + '</div>';
    html += '<div class="qeeg-uw-intake__row">'
      + '<div><label class="qeeg-uw-intake__label">Secondary Diagnoses</label>'
      + '<input class="qeeg-uw-intake__input" placeholder="Comma-separated"'
      + ' value="' + esc(d.diagnoses.secondary) + '"'
      + ' data-uw-action="intake-field" data-uw-path="diagnoses.secondary"' + disabled + ' /></div>'
      + '</div>';
    html += '<div class="qeeg-uw-intake__row">'
      + '<div><label class="qeeg-uw-intake__label">Working Hypothesis</label>'
      + '<textarea class="qeeg-uw-intake__input qeeg-uw-intake__textarea" placeholder="Clinical working hypothesis..."'
      + ' data-uw-action="intake-field" data-uw-path="diagnoses.hypothesis"' + disabled + '>' + esc(d.diagnoses.hypothesis) + '</textarea></div>'
      + '</div>';
    html += '<div class="qeeg-uw-intake__row">'
      + '<div><label class="qeeg-uw-intake__label">Family History Flags</label>'
      + '<input class="qeeg-uw-intake__input" placeholder="e.g., epilepsy, dementia, psychiatric"'
      + ' value="' + esc(d.diagnoses.family_history) + '"'
      + ' data-uw-action="intake-field" data-uw-path="diagnoses.family_history"' + disabled + ' /></div>'
      + '</div>';

  } else if (_uwIntakeSubTab === 'medications') {
    html += '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px">Current medications (CNS-active and AEDs highlighted)</div>';
    (d.medications || []).forEach((med, idx) => {
      html += '<div class="qeeg-uw-intake__med-row">'
        + '<div><label class="qeeg-uw-intake__label">Drug Name</label>'
        + '<input class="qeeg-uw-intake__input" value="' + esc(med.name) + '"'
        + ' data-uw-action="intake-med" data-uw-idx="' + idx + '" data-uw-field="name"' + disabled + ' /></div>'
        + '<div><label class="qeeg-uw-intake__label">Class</label>'
        + '<input class="qeeg-uw-intake__input" value="' + esc(med.class_name) + '" placeholder="SSRI, AED..."'
        + ' data-uw-action="intake-med" data-uw-idx="' + idx + '" data-uw-field="class_name"' + disabled + ' /></div>'
        + '<div><label class="qeeg-uw-intake__label">Dose</label>'
        + '<input class="qeeg-uw-intake__input" value="' + esc(med.dose) + '" placeholder="e.g., 50mg"'
        + ' data-uw-action="intake-med" data-uw-idx="' + idx + '" data-uw-field="dose"' + disabled + ' /></div>'
        + '<div><label class="qeeg-uw-intake__label">Frequency</label>'
        + '<input class="qeeg-uw-intake__input" value="' + esc(med.frequency) + '" placeholder="e.g., BID"'
        + ' data-uw-action="intake-med" data-uw-idx="' + idx + '" data-uw-field="frequency"' + disabled + ' /></div>'
        + '<div style="padding-top:18px">'
        + ((!_uwIntakeLocked && (d.medications || []).length > 1)
          ? '<button class="btn btn-sm btn-ghost" data-uw-action="intake-med-remove" data-uw-idx="' + idx + '" style="color:var(--red)">&times;</button>'
          : '')
        + '</div></div>';
    });
    if (!_uwIntakeLocked) {
      html += '<button class="btn btn-sm btn-outline" data-uw-action="intake-med-add" style="margin-top:4px">+ Add Medication</button>';
    }

  } else if (_uwIntakeSubTab === 'notes') {
    html += '<div class="qeeg-uw-intake__row">'
      + '<div><label class="qeeg-uw-intake__label">Reason for QEEG Referral</label>'
      + '<input class="qeeg-uw-intake__input" value="' + esc(d.notes.referral_reason) + '"'
      + ' placeholder="e.g., pre-rTMS workup, post-TBI evaluation"'
      + ' data-uw-action="intake-field" data-uw-path="notes.referral_reason"' + disabled + ' /></div>'
      + '</div>';
    html += '<div class="qeeg-uw-intake__row">'
      + '<div><label class="qeeg-uw-intake__label">Specific Clinical Question</label>'
      + '<input class="qeeg-uw-intake__input" value="' + esc(d.notes.clinical_question) + '"'
      + ' placeholder="e.g., differentiate ADHD vs anxiety"'
      + ' data-uw-action="intake-field" data-uw-path="notes.clinical_question"' + disabled + ' /></div>'
      + '</div>';
    html += '<div class="qeeg-uw-intake__row">'
      + '<div><label class="qeeg-uw-intake__label">Recording Protocol</label>'
      + '<select class="qeeg-uw-intake__input" data-uw-action="intake-field" data-uw-path="notes.protocol"' + disabled + '>'
      + '<option value="">—</option>'
      + ['Eyes Open + Eyes Closed', 'Eyes Closed only', 'Eyes Open only', 'Task-based', 'Sleep', 'Custom'].map(p =>
        '<option value="' + esc(p) + '"' + (d.notes.protocol === p ? ' selected' : '') + '>' + esc(p) + '</option>'
      ).join('')
      + '</select></div></div>';
    html += '<div class="qeeg-uw-intake__row">'
      + '<div><label class="qeeg-uw-intake__label">Additional Notes</label>'
      + '<textarea class="qeeg-uw-intake__input qeeg-uw-intake__textarea" rows="4"'
      + ' data-uw-action="intake-field" data-uw-path="notes.free_text"' + disabled + '>' + esc(d.notes.free_text) + '</textarea></div>'
      + '</div>';
  }

  html += '</div>'; // body

  // Action buttons
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">';
  if (!_uwIntakeLocked) {
    if (!valid) {
      html += '<div class="qeeg-uw-intake__validation">'
        + '<span style="font-size:11px;color:var(--amber);font-weight:500">&#x26A0; Required: ' + esc(missing.join(', ')) + '</span>'
        + '</div>';
    } else {
      html += '<div class="qeeg-uw-intake__validation">'
        + '<span style="font-size:11px;color:var(--green);font-weight:500">&#x2713; All required fields complete</span>'
        + '</div>';
    }
    html += '<div style="display:flex;gap:8px">'
      + '<button class="btn btn-sm btn-outline" data-uw-action="intake-skip" title="Skip intake form — report may lack clinical context">Skip Intake</button>'
      + '<button class="btn btn-sm btn-primary"' + (valid ? '' : ' disabled') + ' data-uw-action="mark-intake-complete">Mark Complete &rarr;</button>'
      + '</div>';
  } else {
    html += '<span style="font-size:11px;color:var(--green);font-weight:500">&#x2713; Intake locked &amp; saved</span>';
    html += '<div style="display:flex;gap:8px">'
      + '<button class="btn btn-sm btn-outline" data-uw-action="unlock-intake">Unlock &amp; Edit</button>'
      + '<button class="btn btn-sm btn-primary" data-uw-action="go-step" data-uw-step="3">Continue to Upload &rarr;</button>'
      + '</div>';
  }
  html += '</div></div>';
  return html;
}

// ── Step 3: File Upload ──────────────────────────────────────────────────────
function _renderStep3() {
  let html = '<div class="qeeg-uw-step3">';
  html += '<h4 style="font-size:14px;font-weight:600;margin:0 0 12px;color:var(--text-primary)">Upload EEG Files</h4>';

  // Dropzone
  html += '<div class="qeeg-uw-dropzone' + (_uwDragOver ? ' qeeg-uw-dropzone--dragover' : '') + '"'
    + ' data-uw-action="dropzone-click" tabindex="0" role="button" aria-label="Upload EEG files">'
    + '<div class="qeeg-uw-dropzone__icon">&#x2B06;&#xFE0F;</div>'
    + '<div class="qeeg-uw-dropzone__text"><strong>Drag &amp; drop</strong> EEG files here, or click to browse</div>'
    + '<div class="qeeg-uw-dropzone__formats">Accepted: ' + ACCEPTED_EXTENSIONS.join(', ') + ' (max 100 MB)</div>'
    + '</div>';

  // Hidden file input
  html += '<input type="file" id="uw-file-input" multiple accept="' + ACCEPTED_EXTENSIONS.join(',') + '" style="display:none" />';

  // Format guide (only shown when no files uploaded yet)
  if (_uwFileQueue.length === 0) {
    html += '<div class="qeeg-uw-format-guide">'
      + '<div class="qeeg-uw-format-guide__title">Supported EEG Systems</div>'
      + '<div class="qeeg-uw-format-guide__row"><span class="qeeg-uw-format-guide__ext">.edf</span> European Data Format &mdash; BioSemi, Nihon Kohden, Natus, Compumedics</div>'
      + '<div class="qeeg-uw-format-guide__row"><span class="qeeg-uw-format-guide__ext">.bdf</span> BioSemi Data Format &mdash; BioSemi ActiveTwo</div>'
      + '<div class="qeeg-uw-format-guide__row"><span class="qeeg-uw-format-guide__ext">.vhdr</span> BrainVision &mdash; Brain Products actiCHamp, LiveAmp</div>'
      + '<div class="qeeg-uw-format-guide__row"><span class="qeeg-uw-format-guide__ext">.set</span> EEGLAB &mdash; Any system exported via EEGLAB</div>'
      + '<div class="qeeg-uw-format-guide__row"><span class="qeeg-uw-format-guide__ext">.mff</span> MFF format &mdash; EGI/Philips Geodesic</div>'
      + '<div class="qeeg-uw-format-guide__row"><span class="qeeg-uw-format-guide__ext">.cnt</span> Neuroscan &mdash; Compumedics Neuroscan</div>'
      + '</div>';
  }

  // File list
  if (_uwFileQueue.length > 0) {
    html += '<div class="qeeg-uw-file-list">';
    _uwFileQueue.forEach((f, idx) => {
      const { valid: fValid, errors } = _validateFile(f.file);
      html += '<div class="qeeg-uw-file-row">'
        + '<div class="qeeg-uw-file-row__name" title="' + esc(f.file.name) + '">' + esc(f.file.name) + '</div>'
        + '<div class="qeeg-uw-file-row__size">' + _humanSize(f.file.size) + '</div>'
        + '<select class="qeeg-uw-file-row__tag" data-uw-action="condition-tag" data-uw-idx="' + idx + '">'
        + CONDITIONS.map(c => '<option value="' + esc(c) + '"' + (f.condition === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('')
        + '</select>'
        + '<div class="qeeg-uw-file-row__badge ' + (fValid ? 'qeeg-uw-file-row__badge--valid' : 'qeeg-uw-file-row__badge--invalid') + '">'
        + (fValid ? '&#x2713; Valid' : '&#x2717; ' + esc(errors[0] || 'Error'))
        + '</div>'
        + '<div class="qeeg-uw-file-row__actions">'
        + (f.status === 'uploading'
          ? '<div class="qeeg-uw-file-row__uploading"><div class="qeeg-uw-file-row__progress-bar" style="width:' + (f.progress || 0) + '%"></div></div>'
          : f.status === 'done'
            ? '<span style="font-size:11px;color:var(--green)">&#x2713; Done</span>'
            : f.status === 'error'
              ? '<span style="font-size:11px;color:var(--red)">Failed</span>'
              : '<button class="btn btn-sm btn-ghost" data-uw-action="file-remove" data-uw-idx="' + idx + '" style="color:var(--red)" title="Remove">&times;</button>')
        + '</div></div>';
    });
    html += '</div>';

    // Batch upload button
    const uploadableCount = _uwFileQueue.filter(f => f.status === 'pending' && _validateFile(f.file).valid).length;
    const failedCount = _uwFileQueue.filter(f => f.status === 'error').length;
    if (uploadableCount > 0 || failedCount > 0) {
      html += '<div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">';
      if (failedCount > 0) {
        html += '<button class="btn btn-sm btn-outline" style="color:var(--amber)" data-uw-action="retry-failed-uploads">Retry Failed (' + failedCount + ')</button>';
      }
      if (uploadableCount > 0) {
        html += '<button class="btn btn-sm btn-primary" data-uw-action="batch-upload">Start Analysis (' + uploadableCount + ' file' + (uploadableCount > 1 ? 's' : '') + ')</button>';
      }
      html += '</div>';
    }

    // Pre-upload confirmation panel
    if (_uwShowConfirm) {
      html += _renderConfirmPanel(uploadableCount);
    }
  }

  html += '</div>';
  return html;
}

// ── Confirmation Panel ────────────────────────────────────────────────────────
function _renderConfirmPanel(fileCount) {
  const patientName = _uwPatient ? esc(_uwPatient.first_name + ' ' + _uwPatient.last_name) : 'Unknown';
  const age = _uwPatient ? _computeAge(_uwPatient.dob) : '';
  const conditions = _uwFileQueue.filter(f => f.status === 'pending').map(f => f.condition).join(', ');
  const intakeComplete = _uwIntakeLocked;
  const chiefComplaint = _uwIntakeDraft.symptoms.chief_complaint || '';
  const primaryDx = _uwIntakeDraft.diagnoses.primary_dx || '';
  const medCount = _uwIntakeDraft.medications.filter(m => m.name.trim()).length;

  let html = '<div class="qeeg-uw-confirm-overlay">';
  html += '<div class="qeeg-uw-confirm-panel">';
  html += '<h4 style="font-size:15px;font-weight:600;margin:0 0 16px;color:var(--text-primary)">Confirm Analysis Submission</h4>';

  // Patient info
  html += '<div class="qeeg-uw-confirm-section">'
    + '<div class="qeeg-uw-confirm-label">Patient</div>'
    + '<div class="qeeg-uw-confirm-value">' + patientName + (age ? ' (' + age + 'y)' : '') + '</div>'
    + '</div>';

  // Files
  html += '<div class="qeeg-uw-confirm-section">'
    + '<div class="qeeg-uw-confirm-label">Files</div>'
    + '<div class="qeeg-uw-confirm-value">' + fileCount + ' file' + (fileCount > 1 ? 's' : '') + ' &mdash; ' + esc(conditions) + '</div>'
    + '</div>';

  // Intake summary
  html += '<div class="qeeg-uw-confirm-section">'
    + '<div class="qeeg-uw-confirm-label">Intake</div>'
    + '<div class="qeeg-uw-confirm-value">'
    + (intakeComplete ? '<span style="color:var(--green)">&#x2713; Complete</span>' : '<span style="color:var(--amber)">&#x26A0; Not completed</span>')
    + (chiefComplaint ? ' &mdash; ' + esc(chiefComplaint) : '')
    + '</div></div>';

  if (primaryDx) {
    html += '<div class="qeeg-uw-confirm-section">'
      + '<div class="qeeg-uw-confirm-label">Primary Dx</div>'
      + '<div class="qeeg-uw-confirm-value">' + esc(primaryDx) + '</div>'
      + '</div>';
  }
  if (medCount > 0) {
    html += '<div class="qeeg-uw-confirm-section">'
      + '<div class="qeeg-uw-confirm-label">Medications</div>'
      + '<div class="qeeg-uw-confirm-value">' + medCount + ' active medication' + (medCount > 1 ? 's' : '') + '</div>'
      + '</div>';
  }

  // Warning if intake not complete
  if (!intakeComplete) {
    html += '<div style="margin-top:12px;padding:10px 12px;border-radius:6px;background:rgba(255,181,71,0.08);border:1px solid rgba(255,181,71,0.2);font-size:12px;color:var(--amber)">'
      + '&#x26A0; Intake form is not completed. Analysis will proceed, but the report may lack clinical context.</div>';
  }

  // Actions
  html += '<div style="margin-top:18px;display:flex;justify-content:flex-end;gap:10px">'
    + '<button class="btn btn-sm btn-outline" data-uw-action="cancel-confirm">Cancel</button>'
    + '<button class="btn btn-sm btn-primary" data-uw-action="confirm-upload">Confirm &amp; Start Analysis</button>'
    + '</div>';

  html += '</div></div>';
  return html;
}

// ── Step 4: Reports Panel ────────────────────────────────────────────────────
function _renderStep4() {
  let html = '<div class="qeeg-uw-step4">';
  html += '<h4 style="font-size:14px;font-weight:600;margin:0 0 12px;color:var(--text-primary)">Scan History</h4>';

  if (!_uwAnalyses || _uwAnalyses.length === 0) {
    html += '<div style="text-align:center;padding:40px 20px;color:var(--text-tertiary);font-size:13px">'
      + '<div style="font-size:32px;margin-bottom:12px;opacity:0.4">&#x1F4CB;</div>'
      + '<div style="font-weight:500;color:var(--text-secondary);margin-bottom:4px">No analyses yet</div>'
      + '<div style="margin-bottom:16px">Upload an EEG file to generate your first qEEG report.</div>'
      + '<button class="btn btn-sm btn-primary" data-uw-action="go-step" data-uw-step="3">&#x2B06; Go to Upload</button>'
      + '</div>';
  } else {
    _uwAnalyses.forEach(a => {
      const date = a.created_at ? new Date(a.created_at).toLocaleDateString() : '—';
      const status = (a.status || 'unknown').toLowerCase();
      let statusCls = 'qeeg-uw-scan-row__status--processing';
      let statusLabel = status;
      if (status === 'completed' || status === 'ready') { statusCls = 'qeeg-uw-scan-row__status--ready'; statusLabel = 'Ready'; }
      else if (status === 'failed' || status === 'error') { statusCls = 'qeeg-uw-scan-row__status--failed'; statusLabel = 'Failed'; }
      else { statusLabel = 'Processing'; }

      html += '<div class="qeeg-uw-scan-row">'
        + '<div class="qeeg-uw-scan-row__date">' + esc(date) + '</div>'
        + '<div class="qeeg-uw-scan-row__cond">' + esc(a.original_filename || a.condition || '—') + '</div>'
        + '<span class="qeeg-uw-scan-row__status ' + statusCls + '">' + esc(statusLabel) + '</span>'
        + '<div class="qeeg-uw-scan-row__actions">';
      if (status === 'completed' || status === 'ready') {
        html += '<button class="btn btn-sm btn-outline" data-uw-action="view-report" data-uw-id="' + esc(a.id) + '">View</button>'
          + '<button class="btn btn-sm btn-ghost" data-uw-action="download-pdf" data-uw-id="' + esc(a.id) + '">PDF</button>';
      } else if (status !== 'failed') {
        html += '<button class="btn btn-sm btn-outline" data-uw-action="view-pipeline" data-uw-id="' + esc(a.id) + '">Status</button>';
      }
      html += '</div></div>';
    });
  }

  html += '</div>';
  return html;
}

// ── Step 5: Pipeline Timeline ────────────────────────────────────────────────
function _renderStep5() {
  let html = '<div class="qeeg-uw-step5">';
  html += '<h4 style="font-size:14px;font-weight:600;margin:0 0 12px;color:var(--text-primary)">Analysis Pipeline</h4>';

  if (!_uwActiveAnalysisId) {
    html += '<div style="text-align:center;padding:32px;color:var(--text-tertiary);font-size:13px">'
      + 'No active analysis. Upload and start an EEG analysis first.</div>';
  } else {
    // ETA indicator
    const doneCount = _uwPipelineStages.filter(s => s.status === 'done').length;
    const total = _uwPipelineStages.length;
    const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
    const allDone = doneCount === total && total > 0;
    if (!allDone) {
      html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">'
        + '<div style="flex:1;height:4px;background:var(--border);border-radius:2px;overflow:hidden">'
        + '<div style="width:' + pct + '%;height:100%;background:var(--teal);border-radius:2px;transition:width .3s"></div></div>'
        + '<span style="font-size:11px;color:var(--text-secondary);white-space:nowrap">' + pct + '% &middot; ~' + Math.max(1, (total - doneCount)) + ' min remaining</span>'
        + '</div>';
    }

    html += '<div class="qeeg-uw-timeline">';
    _uwPipelineStages.forEach((stage) => {
      const statusCls = stage.status === 'done' ? ' qeeg-uw-timeline__node--done'
        : stage.status === 'running' ? ' qeeg-uw-timeline__node--running'
        : stage.status === 'failed' ? ' qeeg-uw-timeline__node--failed' : '';
      const icon = stage.status === 'done' ? '&#x2713;'
        : stage.status === 'running' ? '&#x25CF;'
        : stage.status === 'failed' ? '&#x2717;' : '&#x25CB;';
      const expanded = _uwExpandedLogNodes.has(stage.id);
      const clickable = stage.status !== 'pending';

      html += '<div class="qeeg-uw-timeline__node' + statusCls + '">'
        + '<div class="qeeg-uw-timeline__icon">' + icon + '</div>'
        + '<div style="flex:1">'
        + '<div class="qeeg-uw-timeline__label"'
        + (clickable ? ' style="cursor:pointer" data-uw-action="toggle-logs" data-uw-stage="' + esc(stage.id) + '"' : '')
        + '>' + esc(stage.label)
        + (clickable ? ' <span style="font-size:9px;color:var(--text-tertiary)">' + (expanded ? '&#x25B2;' : '&#x25BC;') + '</span>' : '')
        + '</div>'
        + (stage.status === 'running' ? '<div class="qeeg-uw-timeline__sub">Processing...</div>' : '')
        + (stage.status === 'failed' ? '<div class="qeeg-uw-timeline__sub" style="color:var(--red)">Error occurred &mdash; <button class="btn btn-sm btn-ghost" style="font-size:10px;padding:0 4px;color:var(--amber)" data-uw-action="retry-stage" data-uw-stage="' + esc(stage.id) + '">Retry</button></div>' : '')
        + (expanded ? _renderStageLogs(stage) : '')
        + '</div></div>';
    });
    html += '</div>';

    // Link to reports when ready
    if (allDone) {
      html += '<div style="margin-top:16px;padding:12px;border-radius:8px;background:rgba(74,222,128,0.06);border:1px solid rgba(74,222,128,0.2);text-align:center">'
        + '<div style="font-size:13px;color:var(--green);font-weight:500;margin-bottom:8px">Analysis Complete</div>'
        + '<button class="btn btn-sm btn-primary" data-uw-action="go-step" data-uw-step="6">View Report &rarr;</button>'
        + ' <button class="btn btn-sm btn-outline" data-uw-action="go-step" data-uw-step="4">Back to Reports</button>'
        + '</div>';
    } else if (!_uwPollTimer && !allDone && _uwActiveAnalysisId) {
      // Polling stopped (connection loss or timeout) but not complete
      html += '<div style="margin-top:16px;padding:12px;border-radius:8px;background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.2);text-align:center">'
        + '<div style="font-size:12px;color:var(--amber);margin-bottom:8px">Connection lost or timed out</div>'
        + '<button class="btn btn-sm btn-primary" data-uw-action="resume-polling">Reconnect &amp; Resume</button>'
        + '</div>';
    }
  }
  html += '</div>';
  return html;
}

function _renderStageLogs(stage) {
  const demoLogs = {
    queued: 'File queued for processing.\nWorker assigned: gpu-node-1',
    preprocessing: 'Re-referencing to common average...\nBandpass filter: 0.5-45 Hz\nNotch filter: 50 Hz applied\nDuration: 300.0s, 19 channels',
    artifact_removal: 'Running ICA (Infomax, 15 components)...\nAuto-classified: 2 eye blink, 1 muscle, 1 ECG\nRemoved 4 components, retained 15\nEpochs retained: 142/150 (94.7%)',
    spectral: 'Computing Welch PSD (2s windows, 50% overlap)...\nBands: delta(1-4), theta(4-8), alpha(8-13), beta1(13-20), beta2(20-30), gamma(30-45)\nAlpha peak: 10.2 Hz (occipital)',
    normative: 'Comparing to age/sex norms (N=1200, ages 30-40, M)...\nZ-scores computed per channel per band\nSignificant deviations: Fz theta +2.3, F3 alpha -1.8',
    report_gen: 'Generating AI interpretation...\nSections: executive summary, spectral, connectivity, impression\nCitations: 8 references attached',
    ready: 'Report generated successfully.\nPDF rendered: 12 pages, 4 figures embedded\nHash: sha256:a1b2c3...',
  };
  const logs = stage.logs || demoLogs[stage.id] || 'No logs available.';
  return '<div class="qeeg-uw-timeline__logs qeeg-uw-timeline__logs--open">' + esc(logs) + '</div>';
}

// ── Step 6: PDF Viewer ───────────────────────────────────────────────────────
function _renderStep6() {
  let html = '<div class="qeeg-uw-step6">';
  html += '<h4 style="font-size:14px;font-weight:600;margin:0 0 12px;color:var(--text-primary)">Report</h4>';

  if (!_uwPdfBlobUrl && !_uwActiveAnalysisId) {
    html += '<div style="text-align:center;padding:32px;color:var(--text-tertiary);font-size:13px">'
      + 'No report available. Complete an analysis first.</div>';
  } else if (!_uwPdfBlobUrl) {
    html += '<div style="text-align:center;padding:32px">'
      + '<div style="display:flex;gap:8px;justify-content:center;align-items:center">'
      + '<button class="btn btn-sm btn-primary" data-uw-action="load-pdf">Load Report PDF</button>'
      + '<button class="btn btn-sm btn-outline" data-uw-action="generate-report">Generate Report</button>'
      + '</div>'
      + '<div style="margin-top:8px;font-size:11px;color:var(--text-tertiary)">Load existing report or generate a new AI report</div>'
      + (_uwReportGenerating ? '<div style="margin-top:12px;font-size:12px;color:var(--teal)">Generating report... please wait</div>' : '')
      + '</div>';
  } else {
    const patientLabel = _uwPatient ? esc(_uwPatient.first_name + ' ' + _uwPatient.last_name) : 'Patient';
    html += '<div class="qeeg-uw-pdf-viewer">'
      + '<div class="qeeg-uw-pdf-viewer__toolbar">'
      + '<div class="qeeg-uw-pdf-viewer__toolbar-left">'
      + '<span style="font-size:12px;font-weight:500;color:var(--text-primary)">' + patientLabel + ' &mdash; qEEG Report</span>'
      + '</div>'
      + '<div class="qeeg-uw-pdf-viewer__toolbar-right">'
      + '<button class="btn btn-sm btn-ghost" data-uw-action="print-report" title="Print report">&#x1F5A8; Print</button>'
      + '<button class="btn btn-sm btn-ghost" data-uw-action="fullscreen-report" title="Fullscreen">&#x26F6; Expand</button>'
      + '<button class="btn btn-sm btn-primary" data-uw-action="download-from-viewer" title="Download PDF">&#x2B07; Download</button>'
      + '<button class="btn btn-sm btn-outline" data-uw-action="go-step" data-uw-step="4">&#x2190; Back</button>'
      + '</div></div>'
      + '<iframe class="qeeg-uw-pdf-viewer__frame" id="uw-report-frame" src="' + esc(_uwPdfBlobUrl) + '"></iframe>'
      + '</div>';
  }

  html += '</div>';
  return html;
}

// ── Patient mini-header (persistent across steps 2-6) ─────────────────────────
function _renderPatientMiniHeader() {
  if (!_uwPatient) return '';
  const name = esc(_uwPatient.first_name + ' ' + _uwPatient.last_name);
  const age = _computeAge(_uwPatient.dob);
  const gender = _uwPatient.gender ? esc(_uwPatient.gender.charAt(0).toUpperCase()) : '';
  const cond = _uwPatient.primary_condition ? esc(_uwPatient.primary_condition) : '';
  const initChars = _initials(_uwPatient.first_name, _uwPatient.last_name);

  return '<div class="qeeg-uw-mini-header">'
    + '<div class="qeeg-uw-mini-header__avatar">' + esc(initChars) + '</div>'
    + '<div class="qeeg-uw-mini-header__info">'
    + '<span class="qeeg-uw-mini-header__name">' + name + '</span>'
    + '<span class="qeeg-uw-mini-header__meta">'
    + (age ? age + 'y' : '') + (gender ? ' ' + gender : '') + (cond ? ' &middot; ' + cond : '')
    + '</span></div>'
    + '<div class="qeeg-uw-mini-header__actions">'
    + '<button class="btn btn-sm btn-ghost" data-uw-action="go-step" data-uw-step="1" title="Change patient" style="font-size:11px;padding:2px 8px">Change</button>'
    + (_uwStep >= 3 ? '<button class="btn btn-sm btn-ghost" data-uw-action="new-analysis" title="Start new analysis" style="font-size:11px;padding:2px 8px;color:var(--teal)">+ New Analysis</button>' : '')
    + '</div></div>';
}

// ── Status bar ────────────────────────────────────────────────────────────────
function _renderStatusBar() {
  const parts = [];
  if (_uwPatient) {
    parts.push(esc(_uwPatient.first_name + ' ' + _uwPatient.last_name));
  }
  if (_uwFileQueue.length > 0) {
    const done = _uwFileQueue.filter(f => f.status === 'done').length;
    parts.push(done + '/' + _uwFileQueue.length + ' files');
  }
  if (_uwAnalyses.length > 0) {
    parts.push(_uwAnalyses.length + ' scan' + (_uwAnalyses.length > 1 ? 's' : ''));
  }
  // Save status
  let saveHtml = '';
  if (_uwSaveStatus === 'saving') saveHtml = '<span class="qeeg-uw-save-status qeeg-uw-save-status--saving">Saving&hellip;</span>';
  else if (_uwSaveStatus === 'saved') saveHtml = '<span class="qeeg-uw-save-status qeeg-uw-save-status--saved">Saved</span>';

  if (parts.length === 0 && !saveHtml) return '';
  return '<div class="qeeg-uw-status-bar">'
    + '<div class="qeeg-uw-status-bar__left">' + parts.join(' &middot; ') + '</div>'
    + '<div class="qeeg-uw-status-bar__right">' + saveHtml + '</div>'
    + '</div>';
}

// ── Shortcuts overlay ─────────────────────────────────────────────────────────
function _renderShortcutsOverlay() {
  const shortcuts = [
    ['/', 'Search patients'],
    ['N', 'New patient'],
    ['U', 'Upload step'],
    ['R', 'Reports step'],
    ['Esc', 'Close / Go back'],
    ['?', 'Toggle this panel'],
  ];
  let html = '<div class="qeeg-uw-shortcuts-overlay" data-uw-action="close-shortcuts">';
  html += '<div class="qeeg-uw-shortcuts-panel" onclick="event.stopPropagation()">';
  html += '<h4 style="font-size:15px;font-weight:600;margin:0 0 16px;color:var(--text-primary)">Keyboard Shortcuts</h4>';
  shortcuts.forEach(([key, desc]) => {
    html += '<div class="qeeg-uw-shortcuts-row">'
      + '<span>' + esc(desc) + '</span>'
      + '<span class="qeeg-uw-shortcuts-key">' + esc(key) + '</span>'
      + '</div>';
  });
  html += '<div style="margin-top:16px;text-align:center;font-size:11px;color:var(--text-tertiary)">Press <span class="qeeg-uw-shortcuts-key">?</span> or <span class="qeeg-uw-shortcuts-key">Esc</span> to close</div>';
  html += '</div></div>';
  return html;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT: renderUploadWorkflow
// ══════════════════════════════════════════════════════════════════════════════
export function renderUploadWorkflow(state) {
  // Sync external state into module
  if (state) {
    if (state.patientId !== _uwPatientId) {
      _uwPatientId = state.patientId || null;
      _uwPatient = state.patient || null;
      _loadDraft();
    }
    _uwPatients = state.patients || [];
    _uwAnalyses = state.analyses || [];
  }

  // If no patient but step > 1, reset step
  if (!_uwPatientId && _uwStep > 1) _uwStep = 1;

  let html = '<div id="uw-root" aria-live="polite" aria-atomic="false">';
  html += _renderStepper();
  if (_uwPatient && _uwStep > 1) html += _renderPatientMiniHeader();
  html += '<div class="qeeg-uw-content" role="tabpanel">';

  switch (_uwStep) {
    case 1: html += _renderStep1(); break;
    case 2: html += _renderStep2(); break;
    case 3: html += _renderStep3(); break;
    case 4: html += _renderStep4(); break;
    case 5: html += _renderStep5(); break;
    case 6: html += _renderStep6(); break;
    default: html += _renderStep1();
  }

  html += '</div>';
  html += _renderStatusBar();
  if (_uwShowShortcuts) html += _renderShortcutsOverlay();
  html += '</div>';
  return html;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT: mountUploadWorkflow
// ══════════════════════════════════════════════════════════════════════════════
export function mountUploadWorkflow(container) {
  _uwContainer = container;

  // Event delegation
  container.addEventListener('click', _handleClick);
  container.addEventListener('input', _handleInput);
  container.addEventListener('change', _handleChange);
  container.addEventListener('dragover', _handleDragOver);
  container.addEventListener('dragleave', _handleDragLeave);
  container.addEventListener('drop', _handleDrop);
  container.addEventListener('keydown', _handleKeydown);

  // Wire file input
  const fileInput = container.querySelector('#uw-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      _addFiles(e.target.files);
      e.target.value = '';
    });
  }

  // Page Visibility API — pause polling when tab hidden, resume when visible
  document.addEventListener('visibilitychange', _handleVisibilityChange);

  // Online/offline detection — auto-reconnect
  window.addEventListener('online', _handleOnline);
  window.addEventListener('offline', _handleOffline);
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT: resetUploadWorkflow
// ══════════════════════════════════════════════════════════════════════════════
export function resetUploadWorkflow() {
  _stopPolling();
  _cleanupPdf();
  _uwStep = 1;
  _uwPatientId = null;
  _uwPatient = null;
  _uwIntakeDraft = _emptyIntake();
  _uwIntakeLocked = false;
  _uwIntakeSubTab = 'demographics';
  _uwFileQueue = [];
  _uwAnalyses = [];
  _uwActiveAnalysisId = null;
  _uwPipelineStages = [];
  _uwSearchQuery = '';
  _uwSearchResults = [];
  _uwDragOver = false;
  _uwCreateSlideOverOpen = false;
  _uwPollCount = 0;
  _uwPollFailures = 0;
  _uwReportGenerating = false;

  // Cleanup global listeners
  document.removeEventListener('visibilitychange', _handleVisibilityChange);
  window.removeEventListener('online', _handleOnline);
  window.removeEventListener('offline', _handleOffline);
}

// ══════════════════════════════════════════════════════════════════════════════
// EVENT HANDLERS
// ══════════════════════════════════════════════════════════════════════════════
function _handleClick(e) {
  const el = e.target.closest('[data-uw-action]');
  if (!el) return;
  const action = el.dataset.uwAction;

  switch (action) {
    case 'go-step': {
      const step = parseInt(el.dataset.uwStep, 10);
      if (_canGoToStep(step)) { _uwStep = step; _saveDraft(); _rerender(); }
      break;
    }
    case 'select-patient': {
      const id = el.dataset.uwId;
      _selectPatient(id);
      break;
    }
    case 'clear-patient': {
      _uwPatientId = null;
      _uwPatient = null;
      _uwStep = 1;
      _uwSearchQuery = '';
      _uwSearchResults = [];
      _cleanupPdf();
      _stopPolling();
      if (typeof window._qeegClearPatient === 'function') window._qeegClearPatient();
      _rerender();
      break;
    }
    case 'create-patient-open': {
      _uwCreateSlideOverOpen = true;
      _rerender();
      break;
    }
    case 'create-patient-close': {
      _uwCreateSlideOverOpen = false;
      _rerender();
      break;
    }
    case 'create-patient-submit': {
      _handleCreatePatientSubmit();
      break;
    }
    case 'intake-subtab': {
      _uwIntakeSubTab = el.dataset.uwTab;
      _rerender();
      break;
    }
    case 'mark-intake-complete': {
      const { valid } = _validateIntakeRequired();
      if (valid) {
        _uwIntakeLocked = true;
        _uwStep = 3;
        _saveDraft();
        _rerender();
      }
      break;
    }
    case 'intake-skip': {
      _uwIntakeLocked = true;
      _uwStep = 3;
      _saveDraft();
      _rerender();
      break;
    }
    case 'unlock-intake': {
      _uwIntakeLocked = false;
      try { localStorage.removeItem(_lsKey('locked')); } catch (_e) {}
      _rerender();
      break;
    }
    case 'dropzone-click': {
      const fi = _uwContainer && _uwContainer.querySelector('#uw-file-input');
      if (fi) fi.click();
      break;
    }
    case 'file-remove': {
      const idx = parseInt(el.dataset.uwIdx, 10);
      _uwFileQueue.splice(idx, 1);
      _rerender();
      break;
    }
    case 'batch-upload': {
      _uwShowConfirm = true;
      _rerender();
      break;
    }
    case 'confirm-upload': {
      _uwShowConfirm = false;
      _handleBatchUpload();
      break;
    }
    case 'cancel-confirm': {
      _uwShowConfirm = false;
      _rerender();
      break;
    }
    case 'close-shortcuts': {
      _uwShowShortcuts = false;
      _rerender();
      break;
    }
    case 'new-analysis': {
      _uwFileQueue = [];
      _uwActiveAnalysisId = null;
      _uwPipelineStages = [];
      _cleanupPdf();
      _stopPolling();
      _uwStep = 3;
      _rerender();
      break;
    }
    case 'view-report': {
      _uwActiveAnalysisId = el.dataset.uwId;
      _uwPdfBlobUrl = null;
      _uwStep = 6;
      _rerender();
      break;
    }
    case 'view-pipeline': {
      _uwActiveAnalysisId = el.dataset.uwId;
      _initPipelineStages();
      _uwStep = 5;
      _startPolling();
      _rerender();
      break;
    }
    case 'download-pdf': {
      _downloadPdf(el.dataset.uwId);
      break;
    }
    case 'load-pdf': {
      _loadPdf();
      break;
    }
    case 'generate-report': {
      _autoGenerateReport();
      break;
    }
    case 'download-from-viewer': {
      if (_uwPdfBlobUrl) {
        const a = document.createElement('a');
        a.href = _uwPdfBlobUrl;
        a.download = 'qeeg-report-' + (_uwPatient ? _uwPatient.last_name.toLowerCase() : 'patient') + '.pdf';
        a.click();
      }
      break;
    }
    case 'print-report': {
      const frame = _uwContainer && _uwContainer.querySelector('#uw-report-frame');
      if (frame && frame.contentWindow) {
        try { frame.contentWindow.print(); } catch (_e) { window.print(); }
      }
      break;
    }
    case 'fullscreen-report': {
      const viewer = _uwContainer && _uwContainer.querySelector('.qeeg-uw-pdf-viewer');
      if (viewer) {
        if (document.fullscreenElement) document.exitFullscreen();
        else viewer.requestFullscreen().catch(() => {});
      }
      break;
    }
    case 'intake-med-add': {
      _uwIntakeDraft.medications.push({ name: '', class_name: '', dose: '', frequency: '', last_taken: '' });
      _saveDraft();
      _rerender();
      break;
    }
    case 'intake-med-remove': {
      const medIdx = parseInt(el.dataset.uwIdx, 10);
      _uwIntakeDraft.medications.splice(medIdx, 1);
      _saveDraft();
      _rerender();
      break;
    }
    case 'intake-symptom-check': {
      const item = el.dataset.uwItem;
      const arr = _uwIntakeDraft.symptoms.checked || [];
      const i = arr.indexOf(item);
      if (i >= 0) arr.splice(i, 1); else arr.push(item);
      _uwIntakeDraft.symptoms.checked = arr;
      _debounceSaveDraft();
      _rerender();
      break;
    }
    case 'toggle-logs': {
      const stageId = el.dataset.uwStage;
      if (_uwExpandedLogNodes.has(stageId)) _uwExpandedLogNodes.delete(stageId);
      else _uwExpandedLogNodes.add(stageId);
      _rerender();
      break;
    }
    case 'retry-stage': {
      const stageId = el.dataset.uwStage;
      const stage = _uwPipelineStages.find(s => s.id === stageId);
      if (stage) {
        stage.status = 'running';
        stage.progress = 0;
        _rerender();
        // In demo mode, simulate success after delay
        if (_isDemoPatientId(_uwPatientId)) {
          setTimeout(() => { stage.status = 'done'; stage.progress = 100; _rerender(); }, 2000);
        }
      }
      break;
    }
    case 'retry-failed-uploads': {
      // Retry all files that failed to upload
      const failed = _uwFileQueue.filter(f => f.status === 'error');
      if (failed.length > 0) {
        failed.forEach(f => { f.status = 'queued'; f.errors = []; });
        _rerender();
        _handleBatchUpload();
      }
      break;
    }
    case 'resume-polling': {
      // Resume polling after connection lost
      _uwPollCount = 0;
      _uwPollFailures = 0;
      _startPolling();
      showToast('Reconnecting to server...', 'info');
      break;
    }
  }
}

function _handleInput(e) {
  const el = e.target;
  const action = el.dataset.uwAction;
  if (!action) return;

  if (action === 'search-input') {
    _uwSearchQuery = el.value;
    clearTimeout(_uwSearchTimer);
    _uwSearchTimer = setTimeout(() => { _performSearch(); }, 300);
  } else if (action === 'intake-field') {
    const path = el.dataset.uwPath;
    if (path) {
      const [section, field] = path.split('.');
      if (_uwIntakeDraft[section]) {
        _uwIntakeDraft[section][field] = el.value;
        _debounceSaveDraft();
        // Update slider value display
        if (el.type === 'range') {
          const valEl = el.parentElement && el.parentElement.querySelector('.qeeg-uw-intake__slider-val');
          if (valEl) valEl.textContent = el.value;
        }
      }
    }
  } else if (action === 'intake-med') {
    const idx = parseInt(el.dataset.uwIdx, 10);
    const field = el.dataset.uwField;
    if (_uwIntakeDraft.medications[idx]) {
      _uwIntakeDraft.medications[idx][field] = el.value;
      _debounceSaveDraft();
    }
  } else if (action === 'intake-symptom-severity') {
    const item = el.dataset.uwItem;
    if (!_uwIntakeDraft.symptoms.severities) _uwIntakeDraft.symptoms.severities = {};
    _uwIntakeDraft.symptoms.severities[item] = parseInt(el.value, 10);
    _debounceSaveDraft();
    // Update value display without full re-render
    const valEl = el.parentElement && el.parentElement.querySelector('.qeeg-uw-intake__slider-val');
    if (valEl) valEl.textContent = el.value;
  }
}

function _handleChange(e) {
  const el = e.target;
  const action = el.dataset.uwAction;
  if (!action) return;

  if (action === 'condition-tag') {
    const idx = parseInt(el.dataset.uwIdx, 10);
    if (_uwFileQueue[idx]) _uwFileQueue[idx].condition = el.value;
  } else if (action === 'intake-field') {
    // For select elements
    const path = el.dataset.uwPath;
    if (path) {
      const [section, field] = path.split('.');
      if (_uwIntakeDraft[section]) {
        _uwIntakeDraft[section][field] = el.value;
        _debounceSaveDraft();
      }
    }
  }
}

function _handleDragOver(e) {
  const dz = e.target.closest('[data-uw-action="dropzone-click"]');
  if (!dz) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  if (!_uwDragOver) { _uwDragOver = true; dz.classList.add('qeeg-uw-dropzone--dragover'); }
}

function _handleDragLeave(e) {
  const dz = e.target.closest('[data-uw-action="dropzone-click"]');
  if (!dz) return;
  _uwDragOver = false;
  dz.classList.remove('qeeg-uw-dropzone--dragover');
}

function _handleDrop(e) {
  const dz = e.target.closest('[data-uw-action="dropzone-click"]');
  if (!dz) return;
  e.preventDefault();
  _uwDragOver = false;
  dz.classList.remove('qeeg-uw-dropzone--dragover');
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    _addFiles(e.dataTransfer.files);
  }
}

function _handleKeydown(e) {
  // Don't capture when user is typing in an input/textarea/select
  const tag = (e.target.tagName || '').toLowerCase();
  const isInput = tag === 'input' || tag === 'textarea' || tag === 'select';

  // Escape closes slide-over or overlays
  if (e.key === 'Escape') {
    if (_uwShowShortcuts) { _uwShowShortcuts = false; _rerender(); return; }
    if (_uwShowConfirm) { _uwShowConfirm = false; _rerender(); return; }
    if (_uwCreateSlideOverOpen) { _uwCreateSlideOverOpen = false; _rerender(); return; }
    return;
  }

  // Enter on dropzone
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-uw-action="dropzone-click"]')) {
    e.preventDefault();
    const fi = _uwContainer && _uwContainer.querySelector('#uw-file-input');
    if (fi) fi.click();
    return;
  }

  // Keyboard shortcuts (only when not typing in a field)
  if (isInput) return;

  if (e.key === '?') {
    // Toggle keyboard shortcuts help
    e.preventDefault();
    _uwShowShortcuts = !_uwShowShortcuts;
    _rerender();
  } else if (e.key === '/' || e.key === 'f') {
    // Focus patient search
    e.preventDefault();
    if (_uwStep !== 1) { _uwStep = 1; _rerender(); }
    setTimeout(() => {
      const searchEl = _uwContainer && _uwContainer.querySelector('#uw-patient-search');
      if (searchEl) searchEl.focus();
    }, 50);
  } else if (e.key === 'n' || e.key === 'N') {
    // Open new patient slide-over
    e.preventDefault();
    _uwCreateSlideOverOpen = true;
    _rerender();
  } else if (e.key === 'u' || e.key === 'U') {
    // Jump to upload step (if accessible)
    if (_canGoToStep(3)) { _uwStep = 3; _rerender(); }
  } else if (e.key === 'r' || e.key === 'R') {
    // Jump to reports
    if (_canGoToStep(4)) { _uwStep = 4; _rerender(); }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ASYNC ACTIONS
// ══════════════════════════════════════════════════════════════════════════════
function _debounceSaveDraft() {
  clearTimeout(_uwSaveDraftTimer);
  _uwSaveStatus = 'saving';
  _updateSaveIndicator();
  _uwSaveDraftTimer = setTimeout(() => {
    _saveDraft();
    _uwSaveStatus = 'saved';
    _updateSaveIndicator();
    setTimeout(() => { _uwSaveStatus = ''; _updateSaveIndicator(); }, 2000);
  }, 1000);
}

function _updateSaveIndicator() {
  if (!_uwContainer) return;
  const el = _uwContainer.querySelector('#uw-save-indicator');
  if (!el) return;
  if (_uwSaveStatus === 'saving') {
    el.textContent = 'Saving...';
    el.style.color = 'var(--text-tertiary)';
  } else if (_uwSaveStatus === 'saved') {
    el.textContent = 'Saved';
    el.style.color = 'var(--green)';
  } else {
    el.textContent = '';
  }
}

function _performSearch() {
  const q = (_uwSearchQuery || '').trim().toLowerCase();
  if (q.length < 2) { _uwSearchResults = []; _rerender(); return; }
  _uwSearchResults = (_uwPatients || []).filter(p => {
    const full = ((p.first_name || '') + ' ' + (p.last_name || '') + ' ' + (p.id || '') + ' ' + (p.dob || '')).toLowerCase();
    return full.includes(q);
  }).slice(0, 15);
  _rerender();
}

async function _selectPatient(id) {
  _uwPatientId = id;
  _uwPatient = (_uwPatients || []).find(p => p.id === id) || null;
  _uwSearchQuery = '';
  _uwSearchResults = [];
  _uwCreateSlideOverOpen = false;
  _loadDraft();

  // If step is still 1, auto-advance
  if (_uwStep === 1) _uwStep = 2;
  _saveDraft();

  // Notify main page
  if (typeof window._qeegSelectPatient === 'function') {
    window._qeegSelectPatient(id);
  }

  // Fetch analyses (skip API for demo patients)
  if (_isDemoPatientId(id)) {
    // Provide a synthetic completed analysis for demo patients
    _uwAnalyses = [{
      id: 'demo', is_synthetic_demo: true, analysis_status: 'completed', status: 'completed',
      original_filename: 'demo_eyes_closed.edf', channels_used: 19, sample_rate_hz: 256,
      eyes_condition: 'closed', created_at: new Date().toISOString(),
    }];
  } else {
    try {
      const res = await api.listPatientQEEGAnalyses(id);
      _uwAnalyses = (res && (res.items || res)) || [];
    } catch (_e) { _uwAnalyses = []; }
  }

  _rerender();
}

async function _handleCreatePatientSubmit() {
  const fname = (document.getElementById('uw-new-fname') || {}).value || '';
  const lname = (document.getElementById('uw-new-lname') || {}).value || '';
  if (!fname.trim() || !lname.trim()) {
    showToast('First and last name are required', 'error');
    return;
  }
  const data = {
    first_name: fname.trim(),
    last_name: lname.trim(),
    dob: (document.getElementById('uw-new-dob') || {}).value || undefined,
    gender: (document.getElementById('uw-new-sex') || {}).value || undefined,
    email: (document.getElementById('uw-new-email') || {}).value || undefined,
    phone: (document.getElementById('uw-new-phone') || {}).value || undefined,
    primary_condition: (document.getElementById('uw-new-condition') || {}).value || undefined,
    handedness: (document.getElementById('uw-new-hand') || {}).value || undefined,
  };
  try {
    const res = await api.createPatient(data);
    if (res && res.id) {
      // Add to local list
      _uwPatients.unshift(res);
      _uwCreateSlideOverOpen = false;
      showToast('Patient created', 'success');
      _selectPatient(res.id);
    }
  } catch (err) {
    showToast('Could not create patient: ' + _friendlyErrorMessage(err), 'error');
  }
}

function _addFiles(fileList) {
  for (let i = 0; i < fileList.length; i++) {
    _uwFileQueue.push({
      file: fileList[i],
      condition: 'Eyes Closed',
      status: 'pending',
      errors: [],
      analysisId: null,
    });
  }
  _rerender();
}

async function _handleBatchUpload() {
  const uploadable = _uwFileQueue.filter(f => f.status === 'pending' && _validateFile(f.file).valid);
  if (uploadable.length === 0) return;

  for (const item of uploadable) {
    item.status = 'uploading';
  }
  _rerender();

  // Demo mode: simulate upload with progress
  if (_isDemoMode() || _isDemoPatientId(_uwPatientId)) {
    for (const item of uploadable) {
      item.progress = 0;
      _rerender();
      // Simulate progress ticks
      for (let pct = 20; pct <= 80; pct += 20) {
        await new Promise(r => setTimeout(r, 150));
        item.progress = pct;
        _rerender();
      }
      await new Promise(r => setTimeout(r, 200));
      item.progress = 100;
      item.status = 'done';
      item.analysisId = 'demo-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      _uwActiveAnalysisId = item.analysisId;
      const demoEntry = {
        id: item.analysisId, is_synthetic_demo: true, analysis_status: 'completed',
        original_filename: item.file.name, channels_used: 19, sample_rate_hz: 256,
        eyes_condition: item.condition.toLowerCase().replace(/\s+/g, '_'),
        created_at: new Date().toISOString(), status: 'completed',
      };
      _uwAnalyses.unshift(demoEntry);
      _rerender();
    }
    showToast('Demo: Files processed (simulated)', 'success');
    _initPipelineStages();
    _uwStep = 5;
    _startDemoPolling();
    _saveDraft();
    _rerender();
    return;
  }

  // Real mode: upload via API
  for (const item of uploadable) {
    try {
      const fd = new FormData();
      fd.append('file', item.file);
      if (_uwPatientId) fd.append('patient_id', _uwPatientId);
      fd.append('eyes_condition', _conditionToEnum(item.condition));
      fd.append('recording_date', new Date().toISOString().split('T')[0]);
      if (_uwIntakeLocked) {
        try { fd.append('survey_json', JSON.stringify(_uwIntakeDraft)); } catch (_e) { /* ignore */ }
      }

      const res = await api.uploadQEEGAnalysis(fd);
      item.status = 'done';
      item.analysisId = res && res.id;

      // Trigger MNE pipeline (modern Celery-backed)
      if (item.analysisId) {
        try { await api.runQEEGMNEPipeline(item.analysisId); } catch (_e) { /* non-fatal */ }
        _uwActiveAnalysisId = item.analysisId;
      }

      // Add to analyses list
      if (res) _uwAnalyses.unshift(res);
    } catch (err) {
      item.status = 'error';
      const msg = _friendlyErrorMessage(err);
      item.errors = [msg];
      showToast('Upload failed: ' + msg, 'error');
    }
    _rerender();
  }

  // If we have an active analysis, advance to pipeline view
  if (_uwActiveAnalysisId) {
    _initPipelineStages();
    _uwStep = 5;
    _startPolling();
    _saveDraft();
    _rerender();
  }
}

// ── Pipeline polling ──────────────────────────────────────────────────────────
function _initPipelineStages() {
  _uwPipelineStages = PIPELINE_STAGES.map(s => ({ ...s, status: 'pending', logs: '' }));
}

function _startPolling() {
  _stopPolling();
  if (!_uwActiveAnalysisId) return;
  _uwPollCount = 0;
  _uwPollFailures = 0;
  _pollOnce();
  _uwPollTimer = setInterval(_pollOnce, 3000);
}

function _stopPolling() {
  if (_uwPollTimer) { clearInterval(_uwPollTimer); _uwPollTimer = null; }
}

// ── Visibility & network handlers ─────────────────────────────────────────────
let _uwPollingWasPaused = false;

function _handleVisibilityChange() {
  if (document.hidden) {
    // Pause polling while tab is hidden to save resources
    if (_uwPollTimer) {
      _stopPolling();
      _uwPollingWasPaused = true;
    }
  } else {
    // Resume polling when tab becomes visible again
    if (_uwPollingWasPaused && _uwActiveAnalysisId) {
      _uwPollingWasPaused = false;
      _startPolling();
    }
  }
}

function _handleOnline() {
  // Auto-resume polling if it was stopped due to network loss
  if (_uwActiveAnalysisId && !_uwPollTimer && _uwPollFailures >= _POLL_MAX_FAILURES) {
    _uwPollFailures = 0;
    _uwPollCount = 0;
    _startPolling();
    showToast('Connection restored — resuming...', 'success');
  }
}

function _handleOffline() {
  if (_uwPollTimer) {
    _stopPolling();
    showToast('Network offline — polling paused.', 'error');
  }
}

// Demo pipeline simulation — advances one stage every 800ms
function _startDemoPolling() {
  _stopPolling();
  let currentStage = 0;
  _uwPipelineStages = PIPELINE_STAGES.map(s => ({ ...s, status: 'pending', logs: '' }));
  _uwPipelineStages[0].status = 'running';
  _rerender();

  _uwPollTimer = setInterval(() => {
    if (currentStage < PIPELINE_STAGES.length) {
      _uwPipelineStages[currentStage].status = 'done';
      currentStage++;
      if (currentStage < PIPELINE_STAGES.length) {
        _uwPipelineStages[currentStage].status = 'running';
      }
      _rerender();
    } else {
      _stopPolling();
      showToast('Demo: Analysis complete', 'success');
      _rerender();
    }
  }, 800);
}

const _POLL_MAX = 200; // ~10min at 3s intervals
const _POLL_MAX_FAILURES = 5; // consecutive failures before giving up

async function _pollOnce() {
  if (!_uwActiveAnalysisId) { _stopPolling(); return; }

  _uwPollCount++;
  if (_uwPollCount > _POLL_MAX) {
    _stopPolling();
    showToast('Pipeline timeout — please check analysis status manually.', 'error');
    return;
  }

  try {
    const res = await api.getQEEGAnalysisStatus(_uwActiveAnalysisId);
    if (!res) return;

    // Reset consecutive failure counter on success
    _uwPollFailures = 0;

    const status = (res.status || '').toLowerCase();
    const pct = res.progress_pct || 0;
    const step = res.step || '';

    // Map percentage to pipeline stage progression
    const stageCount = PIPELINE_STAGES.length;
    const completedStages = Math.floor((pct / 100) * stageCount);

    _uwPipelineStages = PIPELINE_STAGES.map((s, idx) => ({
      ...s,
      status: idx < completedStages ? 'done'
        : idx === completedStages && status !== 'completed' && status !== 'failed' ? 'running'
        : status === 'failed' && idx === completedStages ? 'failed'
        : status === 'completed' ? 'done'
        : 'pending',
      logs: step && idx === completedStages ? step : '',
    }));

    if (status === 'completed' || status === 'ready') {
      _uwPipelineStages = _uwPipelineStages.map(s => ({ ...s, status: 'done' }));
      _stopPolling();
      // Auto-generate report
      _autoGenerateReport();
    } else if (status === 'failed' || status === 'error') {
      _stopPolling();
      const errMsg = res.error || 'Pipeline processing failed';
      showToast(_friendlyErrorMessage(errMsg), 'error');
    }

    _rerender();
  } catch (err) {
    _uwPollFailures++;
    if (_uwPollFailures >= _POLL_MAX_FAILURES) {
      _stopPolling();
      showToast('Lost connection to server. Please check your network and retry.', 'error');
      _rerender();
    }
    // Otherwise silently retry on next interval
  }
}

// ── Auto-generate report after pipeline completion ────────────────────────────
async function _autoGenerateReport() {
  if (_uwReportGenerating) return;
  if (!_uwActiveAnalysisId) return;

  _uwReportGenerating = true;
  showToast('Pipeline complete — generating AI report...', 'success');

  try {
    await api.generateQEEGAIReport(_uwActiveAnalysisId);
    // Give backend a moment to finalize
    await new Promise(r => setTimeout(r, 2000));
    _uwStep = 6;
    _saveDraft();
    _rerender();
    _loadPdf();
  } catch (err) {
    showToast('Auto-report generation failed: ' + _friendlyErrorMessage(err), 'error');
    // Still advance to step 6 so user can retry manually
    _uwStep = 6;
    _saveDraft();
    _rerender();
  } finally {
    _uwReportGenerating = false;
  }
}

// ── PDF helpers ───────────────────────────────────────────────────────────────
async function _loadPdf() {
  if (!_uwActiveAnalysisId) return;

  // Demo mode: generate a synthetic HTML report
  if (_isDemoPatientId(_uwActiveAnalysisId) || _isDemoPatientId(_uwPatientId)) {
    _cleanupPdf();
    const patientName = _uwPatient ? (_uwPatient.first_name + ' ' + _uwPatient.last_name) : 'Demo Patient';
    const demoHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>qEEG Report</title>'
      + '<style>body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:40px;color:#1e293b;background:#fff}'
      + 'h1{font-size:22px;color:#0f172a;border-bottom:2px solid #0d9488;padding-bottom:8px;margin-bottom:24px}'
      + 'h2{font-size:16px;color:#334155;margin:20px 0 8px}table{width:100%;border-collapse:collapse;margin:12px 0}'
      + 'th,td{padding:8px 12px;border:1px solid #e2e8f0;text-align:left;font-size:13px}'
      + 'th{background:#f1f5f9;font-weight:600}.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}'
      + '.badge-normal{background:#d1fae5;color:#065f46}.badge-elevated{background:#fef3c7;color:#92400e}'
      + '.badge-high{background:#fee2e2;color:#991b1b}.section{margin-bottom:24px;padding:16px;border:1px solid #e2e8f0;border-radius:8px}'
      + '.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}'
      + '.meta{font-size:12px;color:#64748b}</style></head><body>'
      + '<div class="header"><div><h1>Quantitative EEG Analysis Report</h1>'
      + '<div class="meta">DeepSynaps Protocol Studio &mdash; Generated ' + new Date().toLocaleDateString() + '</div></div>'
      + '<div style="text-align:right"><div style="font-size:13px;font-weight:600">' + patientName + '</div>'
      + '<div class="meta">Analysis ID: ' + _uwActiveAnalysisId.slice(0, 8) + '</div></div></div>'
      + '<div class="section"><h2>Absolute Power Summary</h2>'
      + '<table><tr><th>Band</th><th>Frontal</th><th>Central</th><th>Parietal</th><th>Occipital</th><th>Status</th></tr>'
      + '<tr><td>Delta (1-4 Hz)</td><td>12.3 &mu;V&sup2;</td><td>10.1 &mu;V&sup2;</td><td>9.8 &mu;V&sup2;</td><td>8.4 &mu;V&sup2;</td><td><span class="badge badge-normal">Normal</span></td></tr>'
      + '<tr><td>Theta (4-8 Hz)</td><td>18.7 &mu;V&sup2;</td><td>14.2 &mu;V&sup2;</td><td>11.9 &mu;V&sup2;</td><td>10.5 &mu;V&sup2;</td><td><span class="badge badge-elevated">Elevated</span></td></tr>'
      + '<tr><td>Alpha (8-12 Hz)</td><td>8.1 &mu;V&sup2;</td><td>15.6 &mu;V&sup2;</td><td>22.4 &mu;V&sup2;</td><td>28.9 &mu;V&sup2;</td><td><span class="badge badge-normal">Normal</span></td></tr>'
      + '<tr><td>Beta (12-30 Hz)</td><td>6.2 &mu;V&sup2;</td><td>7.8 &mu;V&sup2;</td><td>5.9 &mu;V&sup2;</td><td>4.3 &mu;V&sup2;</td><td><span class="badge badge-normal">Normal</span></td></tr>'
      + '<tr><td>High Beta (20-30 Hz)</td><td>4.8 &mu;V&sup2;</td><td>5.2 &mu;V&sup2;</td><td>3.9 &mu;V&sup2;</td><td>2.8 &mu;V&sup2;</td><td><span class="badge badge-high">High</span></td></tr>'
      + '</table></div>'
      + '<div class="section"><h2>Coherence Analysis</h2>'
      + '<table><tr><th>Region Pair</th><th>Alpha Coh.</th><th>Beta Coh.</th><th>Finding</th></tr>'
      + '<tr><td>F3-F4 (Frontal)</td><td>0.72</td><td>0.68</td><td><span class="badge badge-normal">Normal</span></td></tr>'
      + '<tr><td>C3-C4 (Central)</td><td>0.81</td><td>0.74</td><td><span class="badge badge-normal">Normal</span></td></tr>'
      + '<tr><td>P3-P4 (Parietal)</td><td>0.65</td><td>0.58</td><td><span class="badge badge-elevated">Low Coh.</span></td></tr>'
      + '</table></div>'
      + '<div class="section"><h2>Clinical Interpretation</h2>'
      + '<p style="font-size:13px;line-height:1.6;margin:8px 0">Elevated frontal theta power suggests executive function involvement consistent with attention-related symptomatology. '
      + 'High beta in frontal regions may indicate cortical hyperarousal. Posterior alpha is within normal range, indicating intact thalamo-cortical regulation. '
      + 'Reduced parietal coherence warrants monitoring.</p>'
      + '<p style="font-size:13px;line-height:1.6;margin:8px 0"><strong>Recommendation:</strong> Consider neurofeedback protocol targeting theta/beta ratio at Fz/Cz. '
      + 'Follow-up qEEG in 8-12 sessions recommended.</p></div>'
      + '<div class="meta" style="margin-top:32px;text-align:center;border-top:1px solid #e2e8f0;padding-top:12px">'
      + 'This is a demo report generated for preview purposes. Not for clinical use.</div>'
      + '</body></html>';
    const blob = new Blob([demoHtml], { type: 'text/html' });
    _uwPdfBlobUrl = URL.createObjectURL(blob);
    _rerender();
    return;
  }

  try {
    // First get reports list to find reportId
    const reports = await api.listQEEGAnalysisReports(_uwActiveAnalysisId);
    const reportList = (reports && (reports.items || reports)) || [];
    if (reportList.length === 0) {
      showToast('No report available yet. Generate one from the AI Report tab.', 'info');
      return;
    }
    const reportId = reportList[0].id;
    const blob = await api.getQEEGPrintableReport(_uwActiveAnalysisId, reportId);
    if (blob && blob instanceof Blob) {
      _cleanupPdf();
      _uwPdfBlobUrl = URL.createObjectURL(blob);
      _rerender();
    } else {
      showToast('Could not load PDF', 'error');
    }
  } catch (err) {
    showToast('Report load failed: ' + _friendlyErrorMessage(err), 'error');
  }
}

async function _downloadPdf(analysisId) {
  try {
    const reports = await api.listQEEGAnalysisReports(analysisId);
    const reportList = (reports && (reports.items || reports)) || [];
    if (reportList.length === 0) { showToast('No report available', 'info'); return; }
    const blob = await api.getQEEGPrintableReport(analysisId, reportList[0].id);
    if (blob) downloadBlob(blob, 'qeeg-report-' + analysisId.slice(0, 8) + '.pdf');
  } catch (err) {
    showToast('Download failed: ' + _friendlyErrorMessage(err), 'error');
  }
}

function _cleanupPdf() {
  if (_uwPdfBlobUrl) { try { URL.revokeObjectURL(_uwPdfBlobUrl); } catch (_e) {} _uwPdfBlobUrl = null; }
}

// ── Window globals for inter-module use ───────────────────────────────────────
if (typeof window !== 'undefined') {
  window._qeegUploadWorkflowRefresh = function () { _rerender(); };
  window._qeegUploadWorkflowGoToStep = function (n) {
    if (_canGoToStep(n)) { _uwStep = n; _rerender(); }
  };
}

// ── Test-only exports (tree-shaken in production) ─────────────────────────────
export const _test = { _validateFile, _validateIntakeRequired, _computeAge, _humanSize, _emptyIntake, _canGoToStep, _friendlyErrorMessage, _conditionToEnum, ACCEPTED_EXTENSIONS, PIPELINE_STAGES, CONDITION_TO_BACKEND_ENUM };
