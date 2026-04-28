import { api } from './api.js';
import { currentUser } from './auth.js';
import { spinner } from './helpers.js';
import {
  EVIDENCE_TOTAL_PAPERS,
  EVIDENCE_SUMMARY,
} from './evidence-dataset.js';
import {
  ffInput,
  ffTextarea,
  ffSelect,
  ffChipGroup,
  ffStepper,
  ffActions,
  ffNotice,
} from './friendly-forms.js';

function _obEsc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

// ── Module-level wizard state ─────────────────────────────────────────────────
let onboardingStep = 1;
let onboardingData = {};

const ONB_STEP_LABELS = ['Practice', 'Patient', 'Protocol', 'Ready'];

// ── Step indicator (friendly-forms stepper) ──────────────────────────────────
function pipHtml(step) {
  return ffStepper({ steps: ONB_STEP_LABELS, current: step });
}

// ── Step 1 — Welcome & Practice Setup ────────────────────────────────────────
function step1Html() {
  const saved = onboardingData;
  return `
    <div id="onb-step-1" style="${onboardingStep === 1 ? '' : 'display:none'}">
      ${pipHtml(1)}
      <div class="ff-page-head">
        <div class="ff-page-icon" aria-hidden="true">🧠</div>
        <h1 class="ff-page-title">Welcome to DeepSynaps Protocol Studio</h1>
        <p class="ff-page-sub">Let's set up your clinic in a few quick steps so you can start treating patients right away.</p>
      </div>

      <div class="ff-card">
        <div class="ff-card-title">About your practice</div>
        <p class="ff-card-sub">These details personalise the app and show up on patient-facing screens.</p>
        ${ffInput({
          id: 'onb-practice-name',
          label: 'Practice name',
          icon: '🏥',
          value: saved.practiceName || '',
          placeholder: 'e.g. Synapse Wellness Clinic',
          help: 'This appears on patient handouts and receipts.',
          required: true,
          autocomplete: 'organization',
        })}
        ${ffSelect({
          id: 'onb-specialty',
          label: 'Primary specialty',
          options: ['Neurofeedback', 'TMS', 'tDCS', 'Multi-modal', 'Other'],
          value: saved.specialty || '',
          help: 'Pick the modality you use most — you can add more later.',
          required: true,
        })}
        ${ffSelect({
          id: 'onb-clinician-count',
          label: 'Number of clinicians',
          options: ['1', '2-5', '6-15', '15+'],
          value: saved.clinicianCount || '',
          help: 'Helps us size seat licenses and reporting.',
        })}
      </div>

      ${ffActions({
        primary: { label: 'Continue →', onclick: 'window._onbNext(1)' },
      })}
    </div>`;
}

// ── Step 2 — Add First Patient ───────────────────────────────────────────────
function step2Html() {
  const p = onboardingData.patient || {};
  const CONDITIONS = [
    'Depression', 'Anxiety', 'PTSD', 'ADHD', 'Chronic Pain',
    'TBI', 'Autism', "Parkinson's", 'Stroke', 'Cognitive Enhancement',
    'OCD', 'Insomnia', 'Tinnitus', 'Other',
  ];
  return `
    <div id="onb-step-2" style="${onboardingStep === 2 ? '' : 'display:none'}">
      ${pipHtml(2)}
      <div class="ff-page-head">
        <div class="ff-page-icon" aria-hidden="true">👤</div>
        <h1 class="ff-page-title">Add your first patient</h1>
        <p class="ff-page-sub">Only the basics for now — you can always expand their record later from the Patients section.</p>
      </div>

      <div class="ff-card">
        <div class="ff-card-title">Patient profile</div>
        <p class="ff-card-sub">Use the legal name on file for billing and documentation.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          ${ffInput({
            id: 'onb-pt-first',
            label: 'First name',
            value: p.first_name || '',
            placeholder: 'First name',
            required: true,
            autocomplete: 'given-name',
          })}
          ${ffInput({
            id: 'onb-pt-last',
            label: 'Last name',
            value: p.last_name || '',
            placeholder: 'Last name',
            autocomplete: 'family-name',
          })}
        </div>
        ${ffInput({
          id: 'onb-pt-dob',
          label: 'Date of birth',
          type: 'date',
          icon: '📅',
          value: p.dob || '',
          help: 'Used for age-based dosing and reporting.',
          optional: true,
          autocomplete: 'bday',
        })}
        ${ffSelect({
          id: 'onb-pt-condition',
          label: 'Primary condition',
          options: CONDITIONS,
          value: p.primary_condition || '',
          placeholder: 'Select condition…',
          help: 'We will use this to suggest evidence-backed protocols in the next step.',
        })}
      </div>

      <div id="onb-step2-err" role="alert" aria-live="polite"
        style="display:none;margin-top:14px;padding:12px 14px;border-radius:var(--radius-md);border:1px solid rgba(255,107,107,0.25);background:rgba(255,107,107,0.08);color:var(--red);font-size:13px"></div>
      <div id="onb-step2-saving" role="status"
        style="display:none;margin-top:14px;padding:12px 14px;border-radius:var(--radius-md);border:1px solid rgba(74,158,255,0.25);background:rgba(74,158,255,0.08);color:var(--blue);font-size:13px;text-align:center">
        Saving patient…
      </div>

      ${ffActions({
        tertiary: { label: '← Back', onclick: 'window._onbBack(2)' },
        secondary: { label: 'Skip for now', onclick: 'window._onbSkipPatient()' },
        primary: { id: 'onb-add-patient-btn', label: 'Save &amp; continue →', onclick: 'window._onbAddPatient()' },
      })}
    </div>`;
}

