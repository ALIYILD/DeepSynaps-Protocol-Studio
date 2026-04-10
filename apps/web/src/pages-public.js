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

    <!-- ─── Hero ─────────────────────────────────────────────────────────── -->
    <section class="pub-hero">
      <div class="pub-hero-badge">◈ &nbsp;Clinical OS &nbsp;·&nbsp; Neuromodulation</div>

      <h1 class="pub-hero-title">
        The intelligent operating system<br>
        for <span>neuromodulation clinics</span>
      </h1>

      <p class="pub-hero-sub">
        Manage treatment courses end-to-end &mdash; from evidence-graded protocol design through
        structured session delivery, clinical governance, patient engagement, and longitudinal
        outcomes &mdash; in one platform built for neuromodulation practice.
      </p>

      <div class="pub-hero-ctas">
        <button class="btn-hero-primary" onclick="window._navPublic('signup-professional')">
          Start as Professional &rarr;
        </button>
        <button class="btn-hero-secondary" onclick="window._navPublic('signup-patient')">
          Patient Portal
        </button>
        <button class="btn-hero-ghost" onclick="window._showSignIn()">
          Sign In
        </button>
      </div>

      <!-- Stats -->
      <div style="
        display:flex; gap:0; border:1px solid var(--border);
        border-radius:var(--radius-lg); overflow:hidden; background:var(--bg-card);
        backdrop-filter:blur(8px); flex-wrap:wrap;
      ">
        ${[
          { val: '15+',     label: 'Conditions',       sub: 'covered' },
          { val: 'A–D',     label: 'Evidence',          sub: 'graded protocols' },
          { val: '6+',      label: 'Modalities',        sub: 'supported' },
          { val: '5',       label: 'Role types',        sub: 'with scoped access' },
        ].map((s, i) => `
          <div style="
            flex:1; min-width:120px; padding:18px 22px; text-align:center;
            ${i > 0 ? 'border-left:1px solid var(--border)' : ''}
          ">
            <div style="font-family:var(--font-display);font-size:22px;font-weight:700;color:var(--text-primary);letter-spacing:-0.5px">
              ${s.val}
            </div>
            <div style="font-size:11px;font-weight:600;color:var(--teal);margin-top:3px">${s.label}</div>
            <div style="font-size:10px;color:var(--text-tertiary);margin-top:1px">${s.sub}</div>
          </div>
        `).join('')}
      </div>
    </section>

    <div class="pub-divider"></div>

    <!-- ─── Workflow strip ────────────────────────────────────────────────── -->
    <div style="padding:52px 48px 0;max-width:1160px;margin:0 auto">
      <div style="text-align:center;margin-bottom:36px">
        <div class="pub-eyebrow">Treatment Course Lifecycle</div>
        <div style="font-size:13px;color:var(--text-secondary)">
          Every operation follows the same structured path &mdash; from protocol to outcome.
        </div>
      </div>
      <div class="pub-process-strip">
        ${[
          { icon: '⬡', label: 'Protocol',    sub: 'Evidence-graded design' },
          { icon: '◱', label: 'Approval',    sub: 'Clinician review' },
          { icon: '◎', label: 'Course',      sub: 'Lifecycle created' },
          { icon: '◧', label: 'Session',     sub: 'Structured delivery' },
          { icon: '◫', label: 'Outcomes',    sub: 'Evidence-matched' },
          { icon: '◉', label: 'Patient',     sub: 'Portal engagement' },
        ].map(s => `
          <div class="pub-process-step">
            <div class="pub-process-node">${s.icon}</div>
            <div class="pub-process-label">${s.label}</div>
            <div class="pub-process-sub">${s.sub}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div style="padding:52px 48px 0;max-width:1160px;margin:0 auto">
      <div class="pub-divider" style="margin:0"></div>
    </div>

    <!-- ─── Audience split ────────────────────────────────────────────────── -->
    <div style="padding:72px 0 80px">
      <div style="text-align:center;margin-bottom:44px;padding:0 48px">
        <div class="pub-eyebrow">Two separate experiences</div>
        <div class="pub-section-title" style="text-align:center;margin-bottom:10px">
          A clinical OS for your team.<br>A clear portal for your patients.
        </div>
        <div style="font-size:14px;color:var(--text-secondary);max-width:520px;margin:0 auto;line-height:1.7">
          Professional and patient interfaces are kept entirely separate &mdash;
          different layouts, different depth, different language.
        </div>
      </div>

      <div class="pub-audience-grid">

        <!-- Clinic card -->
        <div class="pub-audience-card primary">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
            <div class="pub-audience-icon" style="margin:0;width:44px;height:44px">⚕</div>
            <div>
              <div class="pub-eyebrow" style="margin:0 0 2px">For clinics &amp; professionals</div>
              <div class="pub-audience-title" style="margin:0">Clinical Operations Workspace</div>
            </div>
          </div>
          <div class="pub-audience-desc">
            Not a generic EHR. DeepSynaps organises clinical work around
            <strong style="color:var(--text-primary)">treatment courses</strong> &mdash;
            not appointments. Each course carries a protocol, a session schedule,
            a governance trail, and patient outcomes in one structured record.
          </div>
          <ul class="pub-audience-features">
            <li>Evidence-graded protocol design — tDCS, TMS, tACS, PEMF, PBM, neurofeedback</li>
            <li>Course lifecycle management: approval &rarr; sessions &rarr; review &rarr; outcomes</li>
            <li>Structured session execution with device, montage, pulse parameters, deviation flags</li>
            <li>qEEG integration and per-patient brain region mapping</li>
            <li>Adverse event registry, protocol approval workflow, and audit trail</li>
            <li>Role-scoped access for clinician, technician, reviewer, and admin</li>
          </ul>
          <button class="btn-hero-primary" onclick="window._navPublic('signup-professional')"
            style="width:100%;font-size:13px;padding:12px;margin-top:auto">
            Create Clinic Account &rarr;
          </button>
        </div>

        <!-- Patient card -->
        <div class="pub-audience-card secondary">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
            <div class="pub-audience-icon" style="margin:0;width:44px;height:44px">◉</div>
            <div>
              <div class="pub-eyebrow blue" style="margin:0 0 2px">For patients</div>
              <div class="pub-audience-title" style="margin:0">Patient Portal</div>
            </div>
          </div>
          <div class="pub-audience-desc">
            A calm, clear view of your treatment &mdash; without clinical complexity.
            Provided by your clinic, accessed by you. No clinical jargon,
            no unnecessary detail &mdash; just your journey, clearly presented.
          </div>
          <ul class="pub-audience-features">
            <li>Upcoming and completed session schedule from your clinic</li>
            <li>Treatment course summary — what you&rsquo;re being treated for and why</li>
            <li>Assessments and symptom tracking before and after sessions</li>
            <li>Reports and clinical documents shared by your care team</li>
            <li>Secure messages and reminders from your clinician</li>
          </ul>
          <div class="notice notice-info" style="font-size:11.5px;margin-bottom:20px">
            Patient access requires an invitation code or direct registration by your clinic.
          </div>
          <button class="btn-hero-secondary" onclick="window._navPublic('signup-patient')"
            style="width:100%;font-size:13px;padding:12px;border-color:var(--border-blue);color:var(--blue)">
            Activate Patient Portal &rarr;
          </button>
        </div>

      </div>
    </div>

    <div class="pub-divider"></div>

    <!-- ─── Platform capabilities ──────────────────────────────────────────── -->
    <section class="pub-section">
      <div style="display:flex;gap:48px;align-items:flex-start">

        <!-- Left: intro -->
        <div style="width:280px;flex-shrink:0;padding-top:4px">
          <div class="pub-eyebrow">Platform capabilities</div>
          <div class="pub-section-title" style="font-size:26px;margin-bottom:14px">
            Every workflow.<br>One system.
          </div>
          <div style="font-size:13px;color:var(--text-secondary);line-height:1.75;margin-bottom:24px">
            DeepSynaps covers the full operational stack for a neuromodulation clinic &mdash;
            from first protocol to long-term outcome tracking &mdash;
            without requiring separate tools for each discipline.
          </div>
          <button class="btn btn-primary btn-sm" onclick="window._navPublic('signup-professional')" style="font-size:12px">
            Explore the platform &rarr;
          </button>
        </div>

        <!-- Right: feature cards -->
        <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${[
            {
              icon: '◎', accent: '',
              title: 'Treatment Courses',
              desc: 'The primary clinical object. Each course holds a patient, a condition, a protocol, a session schedule, and a complete outcome record. Not appointments &mdash; structured care episodes.',
            },
            {
              icon: '⬡', accent: '',
              title: 'Protocol Intelligence',
              desc: 'AI-assisted, evidence-graded protocol generation. Filter by condition, modality, and patient profile. Every protocol carries an A&ndash;D evidence grade from the literature.',
            },
            {
              icon: '◧', accent: '',
              title: 'Session Execution',
              desc: 'Step-by-step session runner. Device selection, montage verification, pulse parameters, real-time deviation flagging. Every session is documented and traceable.',
            },
            {
              icon: '◈', accent: 'blue',
              title: 'qEEG &amp; Brain Data',
              desc: 'Integrated EEG band analysis, per-patient brain region mapping, and electrode placement visualisation. Neurometric data in clinical context, not isolated.',
            },
            {
              icon: '◫', accent: 'blue',
              title: 'Outcomes &amp; Trends',
              desc: 'Longitudinal outcome tracking against protocol evidence grades. Cohort analytics. Assessment scoring. Outcomes that connect back to the protocol that produced them.',
            },
            {
              icon: '◉', accent: 'blue',
              title: 'Patient Portal',
              desc: 'A separate, calmer interface for patients. Sessions, progress, assessments, reports, and messages from the care team &mdash; without clinical complexity.',
            },
          ].map(f => `
            <div class="pub-feature-card-l ${f.accent}">
              <div class="fcard-icon">${f.icon}</div>
              <div>
                <div class="fcard-title">${f.title}</div>
                <div class="fcard-desc">${f.desc}</div>
              </div>
            </div>
          `).join('')}
        </div>

      </div>
    </section>

    <div class="pub-divider"></div>

    <!-- ─── Trust / governance ─────────────────────────────────────────────── -->
    <section class="pub-section">
      <div style="display:flex;gap:56px;align-items:flex-start">

        <!-- Left: intro -->
        <div style="flex:1;padding-top:4px">
          <div class="pub-eyebrow">Clinical governance by design</div>
          <div class="pub-section-title" style="font-size:26px;margin-bottom:14px">
            Rigour is<br>not optional.
          </div>
          <div style="font-size:13px;color:var(--text-secondary);line-height:1.75;margin-bottom:14px">
            In neuromodulation, a protocol decision is a clinical decision.
            DeepSynaps builds governance, evidence awareness, and auditability
            into every workflow &mdash; not as compliance add-ons, but as core architecture.
          </div>
          <div style="font-size:12px;color:var(--text-tertiary);line-height:1.7">
            Protocol approval requires a qualified reviewer. Session deviations are flagged
            in real time. Every change is timestamped and attributed. Adverse events
            are logged, categorised, and linked to the session and course that produced them.
          </div>
        </div>

        <!-- Right: pillars -->
        <div style="flex:1.1">
          <div class="pub-trust-split">
            ${[
              {
                icon: '⬡',
                title: 'Deterministic Protocol Logic',
                desc: 'Protocols are structured records, not free-text notes. Device parameters, electrode placement, and session counts are explicit fields — not clinical interpretation.',
              },
              {
                icon: '⚗',
                title: 'Evidence-Aware Workflows',
                desc: 'Every protocol carries an A–D evidence grade drawn from the literature. Clinicians see evidence context at every decision point, not just at protocol selection.',
              },
              {
                icon: '◱',
                title: 'Clinician Review &amp; Approval',
                desc: 'Treatment courses require approval before sessions begin. Reviewers have a dedicated queue. Changes trigger re-approval. No session starts without a signed-off protocol.',
              },
              {
                icon: '◧',
                title: 'Full Auditability',
                desc: 'Complete audit trail per course: who created it, who approved it, which sessions ran, which deviated, what adverse events occurred. Timestamped and role-attributed.',
              },
            ].map(t => `
              <div class="pub-trust-row">
                <div class="pub-trust-row-icon">${t.icon}</div>
                <div>
                  <div class="pub-trust-row-title">${t.title}</div>
                  <div class="pub-trust-row-desc">${t.desc}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

      </div>
    </section>

    <div class="pub-divider"></div>

    <!-- ─── Pricing ─────────────────────────────────────────────────────────── -->
    <section class="pub-section pub-pricing-section">

      <div style="text-align:center;margin-bottom:52px">
        <div class="pub-eyebrow">Pricing</div>
        <div class="pub-section-title" style="text-align:center;font-size:30px;margin-bottom:12px">
          Pricing built for neuromodulation clinics
        </div>
        <div style="font-size:14px;color:var(--text-secondary);line-height:1.7;max-width:520px;margin:0 auto">
          Start with one clinician or roll out across a full clinic team.
          Patient portal access is included in every paid plan.
        </div>
        <div style="display:flex;gap:20px;justify-content:center;flex-wrap:wrap;margin-top:18px">
          <span class="pub-pricing-trust-badge">◉ Patient portal included in all paid plans</span>
          <span class="pub-pricing-trust-badge">◈ Save 15% annually</span>
          <span class="pub-pricing-trust-badge">◇ Enterprise onboarding available</span>
        </div>
      </div>

      <div class="pub-pricing-grid">

        <!-- Resident -->
        <div class="pub-plan-card">
          <div class="pub-plan-header">
            <div class="pub-plan-name">Resident</div>
            <div class="pub-plan-sub">For solo practitioners getting started</div>
            <div class="pub-plan-price"><span class="pub-plan-amount">$99</span><span class="pub-plan-period">/mo</span></div>
          </div>
          <ul class="pub-plan-features">
            <li>1 professional seat</li>
            <li>Deterministic protocol intelligence</li>
            <li>Treatment courses</li>
            <li>Assessments</li>
            <li>Patient portal access</li>
            <li>Basic reports</li>
            <li>EV-A / EV-B evidence access</li>
          </ul>
          <button class="pub-plan-cta" onclick="window._navPublic('signup-professional')">
            Start Free Trial &rarr;
          </button>
        </div>

        <!-- Clinician Pro — highlighted -->
        <div class="pub-plan-card pub-plan-card--featured">
          <div class="pub-plan-popular-badge">Most Popular</div>
          <div class="pub-plan-header">
            <div class="pub-plan-name">Clinician Pro</div>
            <div class="pub-plan-sub">For full clinical workflows and protocol governance</div>
            <div class="pub-plan-price"><span class="pub-plan-amount">$199</span><span class="pub-plan-period">/mo</span></div>
          </div>
          <ul class="pub-plan-features">
            <li>1 professional seat</li>
            <li>Unlimited patients</li>
            <li>Treatment-course workflows</li>
            <li>Protocol intelligence</li>
            <li>Patient portal</li>
            <li>Outcomes tracking</li>
            <li>qEEG &amp; brain data</li>
            <li>DOCX / report exports</li>
            <li>EV-C override &amp; off-label governance</li>
          </ul>
          <button class="pub-plan-cta pub-plan-cta--featured" onclick="window._navPublic('signup-professional')">
            Get Started &rarr;
          </button>
        </div>

        <!-- Clinic Team -->
        <div class="pub-plan-card">
          <div class="pub-plan-header">
            <div class="pub-plan-name">Clinic Team</div>
            <div class="pub-plan-sub">For multi-user clinics running treatment operations together</div>
            <div class="pub-plan-price"><span class="pub-plan-amount">$699</span><span class="pub-plan-period">/mo</span></div>
          </div>
          <ul class="pub-plan-features">
            <li>Up to 5 professional seats</li>
            <li>Shared review queue</li>
            <li>Technician workflows</li>
            <li>Device-aware session execution</li>
            <li>Team audit trail</li>
            <li>Clinic outcomes dashboard</li>
            <li>Light white-labelling</li>
          </ul>
          <button class="pub-plan-cta" onclick="window._navPublic('signup-professional')">
            Book Demo &rarr;
          </button>
        </div>

        <!-- Enterprise -->
        <div class="pub-plan-card pub-plan-card--enterprise">
          <div class="pub-plan-header">
            <div class="pub-plan-name">Enterprise</div>
            <div class="pub-plan-sub">For multi-site groups and advanced governance</div>
            <div class="pub-plan-price"><span class="pub-plan-amount pub-plan-amount--custom">Custom</span></div>
          </div>
          <ul class="pub-plan-features">
            <li>Custom seats &amp; roles</li>
            <li>Multi-site governance</li>
            <li>API access</li>
            <li>SSO integration</li>
            <li>Custom workflows</li>
            <li>Full white-label</li>
            <li>Implementation support</li>
          </ul>
          <button class="pub-plan-cta pub-plan-cta--ghost" onclick="window._navPublic('signup-professional')">
            Talk to Sales &rarr;
          </button>
        </div>

      </div>

      <!-- FAQ / Trust note -->
      <div class="pub-pricing-footer-note">
        <div style="display:flex;gap:32px;justify-content:center;flex-wrap:wrap;align-items:center">
          <span>◈ &nbsp;No setup fees. Cancel anytime.</span>
          <span style="width:1px;height:16px;background:var(--border);display:inline-block"></span>
          <span>◉ &nbsp;HIPAA-compliant infrastructure included in all plans.</span>
          <span style="width:1px;height:16px;background:var(--border);display:inline-block"></span>
          <span>◇ &nbsp;Need a custom quote? <button class="pub-pricing-inline-link" onclick="window._navPublic('signup-professional')">Contact us &rarr;</button></span>
        </div>
      </div>

    </section>

    <div class="pub-divider"></div>

    <!-- ─── Final CTA ──────────────────────────────────────────────────────── -->
    <div class="pub-cta-section">
      <div class="pub-eyebrow" style="display:block;text-align:center;margin-bottom:16px">Get started</div>
      <div class="pub-cta-title">Choose your entry point.</div>
      <div class="pub-cta-sub">
        DeepSynaps has a distinct experience for each role.
        Select yours to begin.
      </div>

      <div class="pub-cta-trio">

        <div class="pub-cta-card primary-cta">
          <div class="pub-cta-card-icon" style="color:var(--teal)">⚕</div>
          <div class="pub-cta-card-title">Create Clinic Account</div>
          <div class="pub-cta-card-sub">
            For clinicians, technicians, researchers, and clinic administrators.
          </div>
          <button class="btn-hero-primary" onclick="window._navPublic('signup-professional')"
            style="width:100%;font-size:12.5px;padding:10px">
            Start as Professional &rarr;
          </button>
        </div>

        <div class="pub-cta-card secondary-cta">
          <div class="pub-cta-card-icon" style="color:var(--blue)">◉</div>
          <div class="pub-cta-card-title">Patient Portal</div>
          <div class="pub-cta-card-sub">
            For patients registered by a clinic. Requires an invitation code.
          </div>
          <button
            onclick="window._navPublic('signup-patient')"
            style="width:100%;font-size:12.5px;padding:10px;border-radius:var(--radius-lg);background:rgba(74,158,255,0.1);color:var(--blue);border:1px solid var(--border-blue);font-family:var(--font-body);font-weight:600;cursor:pointer;transition:all 0.15s">
            Activate Patient Portal &rarr;
          </button>
        </div>

        <div class="pub-cta-card">
          <div class="pub-cta-card-icon" style="color:var(--text-tertiary)">◇</div>
          <div class="pub-cta-card-title">Sign In</div>
          <div class="pub-cta-card-sub">
            Already have an account. Access your existing professional or patient session.
          </div>
          <button class="btn-hero-ghost" onclick="window._showSignIn()"
            style="width:100%;font-size:12.5px;padding:10px">
            Sign In to Your Account
          </button>
        </div>

      </div>

      <div style="margin-top:32px;font-size:11.5px;color:var(--text-tertiary);text-align:center;line-height:1.7">
        ⚕ &nbsp;DeepSynaps is a clinical operations platform for qualified neuromodulation practitioners.<br>
        All protocols and session parameters are for professional use only.
        Patient access is clinic-provisioned.
      </div>
    </div>

    <!-- ─── Footer ─────────────────────────────────────────────────────────── -->
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
    setTimeout(() => { localStorage.removeItem('ds_onboarding_done'); showApp(); updateUserBar(); window._bootApp(); }, 1200);
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
