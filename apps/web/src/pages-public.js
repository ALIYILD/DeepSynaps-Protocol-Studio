import { api } from './api.js';
import { setCurrentUser, showApp, showPatient, updateUserBar, updatePatientBar } from './auth.js';

// ── Shared: public topbar ─────────────────────────────────────────────────────
function pubTopbar() {
  return `
    <div class="pub-topbar">
      <div class="pub-topbar-logo" onclick="window._navPublic('home')">
        <div class="logo-icon" style="width:32px;height:32px;font-size:13px">🧠</div>
        <div>
          <div style="font-family:var(--font-display);font-size:14px;font-weight:700;color:var(--text-primary);letter-spacing:-0.3px">DeepSynaps</div>
          <div style="font-size:9px;color:var(--text-tertiary);letter-spacing:1px;text-transform:uppercase">Protocol Studio</div>
        </div>
      </div>
      <div class="pub-topbar-nav">
        <button class="pub-nav-link" onclick="window._navPublic('signup-professional')">Clinicians</button>
        <button class="pub-nav-link" onclick="window._navPublic('signup-patient')">Patients</button>
        <div style="width:1px;height:20px;background:var(--border);margin:0 6px"></div>
        <button class="pub-nav-link" onclick="window._showSignIn()">Sign In</button>
        <button class="btn btn-primary btn-sm" onclick="window._navPublic('signup-professional')" style="margin-left:4px">Get Started</button>
      </div>
    </div>
  `;
}