// ── Step 3 — Generate First Protocol ────────────────────────────────────────
function step3Html() {
  const p = onboardingData.patient;
  const prefillCond = p?.primary_condition || '';
  const patientName = p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : '';
  const MODALITIES = ['tDCS', 'TMS', 'tACS', 'PEMF', 'Neurofeedback', 'PBM'];

  const subtitle = patientName
    ? `For ${patientName}. We'll suggest an evidence-backed protocol based on the condition and modality you select.`
    : "We'll suggest an evidence-backed protocol based on the condition and modality you select.";

  return `
    <div id="onb-step-3" style="${onboardingStep === 3 ? '' : 'display:none'}">
      ${pipHtml(3)}
      <div class="ff-page-head">
        <div class="ff-page-icon" aria-hidden="true">✦</div>
        <h1 class="ff-page-title">Generate your first protocol</h1>
        <p class="ff-page-sub">${subtitle}</p>
      </div>

      <div class="ff-card">
        <div class="ff-card-title">Protocol basics</div>
        <p class="ff-card-sub">We use these to seed recommendations from our ${EVIDENCE_TOTAL_PAPERS.toLocaleString()}-paper evidence base — you can refine every parameter afterwards.</p>
        ${ffInput({
          id: 'onb-proto-condition',
          label: 'Condition',
          icon: '🎯',
          value: prefillCond,
          placeholder: 'e.g. Depression',
          required: true,
          help: 'Condition being treated. You can use common names like "Depression" or "ADHD".',
        })}
        ${ffSelect({
          id: 'onb-proto-modality',
          label: 'Modality',
          options: MODALITIES,
          placeholder: 'Select modality…',
          help: `Choose the neuromodulation method you plan to use for this patient. Recommendations draw from ${EVIDENCE_TOTAL_PAPERS.toLocaleString()} indexed papers across ${Object.keys(EVIDENCE_SUMMARY.modalityDistribution).length} modalities.`,
        })}
        ${ffTextarea({
          id: 'onb-proto-symptoms',
          label: 'Brief symptoms / notes',
          rows: 3,
          placeholder: 'Describe key symptoms, severity, or relevant history…',
          optional: true,
          help: 'Free-text notes help the recommender prioritise the right targets.',
        })}
      </div>

      <div id="onb-proto-spinner" role="status" aria-live="polite"
        style="display:none;margin-top:14px;padding:12px 14px;border-radius:var(--radius-md);border:1px solid var(--border);background:var(--bg-surface);color:var(--text-secondary);font-size:13px;text-align:center">
        <span style="display:inline-flex;align-items:center;gap:10px">
          <span style="width:16px;height:16px;border:2px solid var(--border);border-top-color:var(--teal);border-radius:50%;animation:spin .8s linear infinite"></span>
          Generating protocol recommendation…
        </span>
      </div>
      <div id="onb-proto-preview" style="display:none;margin-top:14px">
        <div style="font-size:11px;font-weight:700;color:var(--teal);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Protocol preview</div>
        <div id="onb-proto-preview-text" style="background:var(--teal-ghost);border:1px solid var(--border-teal);border-radius:var(--radius-md);padding:14px 16px;font-size:13px;color:var(--text-primary);line-height:1.65;white-space:pre-wrap;max-height:180px;overflow-y:auto"></div>
      </div>
      <div id="onb-step3-err" role="alert" aria-live="polite"
        style="display:none;margin-top:14px;padding:12px 14px;border-radius:var(--radius-md);border:1px solid rgba(255,107,107,0.25);background:rgba(255,107,107,0.08);color:var(--red);font-size:13px"></div>

      ${ffActions({
        tertiary: { label: '← Back', onclick: 'window._onbBack(3)' },
        secondary: { label: 'Skip for now', onclick: 'window._onbSkipProtocol()' },
        primary: { id: 'onb-gen-btn', label: 'Generate protocol →', onclick: 'window._onbGenerateProtocol()' },
      })}
    </div>`;
}

// ── Step 4 — You're Ready! ────────────────────────────────────────────────────
function step4Html() {
  return `
    <div id="onb-step-4" style="${onboardingStep === 4 ? '' : 'display:none'}">
      ${pipHtml(4)}
      <div class="ff-page-head">
        <div class="ff-page-icon" aria-hidden="true" style="background:var(--teal-ghost);border-color:var(--teal);color:var(--teal)">✓</div>
        <h1 class="ff-page-title" style="color:var(--teal)">Your clinic is ready</h1>
        <p class="ff-page-sub">Here's where most clinicians go first — everything is reachable from the sidebar too.</p>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:8px">
        <div class="onb-next-card" onclick="window._nav('patients')" role="button" tabindex="0">
          <div class="onb-next-icon">👥</div>
          <div class="onb-next-title">View patients →</div>
          <div class="onb-next-desc">Manage patient records and treatment histories.</div>
        </div>
        <div class="onb-next-card" onclick="window._nav('protocols-registry')" role="button" tabindex="0">
          <div class="onb-next-icon">◇</div>
          <div class="onb-next-title">Browse protocols →</div>
          <div class="onb-next-desc">Explore the evidence-backed protocol registry.</div>
        </div>
        <div class="onb-next-card" onclick="window._nav('ai-assistant')" role="button" tabindex="0">
          <div class="onb-next-icon">✦</div>
          <div class="onb-next-title">Open AI assistant →</div>
          <div class="onb-next-desc">Get AI-powered clinical decision support.</div>
        </div>
      </div>

      ${ffActions({
        primary: { label: 'Go to dashboard →', onclick: 'window._onbFinish()' },
      })}
    </div>`;
}

// ── Render full wizard ────────────────────────────────────────────────────────
function renderOnboarding(setTopbar) {
  setTopbar('Welcome to DeepSynaps', '');
  const el = document.getElementById('content');
  el.innerHTML = `
    <div class="ff-page">
      <div class="ff-page-inner">
        ${step1Html()}
        ${step2Html()}
        ${step3Html()}
        ${step4Html()}
      </div>
    </div>`;
}

// ── Show a specific step ──────────────────────────────────────────────────────
function _showStep(step) {
  onboardingStep = step;
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`onb-step-${i}`);
    if (el) el.style.display = i === step ? '' : 'none';
  }
  document.getElementById('content')?.scrollTo(0, 0);
}

// ── Global handlers ───────────────────────────────────────────────────────────

// Step 1 → 2
window._onbNext = function(fromStep) {
  if (fromStep === 1) {
    onboardingData.practiceName    = document.getElementById('onb-practice-name')?.value.trim() || '';
    onboardingData.specialty       = document.getElementById('onb-specialty')?.value || '';
    onboardingData.clinicianCount  = document.getElementById('onb-clinician-count')?.value || '';
    _showStep(2);
    return;
  }
  _showStep(fromStep + 1);
};

// Back navigation
window._onbBack = function(fromStep) {
  _showStep(fromStep - 1);
};

// Step 2 — skip patient
window._onbSkipPatient = function() {
  onboardingData.patient = null;
  onboardingData.skippedPatient = true;
  _showStep(3);
};

