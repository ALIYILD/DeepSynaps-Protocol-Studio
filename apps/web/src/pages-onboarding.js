import { api } from './api.js';
import { currentUser } from './auth.js';
import { spinner } from './helpers.js';

// ── Module-level wizard state ─────────────────────────────────────────────────
let onboardingStep = 1;
let onboardingData = {};

// ── Step indicator pips + progress bar ───────────────────────────────────────
function pipHtml(step) {
  const pips = [1, 2, 3, 4].map(i => {
    let cls = 'step-pip';
    if (i < step)  cls += ' done';
    if (i === step) cls += ' active';
    const inner = i < step ? '✓' : i;
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px">
      <div class="${cls}" style="width:28px;height:28px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;
        ${i < step ? 'background:var(--teal);color:#fff;border:none;' : i === step ? 'background:var(--teal);color:#fff;box-shadow:0 0 12px var(--teal-glow);border:none;' : 'background:none;color:var(--text-tertiary);border:2px solid var(--border);'}">${inner}</div>
      <div style="font-size:9.5px;color:${i <= step ? 'var(--teal)' : 'var(--text-tertiary)'};text-transform:uppercase;letter-spacing:.5px;white-space:nowrap">
        ${['Practice', 'Patient', 'Protocol', 'Ready'][i - 1]}
      </div>
    </div>`;
  }).join(`<div style="flex:1;height:2px;background:${step > 1 ? 'var(--border)' : 'var(--border)'};margin-top:-14px;position:relative">
    <div style="position:absolute;top:0;left:0;height:100%;background:var(--teal);transition:width .4s;width:100%"></div>
  </div>`);

  const pct = (step - 1) / 3 * 100;
  return `
    <div style="display:flex;align-items:center;gap:0;margin-bottom:24px">
      ${pips}
    </div>
    <div style="height:3px;border-radius:2px;background:var(--border);margin-bottom:32px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--teal),var(--blue));border-radius:2px;transition:width .4s"></div>
    </div>`;
}

// ── Step 1 — Welcome & Practice Setup ────────────────────────────────────────
function step1Html() {
  const saved = onboardingData;
  return `
    <div id="onb-step-1" style="${onboardingStep === 1 ? '' : 'display:none'}">
      ${pipHtml(1)}
      <div style="text-align:center;margin-bottom:28px">
        <div style="font-size:36px;margin-bottom:10px">🧠</div>
        <div style="font-size:24px;font-weight:700;color:var(--text-primary);margin-bottom:8px">
          Welcome to DeepSynaps Protocol Studio
        </div>
        <div style="font-size:14px;color:var(--text-secondary);max-width:480px;margin:0 auto;line-height:1.6">
          Let's set up your clinic in a few quick steps so you can start managing patients and protocols right away.
        </div>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="card-body" style="display:flex;flex-direction:column;gap:16px">
          <div class="form-group">
            <label class="form-label">Practice Name</label>
            <input id="onb-practice-name" class="form-control" type="text"
              value="${saved.practiceName || ''}"
              placeholder="e.g. Synapse Wellness Clinic" />
          </div>
          <div class="form-group">
            <label class="form-label">Specialty</label>
            <select id="onb-specialty" class="form-control">
              <option value="">Select specialty…</option>
              ${['Neurofeedback', 'TMS', 'tDCS', 'Multi-modal', 'Other'].map(s =>
                `<option value="${s}" ${saved.specialty === s ? 'selected' : ''}>${s}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Number of Clinicians</label>
            <select id="onb-clinician-count" class="form-control">
              <option value="">Select…</option>
              ${['1', '2-5', '6-15', '15+'].map(s =>
                `<option value="${s}" ${saved.clinicianCount === s ? 'selected' : ''}>${s}</option>`
              ).join('')}
            </select>
          </div>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end">
        <button class="btn btn-primary" style="padding:10px 28px" onclick="window._onbNext(1)">Continue →</button>
      </div>
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
      <div style="text-align:center;margin-bottom:24px">
        <div style="font-size:20px;font-weight:600;color:var(--text-primary);margin-bottom:6px">
          Add your first patient
        </div>
        <div style="font-size:13px;color:var(--text-secondary)">
          You can always add more patients later from the Patients section.
        </div>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="card-body" style="display:flex;flex-direction:column;gap:16px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div class="form-group">
              <label class="form-label">First Name</label>
              <input id="onb-pt-first" class="form-control" type="text"
                value="${p.first_name || ''}" placeholder="First name" />
            </div>
            <div class="form-group">
              <label class="form-label">Last Name</label>
              <input id="onb-pt-last" class="form-control" type="text"
                value="${p.last_name || ''}" placeholder="Last name" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Date of Birth</label>
            <input id="onb-pt-dob" class="form-control" type="date"
              value="${p.dob || ''}" />
          </div>
          <div class="form-group">
            <label class="form-label">Primary Condition</label>
            <select id="onb-pt-condition" class="form-control">
              <option value="">Select condition…</option>
              ${CONDITIONS.map(c =>
                `<option value="${c}" ${p.primary_condition === c ? 'selected' : ''}>${c}</option>`
              ).join('')}
            </select>
          </div>
        </div>
      </div>

      <div id="onb-step2-err" style="display:none;color:var(--rose,var(--red));font-size:12.5px;margin-bottom:12px;text-align:center"></div>
      <div id="onb-step2-saving" style="display:none;text-align:center;margin-bottom:12px;color:var(--text-secondary);font-size:13px">Creating patient…</div>

      <div style="display:flex;gap:12px;justify-content:flex-end">
        <button class="btn" onclick="window._onbBack(2)">← Back</button>
        <button class="btn" style="color:var(--text-secondary)" onclick="window._onbSkipPatient()">Skip for now</button>
        <button class="btn btn-primary" id="onb-add-patient-btn" onclick="window._onbAddPatient()">Add Patient &amp; Continue →</button>
      </div>
    </div>`;
}

// ── Step 3 — Generate First Protocol ────────────────────────────────────────
function step3Html() {
  const p = onboardingData.patient;
  const prefillCond = p?.primary_condition || '';
  const patientName = p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : '';
  const MODALITIES = ['tDCS', 'TMS', 'tACS', 'PEMF', 'Neurofeedback', 'PBM'];

  return `
    <div id="onb-step-3" style="${onboardingStep === 3 ? '' : 'display:none'}">
      ${pipHtml(3)}
      <div style="text-align:center;margin-bottom:24px">
        <div style="font-size:20px;font-weight:600;color:var(--text-primary);margin-bottom:6px">
          Generate your first protocol
        </div>
        <div style="font-size:13px;color:var(--text-secondary)">
          ${patientName ? `For <strong style="color:var(--text-primary)">${patientName}</strong>. We'll` : "We'll"} generate an evidence-backed protocol recommendation based on the condition and modality.
        </div>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="card-body" style="display:flex;flex-direction:column;gap:16px">
          <div class="form-group">
            <label class="form-label">Condition</label>
            <input id="onb-proto-condition" class="form-control" type="text"
              value="${prefillCond}" placeholder="e.g. Depression" />
          </div>
          <div class="form-group">
            <label class="form-label">Modality</label>
            <select id="onb-proto-modality" class="form-control">
              <option value="">Select modality…</option>
              ${MODALITIES.map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Brief Symptoms / Notes <span style="color:var(--text-tertiary)">(optional)</span></label>
            <textarea id="onb-proto-symptoms" class="form-control" rows="3"
              placeholder="Describe key symptoms, severity, or relevant history…" style="resize:vertical"></textarea>
          </div>
        </div>
      </div>

      <div id="onb-proto-spinner" style="display:none;text-align:center;padding:12px;color:var(--text-secondary);font-size:13px">
        <div style="display:inline-flex;align-items:center;gap:10px">
          <div style="width:16px;height:16px;border:2px solid var(--border);border-top-color:var(--teal);border-radius:50%;animation:spin .8s linear infinite"></div>
          Generating protocol recommendation…
        </div>
      </div>
      <div id="onb-proto-preview" style="display:none;margin-bottom:16px">
        <div style="font-size:10.5px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Protocol Preview</div>
        <div id="onb-proto-preview-text" style="background:rgba(0,212,188,0.04);border:1px solid var(--border-teal);border-radius:8px;padding:14px;font-size:12.5px;color:var(--text-secondary);line-height:1.7;white-space:pre-wrap;max-height:160px;overflow-y:auto"></div>
      </div>
      <div id="onb-step3-err" style="display:none;color:var(--rose,var(--red));font-size:12.5px;margin-bottom:12px;text-align:center"></div>

      <div style="display:flex;gap:12px;justify-content:flex-end">
        <button class="btn" onclick="window._onbBack(3)">← Back</button>
        <button class="btn" style="color:var(--text-secondary)" onclick="window._onbSkipProtocol()">Skip for now</button>
        <button class="btn btn-primary" id="onb-gen-btn" onclick="window._onbGenerateProtocol()">Generate Protocol →</button>
      </div>
    </div>`;
}

// ── Step 4 — You're Ready! ────────────────────────────────────────────────────
function step4Html() {
  return `
    <div id="onb-step-4" style="${onboardingStep === 4 ? '' : 'display:none'}">
      ${pipHtml(4)}
      <div style="text-align:center;margin-bottom:32px">
        <div style="width:72px;height:72px;border-radius:50%;background:rgba(0,212,188,0.12);border:2px solid var(--border-teal);display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 16px;box-shadow:0 0 24px var(--teal-glow)">✓</div>
        <div style="font-size:24px;font-weight:700;color:var(--teal);margin-bottom:8px">Your clinic is set up!</div>
        <div style="font-size:14px;color:var(--text-secondary)">Here's where to go next.</div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:28px">
        <div class="onb-next-card" onclick="window._nav('patients')">
          <div class="onb-next-icon">👥</div>
          <div class="onb-next-title">View Patients →</div>
          <div class="onb-next-desc">Manage patient records and treatment histories.</div>
        </div>
        <div class="onb-next-card" onclick="window._nav('protocols-registry')">
          <div class="onb-next-icon">◇</div>
          <div class="onb-next-title">Browse Protocols →</div>
          <div class="onb-next-desc">Explore the evidence-backed protocol registry.</div>
        </div>
        <div class="onb-next-card" onclick="window._nav('ai-assistant')">
          <div class="onb-next-icon">✦</div>
          <div class="onb-next-title">Open AI Assistant →</div>
          <div class="onb-next-desc">Get AI-powered clinical decision support.</div>
        </div>
      </div>

      <div style="text-align:center">
        <button class="btn btn-primary" style="padding:13px 40px;font-size:15px"
          onclick="window._onbFinish()">Go to Dashboard →</button>
      </div>
    </div>`;
}

// ── Render full wizard ────────────────────────────────────────────────────────
function renderOnboarding(setTopbar) {
  setTopbar('Welcome to DeepSynaps', '');
  const el = document.getElementById('content');
  el.innerHTML = `
    <div style="max-width:640px;margin:0 auto;padding:40px 24px">
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:40px 36px;box-shadow:0 8px 40px rgba(0,0,0,0.3)">
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