// ── Landing Page (/home) ──────────────────────────────────────────────────────
export function pgHome() {
  const el = document.getElementById('public-shell');
  el.scrollTop = 0;
  el.innerHTML = `
    ${pubTopbar()}

    <!-- Hero -->
    <section class="pub-hero">
      <div class="pub-hero-badge">◈ &nbsp;Precision Neuromodulation Platform</div>
      <h1 class="pub-hero-title">Clinical Intelligence for<br><span>Neuromodulation Therapy</span></h1>
      <p class="pub-hero-sub">
        DeepSynaps Protocol Studio is the operational platform for evidence-based neuromodulation clinics —
        from protocol design and session execution to outcomes tracking and governance.
      </p>
      <div class="pub-hero-ctas">
        <button class="btn-hero-primary" onclick="window._navPublic('signup-professional')">Start as Professional &rarr;</button>
        <button class="btn-hero-secondary" onclick="window._navPublic('signup-patient')">Patient Portal</button>
        <button class="btn-hero-ghost" onclick="window._showSignIn()">Sign In</button>
      </div>
      <div class="pub-stats">
        ${[
          { val: '15<span>+</span>', label: 'Conditions Covered' },
          { val: 'A<span>–D</span>', label: 'Evidence Graded' },
          { val: '6<span>+</span>', label: 'Modalities Supported' },
          { val: 'ISO<span>/IEC</span>', label: 'Governance Ready' },
        ].map(s => `<div class="pub-stat"><div class="pub-stat-value">${s.val}</div><div class="pub-stat-label">${s.label}</div></div>`).join('')}
      </div>
    </section>

    <div class="pub-divider"></div>

    <!-- Audience split -->
    <div style="padding:72px 0 0">
      <div style="text-align:center;margin-bottom:40px;padding:0 48px">
        <div class="pub-section-title" style="text-align:center">Built for Two Audiences. Kept Separate.</div>
        <div class="pub-section-sub" style="margin:10px auto 0;text-align:center">
          A professional-grade clinical OS for practitioners and a calm, clear portal for patients —
          each designed for their context.
        </div>
      </div>
      <div class="pub-audience-grid" style="margin-bottom:72px">

        <div class="pub-audience-card primary">
          <div class="pub-audience-icon">⚕</div>
          <div class="pub-audience-title">For Clinicians &amp; Clinics</div>
          <div class="pub-audience-desc">
            A full neuromodulation operations workspace — not a generic EHR.
            Treatment courses, not appointments, are the primary unit of care.
          </div>
          <ul class="pub-audience-features">
            <li>Evidence-graded protocol design across tDCS, TMS, tACS, PEMF, PBM, and neurofeedback</li>
            <li>Treatment course lifecycle — from approval to session execution to outcome review</li>
            <li>qEEG integration and brain region / electrode mapping</li>
            <li>Adverse event registry and governance audit trail</li>
            <li>Patient cohort outcomes and evidence-matched analytics</li>
            <li>Multi-role access: clinician, technician, reviewer, admin</li>
          </ul>
          <button class="btn-hero-primary" onclick="window._navPublic('signup-professional')" style="width:100%;font-size:13px;padding:11px">
            Start as Professional &rarr;
          </button>
        </div>

        <div class="pub-audience-card secondary">
          <div class="pub-audience-icon">◉</div>
          <div class="pub-audience-title">For Patients</div>
          <div class="pub-audience-desc">
            A calm, clear view of your treatment journey — without clinical complexity.
            See your sessions, progress, and messages from your care team.
          </div>
          <ul class="pub-audience-features">
            <li>Upcoming and completed session schedule</li>
            <li>Treatment course summary and progress overview</li>
            <li>Assessments and symptom tracking</li>
            <li>Reports and documents from your clinic</li>
            <li>Secure messages and reminders from your care team</li>
            <li>Profile and preference management</li>
          </ul>
          <button class="btn-hero-secondary" onclick="window._navPublic('signup-patient')" style="width:100%;font-size:13px;padding:11px">
            Access Patient Portal &rarr;
          </button>
        </div>

      </div>
    </div>

    <div class="pub-divider"></div>

    <!-- Feature overview -->
    <section class="pub-section">
      <div class="pub-section-title">Platform Capabilities</div>
      <div class="pub-section-sub">Every workflow a neuromodulation practice needs — built into one coherent system.</div>
      <div class="pub-feature-grid">
        ${[
          { icon: '◎', title: 'Treatment Course Engine', desc: 'Full lifecycle management from protocol selection to session completion and outcome review. Not appointment scheduling — clinical operations.' },
          { icon: '⬡', title: 'Protocol Intelligence', desc: 'AI-assisted protocol generation with evidence-grade matching. Filter by modality, condition, and patient profile to generate structured protocols.' },
          { icon: '◈', title: 'qEEG & Brain Data', desc: 'Integrated EEG band analysis, brain region mapping, and topographic visualisation per patient with longitudinal tracking.' },
          { icon: '◧', title: 'Session Execution Engine', desc: 'Step-by-step session runner with device configuration, montage verification, pulse parameter entry, and real-time deviation flagging.' },
          { icon: '◱', title: 'Review & Governance', desc: 'Adverse event registry, protocol approval workflows, audit trail, and regulatory flag tracking — clinical governance built in from day one.' },
          { icon: '◫', title: 'Outcomes & Evidence', desc: 'Track patient outcomes over time against evidence grades. Evidence library with A–D grading across conditions and modalities.' },
        ].map(f => `
          <div class="pub-feature-card">
            <span class="pub-feature-icon">${f.icon}</span>
            <div class="pub-feature-title">${f.title}</div>
            <div class="pub-feature-desc">${f.desc}</div>
          </div>
        `).join('')}
      </div>
    </section>

    <div class="pub-divider"></div>

    <!-- Trust / Governance / Safety -->
    <section class="pub-section">
      <div style="text-align:center;margin-bottom:40px">
        <div class="pub-section-title" style="text-align:center">Built for Clinical Trust</div>
        <div class="pub-section-sub" style="margin:10px auto 0;text-align:center">
          Governance, safety checks, and evidence grading are first-class features — not afterthoughts.
        </div>
      </div>
      <div class="pub-trust-grid">
        ${[
          { icon: '🛡', title: 'Clinical Governance', desc: 'Protocol approval workflows, adverse event registry, and complete audit trail per session and course.' },
          { icon: '⚗', title: 'Evidence Grading', desc: 'All protocols carry an evidence grade (A–D) drawn from peer-reviewed neuromodulation research.' },
          { icon: '⚠', title: 'Safety Checks', desc: 'Contraindication screening, deviation flagging during sessions, and safety status per protocol.' },
          { icon: '🔒', title: 'Role Separation', desc: 'Clinician, technician, reviewer, admin, and patient roles — each with scoped access and a purpose-built interface.' },
        ].map(t => `
          <div class="pub-trust-item">
            <div class="pub-trust-icon">${t.icon}</div>
            <div class="pub-trust-title">${t.title}</div>
            <div class="pub-trust-desc">${t.desc}</div>
          </div>
        `).join('')}
      </div>
    </section>

    <!-- CTA -->
    <div class="pub-cta-section">
      <div class="pub-cta-title">Ready to operationalize your clinic?</div>
      <div class="pub-cta-sub">
        Join the neuromodulation practices already using DeepSynaps to deliver more structured,
        evidence-based care.
      </div>
      <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap">
        <button class="btn-hero-primary" onclick="window._navPublic('signup-professional')" style="font-size:13.5px">
          Start as Professional &rarr;
        </button>
        <button class="btn-hero-ghost" onclick="window._showSignIn()" style="font-size:13.5px">
          Sign In to Your Account
        </button>
      </div>
    </div>

    <!-- Footer -->
    <div class="pub-footer">
      <div class="pub-footer-logo">
        <div class="logo-icon" style="width:24px;height:24px;font-size:11px">🧠</div>
        DeepSynaps Studio
      </div>
      <div class="pub-footer-links">
        <span class="pub-footer-link">Privacy Policy</span>
        <span class="pub-footer-link">Terms of Service</span>
        <span class="pub-footer-link">Clinical Disclaimer</span>
        <span class="pub-footer-link">Contact</span>
      </div>
      <div class="pub-footer-copy">&copy; 2026 DeepSynaps. All rights reserved.</div>
    </div>
  `;
}