// Step 2 — add patient via API
window._onbAddPatient = async function() {
  const firstName  = document.getElementById('onb-pt-first')?.value.trim() || '';
  const lastName   = document.getElementById('onb-pt-last')?.value.trim() || '';
  const dob        = document.getElementById('onb-pt-dob')?.value || '';
  const condition  = document.getElementById('onb-pt-condition')?.value || '';
  const errEl      = document.getElementById('onb-step2-err');
  const savingEl   = document.getElementById('onb-step2-saving');
  const btn        = document.getElementById('onb-add-patient-btn');

  if (!firstName && !lastName) {
    if (errEl) { errEl.textContent = 'Please enter at least a first or last name.'; errEl.style.display = 'block'; }
    return;
  }
  if (errEl) errEl.style.display = 'none';
  if (savingEl) savingEl.style.display = 'block';
  if (btn) btn.disabled = true;

  try {
    const result = await api.createPatient({
      first_name: firstName,
      last_name: lastName,
      dob: dob || null,
      primary_condition: condition || null,
      status: 'active',
    });
    onboardingData.patient = {
      id: result?.id,
      first_name: firstName,
      last_name: lastName,
      dob,
      primary_condition: condition,
    };
    onboardingData.skippedPatient = false;
    _showStep(3);
  } catch (err) {
    if (errEl) {
      errEl.textContent = 'Could not save patient — check backend connection. Continuing anyway.';
      errEl.style.display = 'block';
    }
    // Save locally and move on
    onboardingData.patient = { first_name: firstName, last_name: lastName, dob, primary_condition: condition };
    setTimeout(() => _showStep(3), 1500);
  } finally {
    if (savingEl) savingEl.style.display = 'none';
    if (btn) btn.disabled = false;
  }
};

// Step 3 — skip protocol
window._onbSkipProtocol = function() {
  onboardingData.skippedProtocol = true;
  _showStep(4);
};

// Step 3 — generate protocol
window._onbGenerateProtocol = async function() {
  const condition  = document.getElementById('onb-proto-condition')?.value.trim() || '';
  const modality   = document.getElementById('onb-proto-modality')?.value || '';
  const symptoms   = document.getElementById('onb-proto-symptoms')?.value.trim() || '';
  const spinnerEl  = document.getElementById('onb-proto-spinner');
  const previewEl  = document.getElementById('onb-proto-preview');
  const previewTxt = document.getElementById('onb-proto-preview-text');
  const genBtn     = document.getElementById('onb-gen-btn');
  const errEl      = document.getElementById('onb-step3-err');

  if (!condition) {
    if (errEl) { errEl.textContent = 'Please enter a condition.'; errEl.style.display = 'block'; }
    return;
  }
  if (errEl) errEl.style.display = 'none';

  if (spinnerEl) spinnerEl.style.display = 'block';
  if (previewEl) previewEl.style.display = 'none';
  if (genBtn)    genBtn.disabled = true;

  try {
    const result = await api.generateProtocol({
      condition_slug: condition.toLowerCase().replace(/\s+/g, '-'),
      modality_slug: modality ? modality.toLowerCase() : undefined,
      symptoms: symptoms || undefined,
      patient_id: onboardingData.patient?.id || undefined,
    });
    const text = result?.protocol_text || result?.text || result?.recommendation || JSON.stringify(result, null, 2);
    const preview = typeof text === 'string' ? text.slice(0, 400) + (text.length > 400 ? '…' : '') : 'Protocol generated.';
    onboardingData.generatedProtocol = text;
    if (previewTxt) previewTxt.textContent = preview;
    if (previewEl) previewEl.style.display = 'block';
    // Change button to Continue
    if (genBtn) {
      genBtn.textContent = 'Continue →';
      genBtn.onclick = () => _showStep(4);
      genBtn.disabled = false;
    }
  } catch (err) {
    if (errEl) {
      errEl.textContent = 'Protocol generation unavailable — ensure the backend is running. You can skip for now.';
      errEl.style.display = 'block';
    }
    if (genBtn) genBtn.disabled = false;
  } finally {
    if (spinnerEl) spinnerEl.style.display = 'none';
  }
};

// Step 4 — finish
window._onbFinish = function() {
  localStorage.setItem('ds_onboarding_done', '1');
  // Reset module state for re-use in same session
  onboardingStep = 1;
  onboardingData = {};
  window._nav('dashboard');
};

// Legacy chip selectors kept for compatibility (no longer used in new wizard but harmless)
window._onbSelectMod = function(el, mod) {
  el.classList.toggle('selected');
  onboardingData.modalities = onboardingData.modalities || [];
  if (el.classList.contains('selected')) {
    if (!onboardingData.modalities.includes(mod)) onboardingData.modalities.push(mod);
  } else {
    onboardingData.modalities = onboardingData.modalities.filter(m => m !== mod);
  }
};

window._onbSelectCond = function(el, cond) {
  el.classList.toggle('selected');
  onboardingData.conditions = onboardingData.conditions || [];
  if (el.classList.contains('selected')) {
    if (!onboardingData.conditions.includes(cond)) onboardingData.conditions.push(cond);
  } else {
    onboardingData.conditions = onboardingData.conditions.filter(c => c !== cond);
  }
};

// ── Export ────────────────────────────────────────────────────────────────────
export async function pgOnboarding(setTopbar, navigate) {
  // Reset step to 1 on each fresh visit (unless resuming)
  if (onboardingStep < 1 || onboardingStep > 4) onboardingStep = 1;
  renderOnboarding(setTopbar);
}

// ════════════════════════════════════════════════════════════════════════════════
// pgOnboardingWizard — 6-step first-run setup wizard (overlay or inline)
// ════════════════════════════════════════════════════════════════════════════════

// ── Wizard state ──────────────────────────────────────────────────────────────
let _wiz = {
  step: 1,
  clinicName: '',
  clinicType: '',
  modalities: [],
  clinicianCount: '',
  role: '',           // clinician | researcher | admin | guardian
  dataChoice: '',     // import | sample | skip
  complete: false,
};