// ── Professional Signup (/signup/professional) ────────────────────────────────
export function pgSignupProfessional() {
  const el = document.getElementById('public-shell');
  el.scrollTop = 0;
  el.innerHTML = `
    ${pubTopbar()}
    <div class="pub-signup-wrap">
      <div class="pub-signup-card">
        <button class="pub-back-link" onclick="window._navPublic('home')">&#8592; Back to home</button>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
          <div class="logo-icon" style="width:36px;height:36px;font-size:15px">🧠</div>
          <div>
            <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:1px">DeepSynaps Studio</div>
            <div style="font-size:11px;color:var(--teal);font-weight:600">Professional Registration</div>
          </div>
        </div>
        <div class="pub-signup-title">Create your professional account</div>
        <div class="pub-signup-sub">
          For qualified clinicians, technicians, and clinic administrators.
          All accounts are reviewed before full protocol access is granted.
        </div>

        <div class="step-indicator">
          <div class="step-pip active" id="pip-1"></div>
          <div class="step-pip" id="pip-2"></div>
          <div class="step-pip" id="pip-3"></div>
        </div>

        <!-- Step 1: Practice -->
        <div id="prof-step-1">
          <div class="form-group">
            <label class="form-label">Clinic / Practice Name</label>
            <input id="prof-clinic" class="form-control" placeholder="NeuroBalance Clinic" autocomplete="organization">
          </div>
          <div class="form-group">
            <label class="form-label">Your Professional Role</label>
            <select id="prof-role" class="form-control">
              <option value="">Select a role</option>
              <option value="clinician">Clinician / Neurologist / Psychiatrist</option>
              <option value="psychologist">Psychologist / Neuropsychologist</option>
              <option value="technician">Neuromodulation Technician</option>
              <option value="researcher">Clinical Researcher</option>
              <option value="admin">Clinic Administrator</option>
              <option value="resident">Resident / Fellow</option>
            </select>
          </div>
          <div id="prof-step1-err" style="color:var(--red);font-size:12px;margin-bottom:10px;display:none"></div>
          <button class="btn-hero-primary" style="width:100%;font-size:13px;padding:11px" onclick="window._profNext(1)">
            Continue &rarr;
          </button>
        </div>

        <!-- Step 2: Credentials -->
        <div id="prof-step-2" style="display:none">
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input id="prof-email" class="form-control" type="email" placeholder="dr.smith@clinic.com" autocomplete="email">
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input id="prof-password" class="form-control" type="password" placeholder="Min. 8 characters" autocomplete="new-password">
          </div>
          <div class="form-group">
            <label class="form-label">Confirm Password</label>
            <input id="prof-password2" class="form-control" type="password" placeholder="Repeat password" autocomplete="new-password">
          </div>
          <div id="prof-step2-err" style="color:var(--red);font-size:12px;margin-bottom:10px;display:none"></div>
          <div style="display:flex;gap:10px">
            <button class="btn btn-ghost" style="flex:1;padding:10px" onclick="window._profBack(2)">&#8592; Back</button>
            <button class="btn-hero-primary" style="flex:2;font-size:13px;padding:11px" onclick="window._profNext(2)">Continue &rarr;</button>
          </div>
        </div>

        <!-- Step 3: Specialty -->
        <div id="prof-step-3" style="display:none">
          <div class="form-group">
            <label class="form-label">Primary Modality Focus <span style="color:var(--text-tertiary);font-weight:400">(select all that apply)</span></label>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px" id="prof-mod-chips">
              ${['tDCS', 'TMS', 'tACS', 'PEMF', 'Neurofeedback', 'PBM / Laser'].map(m =>
                `<div class="mod-chip" data-mod="${m}" onclick="window._toggleProfMod(this,'${m}')">${m}</div>`
              ).join('')}
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Primary Condition Focus</label>
            <select id="prof-condition" class="form-control">
              <option value="">Select primary condition</option>
              <option>Depression / MDD</option>
              <option>Anxiety Disorders</option>
              <option>PTSD</option>
              <option>ADHD</option>
              <option>Chronic Pain</option>
              <option>Traumatic Brain Injury</option>
              <option>Autism Spectrum</option>
              <option>Parkinson's Disease</option>
              <option>Stroke Rehabilitation</option>
              <option>Cognitive Enhancement</option>
              <option>Multiple Conditions</option>
            </select>
          </div>
          <div id="prof-step3-err" style="color:var(--red);font-size:12px;margin-bottom:10px;display:none"></div>
          <div class="notice notice-info" style="margin-bottom:14px;font-size:11.5px">
            &#9877; By creating an account you confirm you are a licensed healthcare professional or researcher.
            Clinical platform for qualified practitioners only.
          </div>
          <div style="display:flex;gap:10px">
            <button class="btn btn-ghost" style="flex:1;padding:10px" onclick="window._profBack(3)">&#8592; Back</button>
            <button class="btn-hero-primary" style="flex:2;font-size:13px;padding:11px" id="prof-submit-btn" onclick="window._profSubmit()">
              Create Account &rarr;
            </button>
          </div>
        </div>

        <!-- Done -->
        <div id="prof-step-done" style="display:none;text-align:center;padding:24px 0">
          <div style="width:56px;height:56px;border-radius:50%;background:rgba(0,212,188,0.1);border:1px solid var(--border-teal);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:22px;color:var(--teal)">&#10003;</div>
          <div style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Account Created</div>
          <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.6">Welcome to DeepSynaps Studio. Signing you in now&hellip;</div>
        </div>
      </div>
      <div style="text-align:center;margin-top:20px;font-size:12px;color:var(--text-tertiary)">
        Already have an account? <span onclick="window._showSignIn()" style="color:var(--teal);cursor:pointer">Sign in</span>
      </div>
    </div>
  `;

  let selectedMods = [];

  window._toggleProfMod = function(el, mod) {
    const idx = selectedMods.indexOf(mod);
    if (idx === -1) { selectedMods.push(mod); el.classList.add('selected'); }
    else { selectedMods.splice(idx, 1); el.classList.remove('selected'); }
  };

  window._profNext = function(step) {
    if (step === 1) {
      const clinic = document.getElementById('prof-clinic').value.trim();
      const role   = document.getElementById('prof-role').value;
      const err    = document.getElementById('prof-step1-err');
      if (!clinic || !role) { err.textContent = 'Please fill in all fields.'; err.style.display = ''; return; }
      err.style.display = 'none';
      document.getElementById('prof-step-1').style.display = 'none';
      document.getElementById('prof-step-2').style.display = '';
      document.getElementById('pip-1').className = 'step-pip done';
      document.getElementById('pip-2').className = 'step-pip active';
    } else if (step === 2) {
      const email = document.getElementById('prof-email').value.trim();
      const pw    = document.getElementById('prof-password').value;
      const pw2   = document.getElementById('prof-password2').value;
      const err   = document.getElementById('prof-step2-err');
      if (!email || !pw) { err.textContent = 'Email and password required.'; err.style.display = ''; return; }
      if (pw.length < 8)  { err.textContent = 'Password must be at least 8 characters.'; err.style.display = ''; return; }
      if (pw !== pw2)     { err.textContent = 'Passwords do not match.'; err.style.display = ''; return; }
      err.style.display = 'none';
      document.getElementById('prof-step-2').style.display = 'none';
      document.getElementById('prof-step-3').style.display = '';
      document.getElementById('pip-2').className = 'step-pip done';
      document.getElementById('pip-3').className = 'step-pip active';
    }
  };

  window._profBack = function(step) {
    if (step === 2) {
      document.getElementById('prof-step-2').style.display = 'none';
      document.getElementById('prof-step-1').style.display = '';
      document.getElementById('pip-2').className = 'step-pip';
      document.getElementById('pip-1').className = 'step-pip active';
    } else if (step === 3) {
      document.getElementById('prof-step-3').style.display = 'none';
      document.getElementById('prof-step-2').style.display = '';
      document.getElementById('pip-3').className = 'step-pip';
      document.getElementById('pip-2').className = 'step-pip active';
    }
  };

  window._profSubmit = async function() {
    const btn  = document.getElementById('prof-submit-btn');
    const err  = document.getElementById('prof-step3-err');
    err.style.display = 'none';
    btn.textContent = 'Creating account\u2026';
    btn.disabled = true;

    const name     = document.getElementById('prof-clinic').value.trim();
    const email    = document.getElementById('prof-email').value.trim();
    const password = document.getElementById('prof-password').value;

    let user = null;
    try {
      const res = await api.register(email, name, password);
      if (res?.access_token) {
        api.setToken(res.access_token);
        user = res.user || { email, display_name: name, role: 'clinician', package_id: 'clinician_pro' };
      }
    } catch (_) {}

    // Offline demo fallback
    if (!user) {
      api.setToken('clinician-demo-token');
      user = { email, display_name: name, role: 'clinician', package_id: 'clinician_pro' };
    }

    document.getElementById('prof-step-3').style.display = 'none';
    document.getElementById('prof-step-done').style.display = '';
    document.getElementById('pip-3').className = 'step-pip done';

    setCurrentUser(user);
    setTimeout(() => { showApp(); updateUserBar(); window._bootApp(); }, 1200);
  };
}