// ── Feature maps by role ──────────────────────────────────────────────────────
const ROLE_FEATURES = {
  clinician: [
    { icon: '🧩', name: 'Protocol Builder',   desc: 'Design custom neuromodulation protocols with evidence-backed parameter blocks.',    page: 'protocol-builder' },
    { icon: '📡', name: 'Session Monitor',    desc: 'Track live session metrics and biofeedback signals in real time.',                  page: 'session-monitor' },
    { icon: '✦',  name: 'AI Note Assistant',  desc: 'Dictate or type clinical notes — AI structures and drafts them instantly.',         page: 'ai-note-assistant' },
    { icon: '💊', name: 'Medication Safety',  desc: 'Screen patient medications for TMS and neuromodulation contraindications.',         page: 'med-interactions' },
  ],
  researcher: [
    { icon: '📚', name: 'Evidence Library',   desc: 'Browse 52+ peer-reviewed neuromodulation papers with effect-size visualizations.', page: 'literature' },
    { icon: '🔬', name: 'IRB Manager',        desc: 'Track IRB submissions, approvals, and protocol deviations in one place.',          page: 'irb-manager' },
    { icon: '📤', name: 'Data Export',        desc: 'Export de-identified session and outcome data in BIDS or CSV format.',             page: 'data-export' },
    { icon: '◉',  name: 'Trial Enrollment',   desc: 'Manage participant screening, consent, and enrollment for clinical trials.',      page: 'trial-enrollment' },
  ],
  admin: [
    { icon: '📊', name: 'Clinic Analytics',       desc: 'View revenue, utilization, and clinical outcome metrics across your clinic.',  page: 'clinic-analytics' },
    { icon: '📅', name: 'Staff Scheduling',        desc: 'Manage clinician shifts, room bookings, and equipment calendars.',            page: 'staff-scheduling' },
    { icon: '🏢', name: 'Multi-Site Dashboard',   desc: 'Oversee operations across all branches from a single unified view.',           page: 'multi-site' },
    { icon: '🩺', name: 'Insurance Verification', desc: 'Verify patient insurance eligibility and generate superbills automatically.',  page: 'insurance' },
  ],
  guardian: [
    { icon: '👨‍👩‍👧', name: 'Guardian Portal',    desc: 'View your family member\'s treatment progress and upcoming appointments.',       page: 'guardian-portal' },
    { icon: '📈', name: 'Patient Outcomes',   desc: 'Track symptom trends and treatment milestones over time.',                        page: 'pt-outcomes' },
    { icon: '📓', name: 'Symptom Journal',    desc: 'Log daily mood, sleep, and symptom entries to support clinical care.',            page: 'pt-journal' },
    { icon: '💬', name: 'Virtual Care',       desc: 'Connect with your care team via messaging, video visits, and voice calls.',     page: 'messaging' },
  ],
};

// ── Quick launch features by role (top 3) ─────────────────────────────────────
const ROLE_QUICK_LAUNCH = {
  clinician: [
    { label: 'Open Protocol Builder', page: 'protocol-builder', icon: '🧩' },
    { label: 'Start Session Monitor', page: 'session-monitor',  icon: '📡' },
    { label: 'AI Note Assistant',     page: 'ai-note-assistant', icon: '✦' },
  ],
  researcher: [
    { label: 'Evidence Library',  page: 'literature',       icon: '📚' },
    { label: 'IRB Manager',       page: 'irb-manager',      icon: '🔬' },
    { label: 'Export Data',       page: 'data-export',      icon: '📤' },
  ],
  admin: [
    { label: 'Clinic Analytics',   page: 'clinic-analytics', icon: '📊' },
    { label: 'Staff Scheduling',   page: 'staff-scheduling',  icon: '📅' },
    { label: 'Multi-Site View',    page: 'multi-site',        icon: '🏢' },
  ],
  guardian: [
    { label: 'Guardian Portal',  page: 'guardian-portal', icon: '👨‍👩‍👧' },
    { label: 'Patient Outcomes', page: 'pt-outcomes',     icon: '📈' },
    { label: 'Symptom Journal',  page: 'pt-journal',       icon: '📓' },
  ],
};

// ── Demo data seed ────────────────────────────────────────────────────────────
function _seedDemoData() {
  const ts = Date.now();

  if (!localStorage.getItem('ds_patients')) {
    localStorage.setItem('ds_patients', JSON.stringify([
      { id: 'demo-pt-001', name: 'Alex Johnson',  dob: '1985-03-12', condition: 'MDD',         status: 'active',   age: 40 },
      { id: 'demo-pt-002', name: 'Morgan Lee',    dob: '1992-07-24', condition: 'PTSD + ADHD', status: 'active',   age: 33 },
      { id: 'demo-pt-003', name: 'Jordan Smith',  dob: '1978-11-05', condition: 'Bipolar I',   status: 'active',   age: 47 },
      { id: 'demo-pt-004', name: 'Casey Williams',dob: '2001-02-18', condition: 'Anxiety',     status: 'inactive', age: 24 },
      { id: 'demo-pt-005', name: 'Riley Davis',   dob: '1970-09-30', condition: 'Chronic Pain', status: 'active',  age: 55 },
    ]));
  }

  if (!localStorage.getItem('ds_protocols')) {
    localStorage.setItem('ds_protocols', JSON.stringify([
      { id: 'demo-proto-001', name: 'TMS — MDD Protocol',          condition: 'MDD',         modality: 'TMS',          sessions: 30, status: 'active' },
      { id: 'demo-proto-002', name: 'Neurofeedback — ADHD Alpha',  condition: 'ADHD',        modality: 'Neurofeedback', sessions: 20, status: 'active' },
      { id: 'demo-proto-003', name: 'tDCS — Chronic Pain Left',    condition: 'Chronic Pain',modality: 'tDCS',          sessions: 15, status: 'draft'  },
      { id: 'demo-proto-004', name: 'PEMF — PTSD Theta Reset',     condition: 'PTSD',        modality: 'PEMF',          sessions: 12, status: 'active' },
    ]));
  }

  if (!localStorage.getItem('ds_sessions')) {
    const sessions = [];
    for (let i = 0; i < 8; i++) {
      const d = new Date(ts - i * 86400000 * 3);
      sessions.push({
        id: `demo-sess-${i + 1}`,
        patientId: `demo-pt-00${(i % 3) + 1}`,
        protocolId: `demo-proto-00${(i % 4) + 1}`,
        date: d.toISOString().slice(0, 10),
        duration: 20 + Math.floor(Math.random() * 20),
        status: i < 2 ? 'pending_review' : 'completed',
        notes: i % 2 === 0 ? 'Patient tolerated well. No adverse effects.' : 'Mild headache post-session, resolved within 30 min.',
      });
    }
    localStorage.setItem('ds_sessions', JSON.stringify(sessions));
  }

  if (!localStorage.getItem('ds_appointments')) {
    const appts = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(ts + (i + 1) * 86400000 * 2);
      appts.push({
        id: `demo-appt-${i + 1}`,
        patientId: `demo-pt-00${(i % 3) + 1}`,
        patientName: ['Alex Johnson', 'Morgan Lee', 'Jordan Smith'][i % 3],
        date: d.toISOString().slice(0, 10),
        time: `${9 + i}:00`,
        type: i % 2 === 0 ? 'TMS Session' : 'Neurofeedback',
        status: 'scheduled',
      });
    }
    localStorage.setItem('ds_appointments', JSON.stringify(appts));
  }

  return 5; // number of demo patients seeded
}

// ── Step dots HTML ─────────────────────────────────────────────────────────────
function _wizDots(currentStep, total = 6) {
  return `<div class="onboarding-steps">${
    Array.from({ length: total }, (_, i) => {
      const n = i + 1;
      let cls = 'onboarding-step-dot';
      if (n < currentStep)  cls += ' done';
      if (n === currentStep) cls += ' active';
      return `<div class="${cls}" title="Step ${n}"></div>`;
    }).join('')
  }</div>`;
}

// ── Step 1: Welcome ───────────────────────────────────────────────────────────
function _wizStep1() {
  return `
    <div class="onboarding-card" id="wiz-step-1">
      ${_wizDots(1)}
      <div style="text-align:center;margin-bottom:32px">
        <div style="font-size:48px;margin-bottom:16px">🧠</div>
        <h1 style="font-size:26px;font-weight:800;color:var(--text-primary);margin:0 0 12px">
          Welcome to DeepSynaps Protocol Studio
        </h1>
        <p style="font-size:14px;color:var(--text-secondary);line-height:1.65;max-width:480px;margin:0 auto">
          The evidence-based platform for neuromodulation clinicians. Let's get your workspace set up in under two minutes.
        </p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:36px">
        <div style="background:linear-gradient(135deg,var(--card-bg,var(--bg-card)) 0%,rgba(0,212,188,0.03) 100%);border:1px solid rgba(0,212,188,0.2);border-radius:12px;padding:16px;text-align:center">
          <div style="width:40px;height:40px;border-radius:50%;background:rgba(0,212,188,0.15);display:flex;align-items:center;justify-content:center;font-size:20px;margin:0 auto 10px">📋</div>
          <div style="font-size:12.5px;font-weight:700;color:var(--text-primary);margin-bottom:4px">Evidence-Based Protocols</div>
          <div style="font-size:11px;color:var(--text-secondary);line-height:1.5">Backed by peer-reviewed research across 15+ conditions</div>
        </div>
        <div style="background:linear-gradient(135deg,var(--card-bg,var(--bg-card)) 0%,rgba(59,130,246,0.03) 100%);border:1px solid rgba(59,130,246,0.2);border-radius:12px;padding:16px;text-align:center">
          <div style="width:40px;height:40px;border-radius:50%;background:rgba(59,130,246,0.15);display:flex;align-items:center;justify-content:center;font-size:20px;margin:0 auto 10px">👥</div>
          <div style="font-size:12.5px;font-weight:700;color:var(--text-primary);margin-bottom:4px">Complete Patient Management</div>
          <div style="font-size:11px;color:var(--text-secondary);line-height:1.5">From intake to outcomes in one unified workspace</div>
        </div>
        <div style="background:linear-gradient(135deg,var(--card-bg,var(--bg-card)) 0%,rgba(139,92,246,0.03) 100%);border:1px solid rgba(139,92,246,0.2);border-radius:12px;padding:16px;text-align:center">
          <div style="width:40px;height:40px;border-radius:50%;background:rgba(139,92,246,0.15);display:flex;align-items:center;justify-content:center;font-size:20px;margin:0 auto 10px">📊</div>
          <div style="font-size:12.5px;font-weight:700;color:var(--text-primary);margin-bottom:4px">Research-Grade Analytics</div>
          <div style="font-size:11px;color:var(--text-secondary);line-height:1.5">Export BIDS-compliant data and benchmark outcomes</div>
        </div>
      </div>
      <div style="display:flex;justify-content:center">
        <button class="btn btn-primary" style="padding:13px 48px;font-size:15px;font-weight:700"
          onclick="window._wizGo(2)">Get Started →</button>
      </div>
      <div style="text-align:center;margin-top:14px">
        <a href="#" style="font-size:12px;color:var(--text-tertiary);text-decoration:none"
          onclick="window._wizSkip(event)">Skip setup — take me to the dashboard</a>
      </div>
    </div>`;
}