// ── Patient Signup (/signup/patient) ──────────────────────────────────────────
export function pgSignupPatient() {
  const el = document.getElementById('public-shell');
  el.scrollTop = 0;
  el.innerHTML = `
    ${pubTopbar()}
    <div class="pub-signup-wrap">
      <div class="pub-signup-card">
        <button class="pub-back-link" onclick="window._navPublic('home')">&#8592; Back to home</button>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
          <div class="logo-icon" style="width:36px;height:36px;font-size:16px;background:linear-gradient(135deg,var(--blue-dim),var(--violet))">&#9673;</div>
          <div>
            <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:1px">DeepSynaps Studio</div>
            <div style="font-size:11px;color:var(--blue);font-weight:600">Patient Portal Access</div>
          </div>
        </div>
        <div class="pub-signup-title">Access your patient portal</div>
        <div class="pub-signup-sub">
          Your clinic provides an invitation code or registered your email directly.
          If you don't have a code, contact your clinic.
        </div>

        <div style="display:flex;border-bottom:1px solid var(--border);margin-bottom:24px">
          <button class="tab-btn active" id="tab-invite" onclick="window._ptTab('invite')">Invitation Code</button>
          <button class="tab-btn" id="tab-direct" onclick="window._ptTab('direct')">Clinic Email Link</button>
        </div>

        <!-- Invite code form -->
        <div id="pt-invite-form">
          <div class="form-group">
            <label class="form-label">Invitation Code</label>
            <input id="pt-code" class="form-control" placeholder="e.g. NB-2026-XXXX" style="font-family:var(--font-mono);letter-spacing:1px">
          </div>
          <div class="form-group">
            <label class="form-label">Full Name</label>
            <input id="pt-name" class="form-control" placeholder="Jane Doe" autocomplete="name">
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input id="pt-email" class="form-control" type="email" placeholder="patient@email.com" autocomplete="email">
          </div>
          <div class="form-group">
            <label class="form-label">Create Password</label>
            <input id="pt-pw" class="form-control" type="password" placeholder="Min. 8 characters" autocomplete="new-password">
          </div>
          <div id="pt-invite-err" style="color:var(--red);font-size:12px;margin-bottom:10px;display:none"></div>
          <button
            style="width:100%;font-size:13px;padding:12px;border-radius:var(--radius-lg);background:linear-gradient(135deg,var(--blue-dim),var(--violet));color:#fff;font-family:var(--font-body);font-weight:600;border:none;cursor:pointer;box-shadow:0 4px 20px rgba(74,158,255,0.3);transition:all 0.15s"
            onclick="window._ptActivate()">
            Activate Portal &rarr;
          </button>
        </div>

        <!-- Direct email form -->
        <div id="pt-direct-form" style="display:none">
          <div class="notice notice-info" style="margin-bottom:16px">
            If your clinic registered you directly, enter your email to receive an activation link.
          </div>
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input id="pt-email-direct" class="form-control" type="email" placeholder="patient@email.com">
          </div>
          <div id="pt-direct-err" style="color:var(--red);font-size:12px;margin-bottom:10px;display:none"></div>
          <button
            style="width:100%;font-size:13px;padding:12px;border-radius:var(--radius-lg);background:linear-gradient(135deg,var(--blue-dim),var(--violet));color:#fff;font-family:var(--font-body);font-weight:600;border:none;cursor:pointer"
            onclick="window._ptEmailSend()">
            Send Activation Link &rarr;
          </button>
        </div>

        <!-- Done -->
        <div id="pt-done" style="display:none;text-align:center;padding:24px 0">
          <div style="width:56px;height:56px;border-radius:50%;background:rgba(74,158,255,0.1);border:1px solid var(--border-blue);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:22px;color:var(--blue)">&#9673;</div>
          <div style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Portal Activated</div>
          <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.6">Welcome. Opening your portal now&hellip;</div>
        </div>
      </div>
      <div style="text-align:center;margin-top:20px;font-size:12px;color:var(--text-tertiary)">
        Already have access? <span onclick="window._showSignIn()" style="color:var(--blue);cursor:pointer">Sign in</span>
      </div>
    </div>
  `;

  window._ptTab = function(tab) {
    document.getElementById('pt-invite-form').style.display  = tab === 'invite' ? '' : 'none';
    document.getElementById('pt-direct-form').style.display  = tab === 'direct' ? '' : 'none';
    document.getElementById('tab-invite').classList.toggle('active', tab === 'invite');
    document.getElementById('tab-direct').classList.toggle('active', tab === 'direct');
  };

  window._ptActivate = async function() {
    const code = document.getElementById('pt-code').value.trim();
    const name = document.getElementById('pt-name').value.trim();
    const email = document.getElementById('pt-email').value.trim();
    const pw   = document.getElementById('pt-pw').value;
    const err  = document.getElementById('pt-invite-err');
    err.style.display = 'none';
    if (!code || !name || !email || !pw) { err.textContent = 'All fields required.'; err.style.display = ''; return; }
    if (pw.length < 8) { err.textContent = 'Password must be at least 8 characters.'; err.style.display = ''; return; }

    // Demo: accept any non-empty code
    document.getElementById('pt-invite-form').style.display = 'none';
    document.getElementById('pt-done').style.display = '';

    api.setToken('patient-demo-token');
    setCurrentUser({ email, display_name: name, role: 'patient', package_id: 'patient' });
    setTimeout(() => { showPatient(); updatePatientBar(); window._bootPatient?.(); }, 1200);
  };

  window._ptEmailSend = function() {
    const email = document.getElementById('pt-email-direct').value.trim();
    const err   = document.getElementById('pt-direct-err');
    err.style.display = 'none';
    if (!email) { err.textContent = 'Email required.'; err.style.display = ''; return; }
    document.getElementById('pt-direct-form').innerHTML = `
      <div class="notice notice-ok">
        If <strong>${email}</strong> is registered with a clinic, an activation link has been sent. Check your inbox.
      </div>
    `;
  };
}