// ── Step 2: Clinic Profile ────────────────────────────────────────────────────
function _wizStep2() {
  const saved = _wiz;
  const clinicTypes = ['Private Practice', 'Hospital-Based', 'Research Center', 'Telehealth', 'Multi-Site'];
  const modalities  = ['TMS', 'Neurofeedback', 'tDCS', 'Biofeedback', 'PEMF', 'HEG', 'Multi-modal'];
  const counts      = ['1', '2-5', '6-15', '16+'];
  return `
    <div class="onboarding-card" id="wiz-step-2">
      ${_wizDots(2)}
      <div style="text-align:center;margin-bottom:28px">
        <div style="font-size:32px;margin-bottom:10px">🏥</div>
        <h2 style="font-size:20px;font-weight:700;color:var(--text-primary);margin:0 0 6px">Clinic Profile</h2>
        <p style="font-size:13px;color:var(--text-secondary);margin:0">Tell us about your practice so we can personalise your experience.</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px;margin-bottom:24px">
        <div class="form-group">
          <label class="form-label">Clinic Name</label>
          <input id="wiz-clinic-name" class="form-control" type="text"
            value="${_obEsc(saved.clinicName)}" placeholder="e.g. Synapse Wellness Clinic" />
        </div>
        <div class="form-group">
          <label class="form-label">Clinic Type</label>
          <select id="wiz-clinic-type" class="form-control">
            <option value="">Select type…</option>
            ${clinicTypes.map(t => `<option value="${t}" ${saved.clinicType === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" style="margin-bottom:10px">Primary Modalities</label>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${modalities.map(m => `
              <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;color:var(--text-secondary)">
                <input type="checkbox" id="wiz-mod-${m.replace(/\s/g,'-')}" value="${m}"
                  ${(saved.modalities || []).includes(m) ? 'checked' : ''}
                  style="accent-color:var(--accent-teal,#00d4bc)" />
                ${m}
              </label>`).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Number of Clinicians</label>
          <select id="wiz-clinician-count" class="form-control">
            <option value="">Select…</option>
            ${counts.map(c => `<option value="${c}" ${saved.clinicianCount === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="display:flex;gap:12px;justify-content:flex-end">
        <button class="btn onboarding-nav-btn" onclick="window._wizGo(1)">← Back</button>
        <button class="btn btn-primary onboarding-nav-btn" onclick="window._wizSaveClinic()">Continue →</button>
      </div>
    </div>`;
}

// ── Step 3: Your Role ─────────────────────────────────────────────────────────
function _wizStep3() {
  const roles = [
    { id: 'clinician', icon: '🩺', title: 'Clinician',    desc: 'I treat patients directly' },
    { id: 'researcher',icon: '🔬', title: 'Researcher',   desc: 'I conduct clinical studies' },
    { id: 'admin',     icon: '🏥', title: 'Clinic Admin', desc: 'I manage operations' },
    { id: 'guardian',  icon: '👨‍👩‍👧', title: 'Guardian',    desc: 'I support a family member' },
  ];
  return `
    <div class="onboarding-card" id="wiz-step-3">
      ${_wizDots(3)}
      <div style="text-align:center;margin-bottom:28px">
        <div style="font-size:32px;margin-bottom:10px">👤</div>
        <h2 style="font-size:20px;font-weight:700;color:var(--text-primary);margin:0 0 6px">Your Role</h2>
        <p style="font-size:13px;color:var(--text-secondary);margin:0">We'll customise your workspace based on how you use the platform.</p>
      </div>
      <div class="onboarding-role-grid" style="margin-bottom:24px">
        ${roles.map(r => `
          <div class="onboarding-role-card${_wiz.role === r.id ? ' selected' : ''}"
            id="wiz-role-${r.id}"
            onclick="window._wizSelectRole('${r.id}')">
            <div style="font-size:28px;margin-bottom:8px">${r.icon}</div>
            <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:4px">${r.title}</div>
            <div style="font-size:12px;color:var(--text-secondary)">${r.desc}</div>
          </div>`).join('')}
      </div>
      <div id="wiz-role-err" style="display:none;color:var(--rose,#f43f5e);font-size:12px;text-align:center;margin-bottom:8px">
        Please select a role to continue.
      </div>
      <div style="display:flex;gap:12px;justify-content:flex-end">
        <button class="btn onboarding-nav-btn" onclick="window._wizGo(2)">← Back</button>
        <button class="btn btn-primary onboarding-nav-btn" onclick="window._wizSaveRole()">Continue →</button>
      </div>
    </div>`;
}

// ── Step 4: Import or Start Fresh ─────────────────────────────────────────────
function _wizStep4() {
  return `
    <div class="onboarding-card" id="wiz-step-4">
      ${_wizDots(4)}
      <div style="text-align:center;margin-bottom:28px">
        <div style="font-size:32px;margin-bottom:10px">📂</div>
        <h2 style="font-size:20px;font-weight:700;color:var(--text-primary);margin:0 0 6px">Import or Start Fresh</h2>
        <p style="font-size:13px;color:var(--text-secondary);margin:0">How would you like to populate your workspace?</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <div style="border:2px solid var(--border);border-radius:12px;padding:24px;cursor:pointer;transition:border-color 0.2s;text-align:center"
          id="wiz-card-import"
          onmouseover="this.style.borderColor='var(--accent-teal,#00d4bc)'"
          onmouseout="this.style.borderColor='${_wiz.dataChoice==='import' ? 'var(--accent-teal,#00d4bc)' : 'var(--border)'}'"
          onclick="window._wizChooseImport()">
          <div style="font-size:32px;margin-bottom:12px">📥</div>
          <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:6px">Import Existing Data</div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">Have patient records or protocols? Import CSV or JSON</div>
        </div>
        <div style="border:2px solid var(--border);border-radius:12px;padding:24px;cursor:pointer;transition:border-color 0.2s;text-align:center"
          id="wiz-card-sample"
          onmouseover="this.style.borderColor='var(--accent-teal,#00d4bc)'"
          onmouseout="this.style.borderColor='${_wiz.dataChoice==='sample' ? 'var(--accent-teal,#00d4bc)' : 'var(--border)'}'"
          onclick="window._wizChooseSample()">
          <div style="font-size:32px;margin-bottom:12px">🎯</div>
          <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:6px">Start with Sample Data</div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">We'll set up demo patients, protocols, and sessions so you can explore immediately</div>
        </div>
      </div>
      <div id="wiz-data-msg" style="display:none;font-size:12.5px;color:var(--accent-teal,#00d4bc);text-align:center;margin-bottom:8px;padding:8px;background:rgba(0,212,188,0.06);border-radius:8px"></div>
      <div style="display:flex;gap:12px;justify-content:space-between;align-items:center">
        <button class="btn onboarding-nav-btn" onclick="window._wizGo(3)">← Back</button>
        <div style="display:flex;gap:8px;align-items:center">
          <a href="#" style="font-size:12px;color:var(--text-tertiary);text-decoration:none" onclick="window._wizSkipData(event)">Skip for now</a>
          <button class="btn btn-primary onboarding-nav-btn" onclick="window._wizGo(5)">Continue →</button>
        </div>
      </div>
    </div>`;
}

// ── Step 5: Feature Tour ──────────────────────────────────────────────────────
function _wizStep5() {
  const role     = _wiz.role || 'clinician';
  const features = ROLE_FEATURES[role] || ROLE_FEATURES.clinician;
  const roleLabel = { clinician: 'Clinician', researcher: 'Researcher', admin: 'Clinic Admin', guardian: 'Guardian' }[role] || 'Clinician';
  return `
    <div class="onboarding-card" id="wiz-step-5">
      ${_wizDots(5)}
      <div style="text-align:center;margin-bottom:28px">
        <div style="font-size:32px;margin-bottom:10px">🗺️</div>
        <h2 style="font-size:20px;font-weight:700;color:var(--text-primary);margin:0 0 6px">${roleLabel} Feature Tour</h2>
        <p style="font-size:13px;color:var(--text-secondary);margin:0">Here are the key tools built for your role.</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px">
        ${features.map(f => {
          const typeMap = { clinician:'clinical', researcher:'research', admin:'admin', guardian:'patient' };
          const dtype = typeMap[role] || 'clinical';
          return `
          <div class="onboarding-feature-card" data-type="${dtype}">
            <div style="font-size:22px;margin-bottom:8px">${f.icon}</div>
            <div style="font-size:13.5px;font-weight:600;color:var(--text-primary);margin-bottom:4px">${f.name}</div>
            <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:10px">${f.desc}</div>
            <a href="#" class="onboarding-explore-btn"
              onclick="window._wizExplore('${f.page}',event)">Explore →</a>
          </div>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:12px;justify-content:flex-end">
        <button class="btn onboarding-nav-btn" onclick="window._wizGo(4)">← Back</button>
        <button class="btn btn-primary onboarding-nav-btn" onclick="window._wizGo(6)">Continue →</button>
      </div>
    </div>`;
}

// ── Step 6: Setup Complete ────────────────────────────────────────────────────
function _wizStep6() {
  const role      = _wiz.role || 'clinician';
  const roleLabel = { clinician: 'Clinician', researcher: 'Researcher', admin: 'Admin', guardian: 'Guardian' }[role] || 'Clinician';
  const quick     = ROLE_QUICK_LAUNCH[role] || ROLE_QUICK_LAUNCH.clinician;
  const ptCount   = _wiz.dataChoice === 'sample' ? 5 : 0;
  const ptMsg     = ptCount > 0
    ? `<div style="font-size:13.5px;color:var(--text-secondary);margin-bottom:24px">Your <strong style="color:var(--text-primary)">${ptCount} sample patients</strong> are loaded and ready to explore.</div>`
    : '';
  return `
    <div class="onboarding-card" id="wiz-step-6" style="text-align:center">
      ${_wizDots(6)}
      <div id="wiz-confetti-anchor"></div>
      <div style="width:80px;height:80px;border-radius:50%;background:rgba(0,212,188,0.12);border:2px solid rgba(0,212,188,0.4);display:flex;align-items:center;justify-content:center;font-size:36px;margin:0 auto 20px;box-shadow:0 0 32px rgba(0,212,188,0.25)">✓</div>
      <h2 style="font-size:24px;font-weight:800;color:var(--accent-teal,#00d4bc);margin:0 0 8px">Setup Complete!</h2>
      <div style="font-size:15px;color:var(--text-primary);margin-bottom:8px">Your <strong>${roleLabel}</strong> workspace is ready.</div>
      ${ptMsg}
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:28px">
        ${quick.map(q => `
          <button class="btn" style="padding:12px 8px;flex-direction:column;gap:6px;font-size:12px;border:1px solid var(--border)"
            onclick="window._wizFinish('${q.page}')">
            <span style="font-size:20px">${q.icon}</span>
            <span>${q.label}</span>
          </button>`).join('')}
      </div>
      <button class="btn btn-primary onboarding-finish-btn" style="font-weight:700"
        onclick="window._wizFinish('dashboard')">Go to Dashboard →</button>
    </div>`;
}

// ── Render / show step ─────────────────────────────────────────────────────────
function _renderWizStep(step) {
  _wiz.step = step;
  const fns = [null, _wizStep1, _wizStep2, _wizStep3, _wizStep4, _wizStep5, _wizStep6];
  const renderFn = fns[step];
  if (!renderFn) return;

  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay) return;

  overlay.querySelector('.onboarding-overlay-inner').innerHTML = renderFn();

  // Fire confetti on step 6
  if (step === 6) _launchConfetti();
}

// ── Confetti ──────────────────────────────────────────────────────────────────
function _launchConfetti() {
  const colors = ['#00d4bc', '#3b82f6', '#8b5cf6', '#f59e0b', '#f43f5e', '#10b981', '#06b6d4', '#ec4899'];
  for (let i = 0; i < 30; i++) {
    const dot = document.createElement('div');
    dot.className = 'confetti-dot';
    dot.style.cssText = `
      left:${Math.random() * 100}vw;
      top:-12px;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      animation-delay:${(Math.random() * 1.2).toFixed(2)}s;
      animation-duration:${(1.5 + Math.random() * 1.5).toFixed(2)}s;
      width:${6 + Math.round(Math.random() * 6)}px;
      height:${6 + Math.round(Math.random() * 6)}px;
    `;
    document.body.appendChild(dot);
    dot.addEventListener('animationend', () => dot.remove());
  }
}

// ── Global wizard handlers ─────────────────────────────────────────────────────
window._wizGo = function(step) {
  _renderWizStep(step);
};

window._wizSkip = function(e) {
  e?.preventDefault();
  localStorage.setItem('ds_onboarding_skip', '1');
  document.getElementById('onboarding-overlay')?.remove();
  window._nav?.('dashboard');
};

window._wizSaveClinic = async function() {
  _wiz.clinicName      = document.getElementById('wiz-clinic-name')?.value.trim() || '';
  _wiz.clinicType      = document.getElementById('wiz-clinic-type')?.value || '';
  _wiz.clinicianCount  = document.getElementById('wiz-clinician-count')?.value || '';

  const mods = [];
  ['TMS','Neurofeedback','tDCS','Biofeedback','PEMF','HEG','Multi-modal'].forEach(m => {
    const cb = document.getElementById(`wiz-mod-${m.replace(/\s/g,'-')}`);
    if (cb?.checked) mods.push(m);
  });
  _wiz.modalities = mods;

  // Local mirror (used as offline fallback by pgClinicSettings read path).
  try {
    const existing = JSON.parse(localStorage.getItem('ds_clinic_config') || '{}');
    localStorage.setItem('ds_clinic_config', JSON.stringify({
      ...existing,
      name:            _wiz.clinicName,
      type:            _wiz.clinicType,
      modalities:      _wiz.modalities,
      clinicianCount:  _wiz.clinicianCount,
      updatedAt:       new Date().toISOString(),
    }));
  } catch {}

  // Round-trip to backend: upsert clinic row via create/update. Silent on
  // network failure so unauthenticated visitors (public pre-signup flow) can
  // still progress through the wizard — the real save happens on next entry
  // once their session is live.
  if (_wiz.clinicName) {
    try {
      const existing = await api.getClinic().catch(() => null);
      const payload = {
        name:        _wiz.clinicName,
        specialties: _wiz.modalities,
      };
      if (existing && (existing.id || existing.name)) {
        await api.updateClinic(payload);
      } else {
        await api.createClinic(payload);
      }
    } catch (err) {
      console.warn('[wiz] clinic save skipped:', err?.message || err);
    }
  }

  _renderWizStep(3);
};

window._wizSelectRole = function(roleId) {
  _wiz.role = roleId;
  document.querySelectorAll('.onboarding-role-card').forEach(el => el.classList.remove('selected'));
  document.getElementById(`wiz-role-${roleId}`)?.classList.add('selected');
  const errEl = document.getElementById('wiz-role-err');
  if (errEl) errEl.style.display = 'none';
};

window._wizSaveRole = function() {
  if (!_wiz.role) {
    const errEl = document.getElementById('wiz-role-err');
    if (errEl) errEl.style.display = 'block';
    return;
  }
  try { localStorage.setItem('ds_user_role_onboarding', _wiz.role); } catch {}
  _renderWizStep(4);
};

window._wizChooseImport = function() {
  _wiz.dataChoice = 'import';
  // Flag for data-import page awareness
  try { localStorage.setItem('ds_onboarding_import_pending', '1'); } catch {}
  const msg = document.getElementById('wiz-data-msg');
  if (msg) {
    msg.textContent = 'Got it — visit Data Import after setup to bring in your records.';
    msg.style.display = 'block';
  }
  // Highlight selected card
  const importCard = document.getElementById('wiz-card-import');
  const sampleCard = document.getElementById('wiz-card-sample');
  if (importCard) importCard.style.borderColor = 'var(--accent-teal,#00d4bc)';
  if (sampleCard) sampleCard.style.borderColor = 'var(--border)';
};

window._wizChooseSample = function() {
  _wiz.dataChoice = 'sample';
  const count = _seedDemoData();
  const msg = document.getElementById('wiz-data-msg');
  if (msg) {
    msg.textContent = `Demo data loaded — ${count} patients, 4 protocols, 8 sessions, and 5 appointments are ready.`;
    msg.style.display = 'block';
  }
  const importCard = document.getElementById('wiz-card-import');
  const sampleCard = document.getElementById('wiz-card-sample');
  if (sampleCard) sampleCard.style.borderColor = 'var(--accent-teal,#00d4bc)';
  if (importCard) importCard.style.borderColor = 'var(--border)';
};

window._wizSkipData = function(e) {
  e?.preventDefault();
  _wiz.dataChoice = 'skip';
  _renderWizStep(5);
};

window._wizExplore = function(page, e) {
  e?.preventDefault();
  // Close wizard, navigate to page, but do NOT mark onboarding complete
  // (so they can return to wizard if needed via url)
  document.getElementById('onboarding-overlay')?.remove();
  window._nav?.(page);
};

window._wizFinish = function(page) {
  localStorage.setItem('ds_onboarding_complete', 'true');
  localStorage.removeItem('ds_onboarding_skip');
  // Remove overlay
  document.getElementById('onboarding-overlay')?.remove();
  // Navigate
  window._nav?.(page || 'dashboard');
};

// ── Overlay builder ───────────────────────────────────────────────────────────
function _buildWizOverlay() {
  // Remove existing if any
  document.getElementById('onboarding-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'onboarding-overlay';
  overlay.className = 'onboarding-overlay';
  overlay.innerHTML = `
    <div class="onboarding-overlay-inner" style="width:100%;display:flex;align-items:center;justify-content:center;padding:24px"></div>
    <a href="#" class="onboarding-skip-link" onclick="window._wizSkip(event)">Skip setup</a>`;
  document.body.appendChild(overlay);
  _renderWizStep(1);
}

// ── Entry point ───────────────────────────────────────────────────────────────
export async function pgOnboardingWizard(setTopbar) {
  setTopbar('Setup Wizard', '');
  // Reset wizard state for a fresh run
  _wiz = { step: 1, clinicName: '', clinicType: '', modalities: [], clinicianCount: '', role: '', dataChoice: '', complete: false };

  // Restore any previously saved clinic config / role
  try {
    const cc = JSON.parse(localStorage.getItem('ds_clinic_config') || '{}');
    if (cc.name)           _wiz.clinicName     = cc.name;
    if (cc.type)           _wiz.clinicType     = cc.type;
    if (cc.modalities)     _wiz.modalities     = cc.modalities;
    if (cc.clinicianCount) _wiz.clinicianCount = cc.clinicianCount;
  } catch {}
  try {
    const savedRole = localStorage.getItem('ds_user_role_onboarding');
    if (savedRole) _wiz.role = savedRole;
  } catch {}

  const el = document.getElementById('content');
  if (el) {
    el.innerHTML = `
      <div style="max-width:680px;margin:0 auto;padding:40px 24px">
        <div id="wiz-inline-container"></div>
      </div>`;
    // For inline (page) rendering — build a pseudo-overlay anchored inside content
    const overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';
    // inline: no fixed positioning
    overlay.style.cssText = 'display:flex;align-items:flex-start;justify-content:center;';
    overlay.innerHTML = `<div class="onboarding-overlay-inner" style="width:100%;"></div>`;
    document.getElementById('wiz-inline-container').appendChild(overlay);
    _renderWizStep(1);
  }
}

// ── window._startOnboarding — full-screen overlay launcher ────────────────────
window._startOnboarding = function() {
  _wiz = { step: 1, clinicName: '', clinicType: '', modalities: [], clinicianCount: '', role: '', dataChoice: '', complete: false };
  try {
    const cc = JSON.parse(localStorage.getItem('ds_clinic_config') || '{}');
    if (cc.name)           _wiz.clinicName     = cc.name;
    if (cc.type)           _wiz.clinicType     = cc.type;
    if (cc.modalities)     _wiz.modalities     = cc.modalities;
    if (cc.clinicianCount) _wiz.clinicianCount = cc.clinicianCount;
  } catch {}
  try {
    const savedRole = localStorage.getItem('ds_user_role_onboarding');
    if (savedRole) _wiz.role = savedRole;
  } catch {}
  _buildWizOverlay();
};
