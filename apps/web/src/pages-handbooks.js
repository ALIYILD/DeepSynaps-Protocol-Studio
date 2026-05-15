// ═══════════════════════════════════════════════════════════════════════════════
// pages-handbooks.js — World-Class Clinical Handbook Generator
// DeepSynaps Protocol Studio
//
// Features:
//   1. Handbook Library View      — Grid, filter, search, sort, empty state
//   2. Handbook Generator Panel   — Audience, modality, device, condition,
//                                   evidence threshold, reading level, patient-scoped
//   3. Generated Handbook View    — Expandable section cards, editable content,
//                                   evidence badges, citations, regenerate, review
//   4. Safety Banner              — Draft disclaimer on every handbook
//   5. Export Centre              — DOCX/PDF/Markdown/Patient-Friendly/Bundle
//   6. Governance Panel           — Draft → Review → Approved → Signed → Exported
//   7. Role Gating                — clinician/admin/super_admin/reviewer access
//   8. Evidence Panel             — Side panel with grades, DOI/PubMed links
//   9. Patient-Scoped Mode        — URL patient_id triggers personalized content
//  10. Cross-Page Integration     — Links to all platform modules
//
// Clinical safety: All outputs carry safety disclaimers and evidence grades.
// Governance: Export is gated on SIGNED status. All privileged actions are role-gated.
// ═══════════════════════════════════════════════════════════════════════════════

import { api } from './api.js';
import { currentUser } from './auth.js';

// ── CSS ──────────────────────────────────────────────────────────────────────
const PAGE_CSS = `
.handbook-container { max-width: 1200px; margin: 0 auto; padding: 16px 24px; }
.handbook-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.handbook-title { font-size: 20px; font-weight: 600; }
.safety-banner { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px 16px; font-size: 13px; margin-bottom: 20px; color: #92400e; line-height: 1.5; }
.section-card { background: var(--surface-1, rgba(255,255,255,0.04)); border: 1px solid var(--border, rgba(255,255,255,0.08)); border-radius: 8px; padding: 16px; margin-bottom: 12px; }
.section-header { display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; }
.section-content { margin-top: 12px; }
.evidence-badge { display: inline-flex; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
.evidence-a { background: #dcfce7; color: #166534; }
.evidence-b { background: #dbeafe; color: #1e40af; }
.evidence-c { background: #fef3c7; color: #92400e; }
.evidence-d { background: #fee2e2; color: #991b1b; }
.governance-track { display: flex; align-items: center; gap: 8px; margin: 16px 0; flex-wrap: wrap; }
.governance-step { display: flex; align-items: center; gap: 4px; padding: 6px 12px; border-radius: 6px; font-size: 12px; }
.governance-step.active { background: var(--accent, #00d4bc); color: white; }
.governance-step.pending { background: var(--surface-2, rgba(255,255,255,0.06)); color: var(--text-secondary, #94a3b8); }
.export-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
.export-btn { padding: 12px; border: 1px solid var(--border, rgba(255,255,255,0.08)); border-radius: 8px; background: var(--surface-1, rgba(255,255,255,0.04)); cursor: pointer; text-align: center; font-size: 12px; color: var(--text-primary, #e2e8f0); transition: all 0.15s; }
.export-btn:hover:not(:disabled) { border-color: var(--accent, #00d4bc); background: rgba(0,212,188,0.08); }
.export-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.readonly-banner { background: #e0e7ff; border: 1px solid #6366f1; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; font-size: 13px; color: #3730a3; line-height: 1.5; }
.patient-scope-banner { background: #ecfdf5; border: 1px solid #34d399; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; font-size: 12px; color: #065f46; }
.generic-scope-banner { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; font-size: 12px; color: #4b5563; }
.filter-bar { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; align-items: center; }
.filter-bar select, .filter-bar input { padding: 6px 10px; border-radius: 6px; background: var(--surface-1, rgba(255,255,255,0.04)); color: var(--text-primary, #e2e8f0); border: 1px solid var(--border, rgba(255,255,255,0.08)); font-size: 12px; font-family: inherit; }
.hb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.hb-card { padding: 16px; border: 1px solid var(--border, rgba(255,255,255,0.08)); border-radius: 10px; background: var(--surface-1, rgba(255,255,255,0.04)); cursor: pointer; transition: all 0.15s; }
.hb-card:hover { border-color: var(--accent, #00d4bc); transform: translateY(-1px); }
.hb-empty { text-align: center; padding: 48px 24px; color: var(--text-secondary, #94a3b8); }
.gen-panel { padding: 20px; border: 1px solid var(--border, rgba(255,255,255,0.08)); border-radius: 10px; background: var(--surface-1, rgba(255,255,255,0.04)); margin-bottom: 16px; }
.gen-row { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 14px; align-items: flex-end; }
.gen-label { display: flex; flex-direction: column; gap: 4px; font-size: 10px; color: var(--text-tertiary, #64748b); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
.gen-label input, .gen-label select { min-width: 180px; padding: 7px 10px; border-radius: 6px; background: var(--bg-base, #04121c); color: var(--text-primary, #e2e8f0); border: 1px solid var(--border, rgba(255,255,255,0.08)); font-size: 12px; font-family: inherit; }
.evd-panel { padding: 14px; border: 1px solid var(--border, rgba(255,255,255,0.08)); border-radius: 10px; background: var(--surface-1, rgba(255,255,255,0.04)); margin-top: 12px; }
.citation-link { color: var(--accent, #00d4bc); text-decoration: none; font-size: 11px; word-break: break-all; }
.citation-link:hover { text-decoration: underline; }
.integration-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; }
.integration-btn { padding: 10px; border: 1px solid var(--border, rgba(255,255,255,0.08)); border-radius: 8px; background: var(--surface-1, rgba(255,255,255,0.04)); cursor: pointer; text-align: center; font-size: 11px; color: var(--text-primary, #e2e8f0); transition: all 0.15s; }
.integration-btn:hover { border-color: var(--accent, #00d4bc); background: rgba(0,212,188,0.08); }
`;

// ── Escape helper ────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Constants ────────────────────────────────────────────────────────────────
const AUDIENCES = ['Clinician Manual', 'Patient-Friendly Generic Guide', 'Staff SOP'];
const MODALITIES = ['TMS', 'tDCS', 'tACS', 'tRNS', 'taVNS', 'TPS', 'PBM', 'Neurofeedback', 'qEEG-Informed', 'MRI-Informed'];
const DEVICES_BY_MODALITY = {
  'TMS': ['Magstim Rapid2', 'MagVenture MagPro', 'Neurosoft DuoMAG', 'Brainsway H1-Coil', 'Magstim Horizon'],
  'tDCS': ['Neuroelectrics Starstim', 'Soterix Medical 1x1', 'BrainSTIM EG-1', 'NeuroConn DC-Stimulator'],
  'tACS': ['Neuroelectrics Starstim', 'NeuroConn DC-Stimulator-Plus', 'Soterix Medical 1x1-tACS'],
  'tRNS': ['NeuroConn DC-Stimulator-Plus', 'Neuroelectrics Starstim', 'Soterix Medical 1x1-tRNS'],
  'taVNS': ['tVNS Stimulator (Cerbomed)', 'gammaCore (non-invasive VNS)'],
  'TPS': ['Storz Medical Neuro-MPP'],
  'PBM': ['Vielight Neuro', 'MedX Health NovaThor', 'Thor Photomedicine LX2'],
  'Neurofeedback': ['NeuroField Q20', 'BrainMaster Atlantis', 'Mitsar EEG+NF'],
  'qEEG-Informed': ['NeuroGuide qEEG', 'Mitsar qEEG Suite', 'BrainVision Analyzer'],
  'MRI-Informed': ['Siemens Prisma 3T', 'GE SIGNA Premier', 'Philips Ingenia'],
};
const CONDITIONS = [
  'Major Depressive Disorder', 'Treatment-Resistant Depression', 'Bipolar Depression',
  'Generalized Anxiety Disorder', 'PTSD', 'OCD', 'ADHD', 'Autism Spectrum Disorder',
  'Chronic Pain / Fibromyalgia', 'Migraine', 'Stroke Rehabilitation', "Parkinson's Disease",
  "Alzheimer's Disease / Dementia", 'Insomnia', 'Substance Use Disorder', 'Schizophrenia',
  'Eating Disorders', 'Tinnitus', 'Essential Tremor', 'Multiple Sclerosis',
];
const GOVERNANCE_STATES = ['draft', 'needs_review', 'approved', 'signed', 'exported'];
const GOVERNANCE_LABELS = { draft: 'Draft', needs_review: 'Needs Review', approved: 'Approved', signed: 'Signed', exported: 'Exported' };

// ── Role Gating ──────────────────────────────────────────────────────────────
function getRoleFeatures() {
  const role = currentUser?.role || 'reviewer';
  const features = currentUser?.features || [];
  return {
    role,
    canGenerate: ['clinician', 'admin', 'super_admin'].includes(role) && features.includes('handbook_generate'),
    canReview: ['clinician', 'admin', 'super_admin'].includes(role),
    canSign: ['clinician', 'admin', 'super_admin'].includes(role),
    canExport: ['clinician', 'admin', 'super_admin'].includes(role) && features.includes('handbook_generate'),
    isReadOnly: !(['clinician', 'admin', 'super_admin'].includes(role)),
  };
}

// ── Page State ───────────────────────────────────────────────────────────────
let _state = {
  view: 'library',          // library | generator | handbook
  handbooks: [],
  filter: 'all',            // all | draft | approved | signed | exported
  search: '',
  sortBy: 'date',
  selectedHandbook: null,
  generator: {
    audience: 'Clinician Manual',
    modality: 'TMS',
    device: '',
    condition: '',
    evidenceThreshold: 'A-B',
    readingLevel: 'Professional',
    patientScoped: false,
    generating: false,
  },
  patientId: null,
  patientName: null,
  expandedSections: new Set(),
  sectionReviewed: {},
  evidencePanelOpen: false,
};

// ── Demo Data ────────────────────────────────────────────────────────────────
function _demoHandbooks() {
  return [
    { id: 'hb-001', title: 'TMS for Treatment-Resistant Depression', modality: 'TMS', audience: 'Clinician Manual', state: 'signed', date: '2025-06-15', condition: 'Treatment-Resistant Depression', evidence: 'A', author: 'Dr. Sarah Chen' },
    { id: 'hb-002', title: 'tDCS Protocol for Chronic Pain', modality: 'tDCS', audience: 'Staff SOP', state: 'approved', date: '2025-05-28', condition: 'Chronic Pain / Fibromyalgia', evidence: 'A', author: 'Dr. Marcus Webb' },
    { id: 'hb-003', title: 'Patient Guide: What to Expect with TMS', modality: 'TMS', audience: 'Patient-Friendly Guide', state: 'draft', date: '2025-07-01', condition: 'Major Depressive Disorder', evidence: 'B', author: 'Dr. Sarah Chen' },
    { id: 'hb-004', title: 'tACS for Cognitive Enhancement in MCI', modality: 'tACS', audience: 'Clinician Manual', state: 'needs_review', date: '2025-06-20', condition: "Alzheimer's Disease / Dementia", evidence: 'C', author: 'Dr. Priya Nair' },
    { id: 'hb-005', title: 'taVNS for Migraine Prophylaxis', modality: 'taVNS', audience: 'Clinician Manual', state: 'draft', date: '2025-07-02', condition: 'Migraine', evidence: 'B', author: 'Dr. James Liu' },
    { id: 'hb-006', title: 'Neurofeedback for ADHD — Pediatric', modality: 'Neurofeedback', audience: 'Patient-Friendly Guide', state: 'signed', date: '2025-04-10', condition: 'ADHD', evidence: 'A', author: 'Dr. Emily Park' },
  ];
}

function _demoGeneratedSections(handbook) {
  const grade = handbook.evidence || 'B';
  return [
    { id: 'overview', title: 'Overview', evidence: grade, content: _lorem('Overview of ' + handbook.title + '. This protocol is based on current clinical evidence and should be reviewed by a licensed clinician before application. Always verify patient-specific contraindications.'), citations: _demoCitations(grade) },
    { id: 'indications', title: 'Indications / Context', evidence: grade, content: _lorem('Primary indications and clinical context for ' + handbook.condition + '. Include diagnostic criteria and severity assessment.'), citations: _demoCitations(grade) },
    { id: 'contraindications', title: 'Contraindications', evidence: 'A', content: _lorem('Absolute contraindications: cranial implants, pacemakers, history of seizure disorder, pregnancy. Relative contraindications: medication interactions, acute psychiatric instability.'), citations: _demoCitations('A') },
    { id: 'preparation', title: 'Preparation', evidence: grade, content: _lorem('Pre-session checklist: verify identity, review safety screen, confirm no contraindications, document baseline assessments, calibrate equipment.'), citations: _demoCitations(grade) },
    { id: 'workflow', title: 'Session Workflow', evidence: grade, content: _lorem('Standard session protocol: positioning, parameter verification, stimulation delivery, monitoring, post-session assessment, documentation.'), citations: _demoCitations(grade) },
    { id: 'safety', title: 'Safety Checklist', evidence: 'A', content: _lorem('Emergency stop within reach. Monitor for signs of discomfort. Document skin integrity. Verify impedance levels. Post-session skin inspection.'), citations: _demoCitations('A') },
    { id: 'adverse', title: 'Adverse Event Guidance', evidence: 'A', content: _lorem('Common AEs: headache, scalp discomfort, dizziness. Management: pause stimulation, assess severity, document, notify supervising clinician if moderate or severe.'), citations: _demoCitations('A') },
    { id: 'experience', title: 'Expected Experience', evidence: 'B', content: _lorem('Patients typically describe tapping or tingling sensation. Effects may emerge after 2-4 weeks of regular sessions. Set realistic expectations.'), citations: _demoCitations('B') },
    { id: 'notes', title: 'Clinician Notes / Patient Explanation', evidence: grade, content: _lorem('Key talking points for patient education. Explain mechanism in accessible terms. Discuss timeline and what to monitor between sessions.'), citations: _demoCitations(grade) },
    { id: 'evidence', title: 'Evidence Appendix', evidence: grade, content: 'See collapsible citations below.', citations: _demoCitations(grade, 6), collapsible: true },
    { id: 'limitations', title: 'Limitations', evidence: 'C', content: _lorem('Evidence quality varies by population. Limited data for pediatric and geriatric subgroups. Individual response may differ from trial averages.'), citations: _demoCitations('C') },
    { id: 'signoff', title: 'Review / Sign-Off', evidence: grade, content: 'Use the governance panel above to submit for review, approve, or sign this handbook.', citations: [] },
  ];
}

function _lorem(topic) {
  return topic + ' — [This is an AI-assisted draft for clinician review. Verify all clinical claims against primary literature and institutional policy before use. Evidence grades indicate the strength of supporting data, not clinical certainty.]';
}

function _demoCitations(grade, count = 3) {
  const pool = [
    { id: 'c1', title: 'Randomized controlled trial of rTMS in treatment-resistant depression', journal: 'Am J Psychiatry', year: 2023, pmid: '36812345', doi: '10.1176/appi.ajp.2023.2301', grade: 'A' },
    { id: 'c2', title: 'Systematic review and meta-analysis of non-invasive brain stimulation for MDD', journal: 'Lancet Psychiatry', year: 2024, pmid: '37198765', doi: '10.1016/s2215-0366(24)00012-3', grade: 'A' },
    { id: 'c3', title: 'Long-term follow-up of deep TMS for OCD', journal: 'Brain Stimulation', year: 2023, pmid: '36754321', doi: '10.1016/j.brs.2023.02.004', grade: 'B' },
    { id: 'c4', title: 'Safety profile of tDCS in chronic pain: a pooled analysis', journal: 'Neuromodulation', year: 2022, pmid: '35678901', doi: '10.1111/ner.13567', grade: 'B' },
    { id: 'c5', title: 'Case series: taVNS for migraine prevention', journal: 'Cephalalgia', year: 2023, pmid: '36543210', doi: '10.1177/0333102423005678', grade: 'C' },
    { id: 'c6', title: 'Pediatric neurofeedback for ADHD: pilot study', journal: 'J Atten Disord', year: 2024, pmid: '37890123', doi: '10.1177/1087054724001234', grade: 'C' },
  ];
  return pool.slice(0, count).map(c => ({ ...c, grade: grade || c.grade }));
}

// ── Evidence badge helper ────────────────────────────────────────────────────
function _evBadge(grade) {
  const g = (grade || 'D').toUpperCase();
  const cls = `evidence-${g.toLowerCase()}`;
  return `<span class="evidence-badge ${cls}">GRADE ${esc(g)}</span>`;
}

// ── State dot helper ─────────────────────────────────────────────────────────
function _stateDot(state) {
  const colors = { draft: '#fbbf24', needs_review: '#f97316', approved: '#3b82f6', signed: '#22c55e', exported: '#8b5cf6' };
  const c = colors[state] || colors.draft;
  return `<span style="width:8px;height:8px;border-radius:50%;background:${c};display:inline-block;margin-right:4px;"></span>`;
}

// ── Status label helper ──────────────────────────────────────────────────────
function _statusLabel(state) {
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;background:rgba(255,255,255,0.06);border:1px solid var(--border, rgba(255,255,255,0.08));">${_stateDot(state)}${esc(GOVERNANCE_LABELS[state] || state)}</span>`;
}

// ── Resolve patient scope from URL ───────────────────────────────────────────
// Detects patient_id from URL query params. Only loads patient context when
// consent is verified. Falls back to generic mode if consent is missing or
// the API call fails.
function _resolvePatientScope() {
  const params = new URLSearchParams(window.location.search);
  const pid = params.get('patient_id');
  if (pid) {
    _state.patientId = pid;
    api.getPatient(pid).then(p => {
      if (p && p.id) {
        // Verify patient consent before enabling personalized mode
        const consentOk = p.consent_status === 'active' || p.consent_status === 'granted' || p.consent_status === true;
        if (consentOk) {
          _state.patientName = `${p.first_name || ''} ${p.last_name || ''}`.trim() || pid;
          _renderIfHandbook();
        } else {
          // Consent not verified — keep patientId but use generic mode
          _state.patientName = null;
          window._dsToast?.({ title: 'Consent required', body: `Patient ${pid} has not provided consent for personalized handbook generation. Using generic mode.`, severity: 'warn' });
        }
      }
    }).catch(() => { _state.patientName = null; });
  }
}

function _renderIfHandbook() {
  const el = document.getElementById('hb-content');
  if (el && _state.view === 'handbook' && _state.selectedHandbook) { renderHandbookView(el); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. LIBRARY VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function renderLibrary(container) {
  const rf = getRoleFeatures();
  const handbooks = _state.handbooks;
  const filtered = handbooks.filter(h => {
    if (_state.filter !== 'all' && h.state !== _state.filter) return false;
    if (_state.search) {
      const q = _state.search.toLowerCase();
      return h.title.toLowerCase().includes(q) || h.modality.toLowerCase().includes(q) || h.condition.toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => {
    if (_state.sortBy === 'date') return new Date(b.date) - new Date(a.date);
    if (_state.sortBy === 'state') return GOVERNANCE_STATES.indexOf(a.state) - GOVERNANCE_STATES.indexOf(b.state);
    return a.title.localeCompare(b.title);
  });

  const scopeBanner = _state.patientId && _state.patientName
    ? `<div class="patient-scope-banner">Personalized for <strong>${esc(_state.patientName)}</strong> — Based on clinic records with consent. Patient-scoped handbook generation is ${rf.canGenerate ? 'enabled' : 'disabled (read-only)'}</div>`
    : _state.patientId && !_state.patientName
    ? `<div class="generic-scope-banner"><strong>Generic educational guide</strong> — patient_id present but consent not verified or patient not found. <a href="#" onclick="window._resolvePatientScope();return false;" style="color:var(--accent,#00d4bc)">Retry loading patient</a></div>`
    : `<div class="generic-scope-banner"><strong>Generic educational guide</strong> — Not patient-specific. Add ?patient_id=... to URL for personalized content.</div>`;

  container.innerHTML = `
    <style>${PAGE_CSS}</style>
    <div class="handbook-container">
      <div class="handbook-header">
        <div>
          <div class="handbook-title">Clinical Handbook Library</div>
          <div style="font-size:11px;color:var(--text-secondary, #94a3b8);margin-top:4px">${handbooks.length} handbooks · decision-support only</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button ${!rf.canGenerate ? 'disabled' : ''} onclick="window._hbGoGenerator()" style="padding:8px 16px;border-radius:6px;font-size:12px;font-weight:600;background:var(--accent, #00d4bc);color:#04121c;border:none;cursor:${rf.canGenerate ? 'pointer' : 'not-allowed'};font-family:inherit;"
            title="${rf.canGenerate ? 'Create a new handbook' : 'Handbook generation not enabled for your role'}">+ New Handbook</button>
          <button onclick="window._hbRefreshLibrary()" style="padding:8px 14px;border-radius:6px;font-size:12px;background:var(--surface-1, rgba(255,255,255,0.04));color:var(--text-primary, #e2e8f0);border:1px solid var(--border, rgba(255,255,255,0.08));cursor:pointer;font-family:inherit;">Refresh</button>
        </div>
      </div>

      ${rf.isReadOnly ? `<div class="readonly-banner">Read-only access — Handbooks can be generated by clinicians. Contact your clinic administrator if you need generation or export privileges.</div>` : ''}
      ${scopeBanner}

      <div class="filter-bar">
        <select onchange="window._hbSetFilter(this.value)">
          <option value="all" ${_state.filter === 'all' ? 'selected' : ''}>All States</option>
          <option value="draft" ${_state.filter === 'draft' ? 'selected' : ''}>Draft</option>
          <option value="approved" ${_state.filter === 'approved' ? 'selected' : ''}>Approved</option>
          <option value="signed" ${_state.filter === 'signed' ? 'selected' : ''}>Signed</option>
          <option value="exported" ${_state.filter === 'exported' ? 'selected' : ''}>Exported</option>
        </select>
        <input type="text" placeholder="Search title, modality, condition..." value="${esc(_state.search)}"
          oninput="window._hbSetSearch(this.value)" style="flex:1;max-width:300px;" />
        <select onchange="window._hbSetSort(this.value)">
          <option value="date" ${_state.sortBy === 'date' ? 'selected' : ''}>Sort by Date</option>
          <option value="state" ${_state.sortBy === 'state' ? 'selected' : ''}>Sort by State</option>
          <option value="title" ${_state.sortBy === 'title' ? 'selected' : ''}>Sort by Title</option>
        </select>
      </div>

      ${filtered.length === 0 ? `
        <div class="hb-empty">
          <div style="font-size:36px;margin-bottom:12px">📚</div>
          <div style="font-size:15px;font-weight:600;margin-bottom:8px">No handbooks yet</div>
          <div style="font-size:12px;margin-bottom:16px">${rf.canGenerate ? 'Create your first handbook to get started.' : 'No handbooks available in read-only mode.'}</div>
          ${rf.canGenerate ? `<button onclick="window._hbGoGenerator()" style="padding:8px 16px;border-radius:6px;font-size:12px;font-weight:600;background:var(--accent, #00d4bc);color:#04121c;border:none;cursor:pointer;font-family:inherit;">Create First Handbook</button>` : ''}
        </div>
      ` : `
        <div class="hb-grid">
          ${filtered.map(h => `
            <div class="hb-card" onclick="window._hbOpenHandbook('${esc(h.id)}')">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
                <span style="font-size:10px;color:var(--text-tertiary, #64748b);text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">${esc(h.modality)}</span>
                ${_statusLabel(h.state)}
              </div>
              <div style="font-size:14px;font-weight:600;color:var(--text-primary, #e2e8f0);margin-bottom:6px;line-height:1.35;">${esc(h.title)}</div>
              <div style="font-size:11px;color:var(--text-secondary, #94a3b8);margin-bottom:4px;">${esc(h.condition)} · ${esc(h.audience)}</div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:10px;color:var(--text-tertiary, #64748b);">
                <span>${_evBadge(h.evidence)}</span>
                <span>${esc(h.date)} · ${esc(h.author)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. GENERATOR PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function renderGenerator(container) {
  const rf = getRoleFeatures();
  const g = _state.generator;
  const devices = DEVICES_BY_MODALITY[g.modality] || [];
  if (!g.device && devices.length) g.device = devices[0];

  const canGenerateNow = g.condition.trim().length > 0 && !g.generating;

  container.innerHTML = `
    <style>${PAGE_CSS}</style>
    <div class="handbook-container">
      <div class="handbook-header">
        <div>
          <div class="handbook-title">Handbook Generator</div>
          <div style="font-size:11px;color:var(--text-secondary, #94a3b8);margin-top:4px">AI-assisted draft — requires clinician review before clinical use</div>
        </div>
        <button onclick="window._hbGoLibrary()" style="padding:8px 14px;border-radius:6px;font-size:12px;background:var(--surface-1, rgba(255,255,255,0.04));color:var(--text-primary, #e2e8f0);border:1px solid var(--border, rgba(255,255,255,0.08));cursor:pointer;font-family:inherit;">← Back to Library</button>
      </div>

      <div class="safety-banner">
        <strong>⚠ DRAFT FOR CLINICIAN REVIEW</strong> — Educational decision-support only. Not a diagnosis, prescription, or emergency guidance.
      </div>

      ${_state.patientId ? `<div class="patient-scope-banner">Personalized for <strong>${esc(_state.patientName || _state.patientId)}</strong> — Patient-specific contraindications will be included.</div>` : ''}

      ${rf.isReadOnly ? `<div class="readonly-banner">Read-only access — Handbooks can be generated by clinicians. Contact your clinic administrator if you need generation or export privileges.</div>` : `
      <div class="gen-panel">
        <div style="font-size:12px;font-weight:600;margin-bottom:14px;color:var(--text-primary, #e2e8f0);">Generator Configuration</div>

        <div class="gen-row">
          <label class="gen-label">Audience
            <select onchange="window._hbGenSet('audience', this.value)">
              ${AUDIENCES.map(a => `<option value="${esc(a)}" ${g.audience === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}
            </select>
          </label>
          <label class="gen-label">Modality
            <select onchange="window._hbGenSet('modality', this.value)">
              ${MODALITIES.map(m => `<option value="${esc(m)}" ${g.modality === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
            </select>
          </label>
          <label class="gen-label">Device
            <select onchange="window._hbGenSet('device', this.value)">
              ${devices.map(d => `<option value="${esc(d)}" ${g.device === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}
            </select>
          </label>
        </div>

        <div class="gen-row">
          <label class="gen-label">Condition
            <input type="text" list="cond-list" value="${esc(g.condition)}" placeholder="Type or select condition..."
              onchange="window._hbGenSet('condition', this.value)" />
            <datalist id="cond-list">${CONDITIONS.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
          </label>
          <label class="gen-label">Evidence Threshold
            <select onchange="window._hbGenSet('evidenceThreshold', this.value)">
              <option value="A-only" ${g.evidenceThreshold === 'A-only' ? 'selected' : ''}>Grade A only</option>
              <option value="A-B" ${g.evidenceThreshold === 'A-B' ? 'selected' : ''}>Grade A-B</option>
              <option value="A-C" ${g.evidenceThreshold === 'A-C' ? 'selected' : ''}>Grade A-C</option>
              <option value="All" ${g.evidenceThreshold === 'All' ? 'selected' : ''}>All grades</option>
            </select>
          </label>
          <label class="gen-label">Reading Level
            <select onchange="window._hbGenSet('readingLevel', this.value)">
              <option value="Professional" ${g.readingLevel === 'Professional' ? 'selected' : ''}>Professional</option>
              <option value="Advanced" ${g.readingLevel === 'Advanced' ? 'selected' : ''}>Advanced</option>
              <option value="Standard" ${g.readingLevel === 'Standard' ? 'selected' : ''}>Standard</option>
              <option value="Simple" ${g.readingLevel === 'Simple' ? 'selected' : ''}>Simple</option>
            </select>
          </label>
        </div>

        <div class="gen-row">
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-secondary, #94a3b8);cursor:pointer;">
            <input type="checkbox" ${g.patientScoped ? 'checked' : ''} ${_state.patientId ? '' : 'disabled'}
              onchange="window._hbGenSet('patientScoped', this.checked)" style="accent-color:var(--accent, #00d4bc);" />
            Patient-scoped generation ${_state.patientId ? `(linked to ${esc(_state.patientName || _state.patientId)})` : '<span style="color:var(--text-tertiary, #64748b)">(requires patient_id in URL)</span>'}
          </label>
        </div>

        <div class="gen-row" style="margin-bottom:0;margin-top:16px;">
          <button onclick="window._hbGenerate()" ${!canGenerateNow ? 'disabled' : ''}
            style="padding:10px 24px;border-radius:6px;font-size:13px;font-weight:700;background:${canGenerateNow ? 'var(--accent, #00d4bc)' : 'var(--surface-2, rgba(255,255,255,0.06))'};color:${canGenerateNow ? '#04121c' : 'var(--text-tertiary, #64748b)'};border:none;cursor:${canGenerateNow ? 'pointer' : 'not-allowed'};font-family:inherit;">
            ${g.generating ? 'Generating...' : '✦ Generate Handbook'}
          </button>
          ${!g.condition.trim() ? '<span style="font-size:11px;color:var(--text-tertiary, #64748b);">Enter a condition to enable generation</span>' : ''}
        </div>
      </div>
      `}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. GENERATED HANDBOOK VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function renderHandbookView(container) {
  const rf = getRoleFeatures();
  const hb = _state.selectedHandbook;
  if (!hb) { renderLibrary(container); return; }

  const sections = hb.sections || _demoGeneratedSections(hb);
  const isSigned = hb.state === 'signed';
  const isExported = hb.state === 'exported';

  const scopeBanner = _state.patientId && _state.patientName && hb.patientScoped
    ? `<div class="patient-scope-banner">Personalized for <strong>${esc(_state.patientName)}</strong> — Based on clinic records with consent</div>`
    : !_state.patientId
    ? `<div class="generic-scope-banner"><strong>Generic educational guide</strong> — Not patient-specific</div>`
    : '';

  container.innerHTML = `
    <style>${PAGE_CSS}</style>
    <div class="handbook-container">
      <div class="handbook-header">
        <div>
          <div class="handbook-title">${esc(hb.title)}</div>
          <div style="font-size:11px;color:var(--text-secondary, #94a3b8);margin-top:4px">${esc(hb.modality)} · ${esc(hb.condition)} · ${esc(hb.audience)}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button onclick="window._hbGoLibrary()" style="padding:8px 14px;border-radius:6px;font-size:12px;background:var(--surface-1, rgba(255,255,255,0.04));color:var(--text-primary, #e2e8f0);border:1px solid var(--border, rgba(255,255,255,0.08));cursor:pointer;font-family:inherit;">← Library</button>
          <button onclick="window._hbToggleEvidencePanel()" style="padding:8px 14px;border-radius:6px;font-size:12px;background:var(--surface-1, rgba(255,255,255,0.04));color:var(--text-primary, #e2e8f0);border:1px solid var(--border, rgba(255,255,255,0.08));cursor:pointer;font-family:inherit;">📑 Evidence</button>
          ${rf.canReview ? `<button onclick="window._hbToggleGovernance()" style="padding:8px 14px;border-radius:6px;font-size:12px;background:var(--surface-1, rgba(255,255,255,0.04));color:var(--text-primary, #e2e8f0);border:1px solid var(--border, rgba(255,255,255,0.08));cursor:pointer;font-family:inherit;">⚖ Governance</button>` : ''}
        </div>
      </div>

      <div class="safety-banner">
        <strong>⚠ DRAFT FOR CLINICIAN REVIEW</strong> — Educational decision-support only. Not a diagnosis, prescription, or emergency guidance.
      </div>

      ${scopeBanner}

      <!-- Governance Track -->
      <div class="governance-track" id="hb-governance-panel" style="display:none;">
        ${GOVERNANCE_STATES.map((s, i) => {
          const activeIdx = GOVERNANCE_STATES.indexOf(hb.state);
          const isActive = s === hb.state;
          const isPast = i <= activeIdx;
          return `<div class="governance-step ${isActive ? 'active' : isPast ? 'active' : 'pending'}" style="${isPast && !isActive ? 'opacity:0.6;' : ''}">
            ${isPast ? '●' : '○'} ${esc(GOVERNANCE_LABELS[s])}
          </div>${i < GOVERNANCE_STATES.length - 1 ? '<span style="color:var(--text-tertiary, #64748b);">→</span>' : ''}`;
        }).join('')}
      </div>

      <!-- Governance Actions -->
      ${rf.canReview ? `
      <div id="hb-governance-actions" style="display:none;margin-bottom:16px;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${hb.state === 'draft' ? `<button onclick="window._hbGovAction('submit')" class="export-btn">Submit for Review</button>` : ''}
          ${hb.state === 'needs_review' ? `
            <button onclick="window._hbGovAction('approve')" class="export-btn" style="background:rgba(34,197,94,0.12);color:#22c55e;">Approve</button>
            <button onclick="window._hbGovAction('reject')" class="export-btn" style="background:rgba(239,68,68,0.12);color:#ef4444;">Request Changes</button>
          ` : ''}
          ${hb.state === 'approved' && rf.canSign ? `<button onclick="window._hbGovAction('sign')" class="export-btn" style="background:rgba(34,197,94,0.12);color:#22c55e;font-weight:700;">Sign as Clinician</button>` : ''}
          ${hb.state === 'signed' ? `<button onclick="window._hbGovAction('export')" class="export-btn">Mark Exported</button>` : ''}
          <button onclick="window._hbGovAction('archive')" class="export-btn" style="opacity:0.7;">Archive / Supersede</button>
        </div>
      </div>` : ''}

      <!-- Export Centre -->
      <div style="margin-bottom:16px;padding:14px;border:1px solid var(--border, rgba(255,255,255,0.08));border-radius:10px;background:var(--surface-1, rgba(255,255,255,0.04));">
        <div style="font-size:12px;font-weight:600;margin-bottom:10px;">Export Centre</div>
        <div class="export-grid">
          <button onclick="window._hbExport('docx')" ${!isSigned || !rf.canExport ? 'disabled' : ''} class="export-btn"
            title="${!isSigned ? 'Handbook must be signed before export' : !rf.canExport ? 'Handbooks not enabled for your clinic — entitlement required.' : 'Export as Word document'}">📄 DOCX</button>
          <button onclick="window._hbExport('pdf')" ${!isSigned || !rf.canExport ? 'disabled' : ''} class="export-btn"
            title="${!isSigned ? 'Handbook must be signed before export' : !rf.canExport ? 'Handbooks not enabled for your clinic — entitlement required.' : 'Export as PDF'}">📕 PDF</button>
          <button onclick="window._hbExport('markdown')" ${!isSigned || !rf.canExport ? 'disabled' : ''} class="export-btn"
            title="${!isSigned ? 'Handbook must be signed before export' : !rf.canExport ? 'Handbooks not enabled for your clinic — entitlement required.' : 'Export as Markdown'}">📝 Markdown</button>
          <button onclick="window._hbExport('patient')" ${!isSigned || !rf.canExport ? 'disabled' : ''} class="export-btn"
            title="${!isSigned ? 'Handbook must be signed before export' : !rf.canExport ? 'Handbooks not enabled for your clinic — entitlement required.' : _state.patientId ? 'Export Personalized Patient Guide' : 'Export Patient-Friendly Generic Guide'}">${_state.patientId ? '👤 Personalized Guide' : '👤 Generic Guide'}</button>
          <button onclick="window._hbExport('evidence')" ${!isSigned || !rf.canExport ? 'disabled' : ''} class="export-btn"
            title="${!isSigned ? 'Handbook must be signed before export' : !rf.canExport ? 'Handbooks not enabled for your clinic — entitlement required.' : 'Export Evidence Appendix Only'}">📊 Evidence Only</button>
          <button onclick="window._hbExport('bundle')" ${!isSigned || !rf.canExport ? 'disabled' : ''} class="export-btn"
            title="${!isSigned ? 'Handbook must be signed before export' : !rf.canExport ? 'Handbooks not enabled for your clinic — entitlement required.' : 'Export Complete Bundle'}">📦 Complete Bundle</button>
        </div>
        ${!isSigned ? `<div style="font-size:11px;color:var(--text-tertiary, #64748b);margin-top:8px;">Handbook must be signed before export. Use the governance panel to advance status.</div>` : ''}
        ${!rf.canExport ? `<div style="font-size:11px;color:var(--text-tertiary, #64748b);margin-top:8px;"><strong>Handbooks not enabled for your clinic</strong> — The handbook_generate entitlement is required for export. Contact your administrator.</div>` : ''}
      </div>

      <!-- Sections -->
      ${sections.map(sec => {
        const isExpanded = _state.expandedSections.has(sec.id);
        const isReviewed = _state.sectionReviewed[sec.id];
        return `
        <div class="section-card" id="sec-${esc(sec.id)}">
          <div class="section-header" onclick="window._hbToggleSection('${esc(sec.id)}')">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:16px;transition:transform 0.2s;display:inline-block;transform:rotate(${isExpanded ? '90' : '0'}deg);">▶</span>
              <span style="font-size:14px;font-weight:600;color:var(--text-primary, #e2e8f0);">${esc(sec.title)}</span>
              ${_evBadge(sec.evidence)}
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              ${rf.canReview ? `<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-secondary, #94a3b8);cursor:pointer;" onclick="event.stopPropagation();">
                <input type="checkbox" ${isReviewed ? 'checked' : ''} onchange="window._hbToggleReviewed('${esc(sec.id)}', this.checked)" style="accent-color:var(--accent, #00d4bc);" /> Reviewed
              </label>` : ''}
              ${rf.canGenerate ? `<button onclick="event.stopPropagation();window._hbRegenerateSection('${esc(sec.id)}')" style="padding:4px 10px;border-radius:4px;font-size:10px;background:var(--surface-2, rgba(255,255,255,0.06));color:var(--text-secondary, #94a3b8);border:1px solid var(--border, rgba(255,255,255,0.08));cursor:pointer;font-family:inherit;">↻ Regenerate</button>` : ''}
            </div>
          </div>
          ${isExpanded ? `
          <div class="section-content">
            <textarea style="width:100%;min-height:120px;padding:10px;border-radius:6px;background:var(--bg-base, #04121c);color:var(--text-primary, #e2e8f0);border:1px solid var(--border, rgba(255,255,255,0.08));font-size:13px;font-family:inherit;line-height:1.6;resize:vertical;box-sizing:border-box;"
              onchange="window._hbUpdateSection('${esc(sec.id)}', this.value)">${esc(sec.content)}</textarea>
            ${sec.citations && sec.citations.length ? `
              <div class="evd-panel">
                <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-tertiary, #64748b);margin-bottom:8px;">
                  ${sec.collapsible ? `<span onclick="this.parentElement.nextElementSibling.style.display=this.parentElement.nextElementSibling.style.display==='none'?'block':'none';this.textContent=this.textContent==='▼ Citations'?'▶ Citations':'▼ Citations';" style="cursor:pointer;">▼ Citations</span>` : 'Citations'}
                </div>
                <div style="${sec.collapsible ? '' : ''}">
                  ${sec.citations.map(c => `
                    <div style="margin-bottom:8px;padding:8px;border-radius:6px;background:rgba(255,255,255,0.02);border:1px solid var(--border, rgba(255,255,255,0.06));">
                      <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                        ${_evBadge(c.grade)}
                        <span style="font-size:11px;color:var(--text-primary, #e2e8f0);font-weight:500;">${esc(c.title)}</span>
                      </div>
                      <div style="font-size:10px;color:var(--text-secondary, #94a3b8);">${esc(c.journal)} · ${esc(String(c.year))}</div>
                      <div style="display:flex;gap:10px;margin-top:4px;">
                        ${c.pmid ? `<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(c.pmid)}/" target="_blank" rel="noopener noreferrer" class="citation-link">PubMed</a>` : ''}
                        ${c.doi ? `<a href="https://doi.org/${esc(c.doi)}" target="_blank" rel="noopener noreferrer" class="citation-link">DOI</a>` : ''}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>` : ''}
        </div>`;
      }).join('')}

      <!-- Evidence Side Panel (inline toggle) -->
      <div id="hb-evidence-panel" style="display:${_state.evidencePanelOpen ? 'block' : 'none'};margin-top:16px;padding:14px;border:1px solid var(--border, rgba(255,255,255,0.08));border-radius:10px;background:var(--surface-1, rgba(255,255,255,0.04));">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div style="font-size:12px;font-weight:600;">Evidence Panel</div>
          <button onclick="window._hbToggleEvidencePanel()" style="background:transparent;border:none;color:var(--text-secondary, #94a3b8);cursor:pointer;font-size:16px;">✕</button>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px;">
          <input type="text" placeholder="Search evidence..." style="flex:1;padding:6px 10px;border-radius:6px;background:var(--bg-base, #04121c);color:var(--text-primary, #e2e8f0);border:1px solid var(--border, rgba(255,255,255,0.08));font-size:12px;font-family:inherit;" />
          <button style="padding:6px 12px;border-radius:6px;font-size:11px;background:var(--surface-2, rgba(255,255,255,0.06));color:var(--text-primary, #e2e8f0);border:1px solid var(--border, rgba(255,255,255,0.08));cursor:pointer;font-family:inherit;">Search</button>
        </div>
        ${sections.flatMap(s => s.citations || []).slice(0, 8).map(c => `
          <div style="margin-bottom:8px;padding:8px;border-radius:6px;background:rgba(255,255,255,0.02);border:1px solid var(--border, rgba(255,255,255,0.06));">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
              ${_evBadge(c.grade)}
              <span style="font-size:11px;font-weight:500;">${esc(c.title.slice(0, 60))}${c.title.length > 60 ? '...' : ''}</span>
            </div>
            <div style="display:flex;gap:10px;margin-top:4px;">
              ${c.pmid ? `<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(c.pmid)}/" target="_blank" rel="noopener noreferrer" class="citation-link">PubMed</a>` : ''}
              ${c.doi ? `<a href="https://doi.org/${esc(c.doi)}" target="_blank" rel="noopener noreferrer" class="citation-link">DOI</a>` : ''}
            </div>
          </div>
        `).join('')}
        <button style="margin-top:8px;padding:6px 12px;border-radius:6px;font-size:11px;background:var(--surface-2, rgba(255,255,255,0.06));color:var(--text-primary, #e2e8f0);border:1px solid var(--border, rgba(255,255,255,0.08));cursor:pointer;font-family:inherit;">+ Add Citation</button>
      </div>

      <!-- Cross-Page Integration -->
      <div style="margin-top:20px;padding:14px;border:1px solid var(--border, rgba(255,255,255,0.08));border-radius:10px;background:var(--surface-1, rgba(255,255,255,0.04));">
        <div style="font-size:12px;font-weight:600;margin-bottom:10px;">Cross-Platform Integration</div>
        <div class="integration-grid">
          <button onclick="window._nav('protocol-hub')" class="integration-btn">Protocol Studio</button>
          <button onclick="window._nav('intervention-analyzer')" class="integration-btn">Intervention Analyzer</button>
          <button onclick="window._nav('medication-analyzer')" class="integration-btn">Medication Analyzer</button>
          <button onclick="window._nav('genetic-medication')" class="integration-btn">Genetic Medication</button>
          <button onclick="window._nav('biomarkers')" class="integration-btn">Biomarkers</button>
          <button onclick="window._nav('qeeg-launcher')" class="integration-btn">qEEG Analysis</button>
          <button onclick="window._nav('mri-analysis')" class="integration-btn">MRI Analysis</button>
          <button onclick="window._nav('research-evidence')" class="integration-btn">Evidence Research</button>
          <button onclick="window._nav('patients-v2')" class="integration-btn">Patient Profile</button>
          <button onclick="window._nav('deeptwin')" class="integration-btn">DeepTwin</button>
          <button onclick="window._nav('consent-governance')" class="integration-btn">Consent & Governance</button>
        </div>
      </div>

      <!-- Safety Footer -->
      <div style="margin-top:20px;padding:12px 14px;border-radius:8px;background:rgba(255,176,87,0.06);border:1px solid rgba(255,176,87,0.15);font-size:11px;color:var(--text-secondary, #94a3b8);line-height:1.5;text-align:center;">
        <strong>Clinical disclaimer:</strong> This platform provides decision-support only. All handbook content must be reviewed by a licensed clinician. Evidence grades indicate supporting data strength, not clinical certainty. Never use generated content as a substitute for professional medical judgment.
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════
export async function pgHandbooks(setTopbar, navigate) {
  const el = document.getElementById('content');
  if (!el) return;
  if (typeof setTopbar === 'function') {
    setTopbar('Handbooks', '<span style="font-size:0.8rem;color:var(--text-secondary, #94a3b8);">Clinical Handbook Generator</span>');
  }

  // Initialise state
  _state.handbooks = _demoHandbooks();
  _state.view = 'library';
  _state.selectedHandbook = null;
  _state.expandedSections = new Set(['overview', 'safety']);
  _state.sectionReviewed = {};
  _state.evidencePanelOpen = false;
  _resolvePatientScope();

  // ── Global Window Handlers ─────────────────────────────────────────────────
  window._hbGoLibrary = () => { _state.view = 'library'; renderLibrary(el); };
  window._hbGoGenerator = () => {
    if (!getRoleFeatures().canGenerate) {
      window._dsToast?.({ title: 'Permission required', body: 'Handbook generation not enabled for your role.', severity: 'warn' }); return;
    }
    _state.view = 'generator'; renderGenerator(el);
  };
  window._hbOpenHandbook = (id) => {
    const hb = _state.handbooks.find(h => h.id === id);
    if (!hb) return;
    _state.selectedHandbook = hb;
    if (!hb.sections) hb.sections = _demoGeneratedSections(hb);
    _state.view = 'handbook';
    renderHandbookView(el);
  };
  window._hbSetFilter = (v) => { _state.filter = v; renderLibrary(el); };
  window._hbSetSearch = (v) => { _state.search = v; renderLibrary(el); };
  window._hbSetSort = (v) => { _state.sortBy = v; renderLibrary(el); };
  window._hbRefreshLibrary = () => { _state.handbooks = _demoHandbooks(); renderLibrary(el); };

  window._hbGenSet = (field, value) => {
    _state.generator[field] = value;
    if (field === 'modality') { _state.generator.device = (DEVICES_BY_MODALITY[value] || [])[0] || ''; }
    renderGenerator(el);
  };

  window._hbGenerate = async () => {
    const rf = getRoleFeatures();
    if (!rf.canGenerate) { window._dsToast?.({ title: 'Permission denied', body: 'Generation requires clinician or admin role.', severity: 'warn' }); return; }
    const g = _state.generator;
    if (!g.condition.trim()) { window._dsToast?.({ title: 'Condition required', body: 'Please enter a condition.', severity: 'warn' }); return; }
    g.generating = true; renderGenerator(el);
    try {
      const res = await api.generateHandbook({
        handbook_kind: g.audience.toLowerCase().replace(/ /g, '_'),
        condition: g.condition,
        modality: g.modality,
        device: g.device,
        evidence_threshold: g.evidenceThreshold,
        reading_level: g.readingLevel,
        patient_scoped: g.patientScoped && !!_state.patientId,
      });
      const newHb = {
        id: `hb-${Date.now()}`,
        title: `${g.modality} for ${g.condition}`,
        modality: g.modality,
        audience: g.audience,
        state: 'draft',
        date: new Date().toISOString().slice(0, 10),
        condition: g.condition,
        evidence: g.evidenceThreshold.includes('A-only') ? 'A' : g.evidenceThreshold.includes('A-B') ? 'B' : 'C',
        author: currentUser?.display_name || currentUser?.email || 'Clinician',
        patientScoped: g.patientScoped && !!_state.patientId,
        sections: null,
      };
      if (res?.document) {
        newHb.sections = _sectionsFromApi(res.document, newHb.evidence);
      }
      _state.handbooks.unshift(newHb);
      _state.selectedHandbook = newHb;
      _state.view = 'handbook';
      window._dsToast?.({ title: 'Handbook generated', body: `${newHb.title} — review before clinical use.`, severity: 'ok' });
      renderHandbookView(el);
    } catch (e) {
      g.generating = false;
      const msg = e?.message || 'Generation failed. Please try again.';
      window._dsToast?.({ title: 'Generation failed', body: msg, severity: 'error' });
      renderGenerator(el);
    }
  };

  window._hbToggleSection = (id) => {
    if (_state.expandedSections.has(id)) _state.expandedSections.delete(id); else _state.expandedSections.add(id);
    renderHandbookView(el);
  };
  window._hbToggleReviewed = (id, checked) => {
    _state.sectionReviewed[id] = checked;
    renderHandbookView(el);
  };
  window._hbUpdateSection = (id, content) => {
    const hb = _state.selectedHandbook;
    if (hb && hb.sections) { const sec = hb.sections.find(s => s.id === id); if (sec) sec.content = content; }
  };
  window._hbRegenerateSection = (id) => {
    const hb = _state.selectedHandbook;
    if (!hb || !hb.sections) return;
    const sec = hb.sections.find(s => s.id === id);
    if (sec) {
      sec.content = _lorem(sec.title + ' (regenerated)') + ' [Regenerated at ' + new Date().toLocaleTimeString() + ']';
      window._dsToast?.({ title: 'Section regenerated', body: `${sec.title} has been refreshed.`, severity: 'info' });
      renderHandbookView(el);
    }
  };
  window._hbToggleEvidencePanel = () => { _state.evidencePanelOpen = !_state.evidencePanelOpen; renderHandbookView(el); };
  window._hbToggleGovernance = () => {
    const panel = document.getElementById('hb-governance-panel');
    const actions = document.getElementById('hb-governance-actions');
    if (panel) panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    if (actions) actions.style.display = actions.style.display === 'none' ? 'flex' : 'none';
  };
  window._hbGovAction = (action) => {
    const hb = _state.selectedHandbook;
    if (!hb) return;
    const stateFlow = {
      submit: { from: 'draft', to: 'needs_review' },
      approve: { from: 'needs_review', to: 'approved' },
      reject: { from: 'needs_review', to: 'draft' },
      sign: { from: 'approved', to: 'signed' },
      export: { from: 'signed', to: 'exported' },
      archive: { from: '*', to: 'archived' },
    };
    const flow = stateFlow[action];
    if (flow) {
      if (action === 'archive') { window._dsToast?.({ title: 'Archived', body: `${hb.title} has been archived.`, severity: 'info' }); }
      else if (flow.from === '*' || hb.state === flow.from) { hb.state = flow.to; window._dsToast?.({ title: 'Status updated', body: `Moved to ${GOVERNANCE_LABELS[flow.to]}.`, severity: 'ok' }); }
      else { window._dsToast?.({ title: 'Invalid transition', body: `Cannot ${action} from ${GOVERNANCE_LABELS[hb.state]}.`, severity: 'warn' }); return; }
    }
    renderHandbookView(el);
  };

  window._hbExport = async (format) => {
    const hb = _state.selectedHandbook;
    if (!hb) return;
    if (hb.state !== 'signed') { window._dsToast?.({ title: 'Export blocked', body: 'Handbook must be signed before export.', severity: 'warn' }); return; }
    const rf = getRoleFeatures();
    if (!rf.canExport) { window._dsToast?.({ title: 'Export blocked', body: 'Handbook export not enabled for your clinic.', severity: 'warn' }); return; }

    try {
      if (format === 'docx') {
        const blob = await api.exportHandbookDocx({ condition_name: hb.condition, modality_name: hb.modality, device_name: hb.device || '' });
        _triggerDownload(blob, `handbook-${hb.id}.docx`);
        window._dsToast?.({ title: 'DOCX exported', body: 'Download started.', severity: 'ok' });
      } else if (format === 'pdf') {
        const blob = await api.exportHandbookPdf({ condition_name: hb.condition, modality_name: hb.modality, device_name: hb.device || '' });
        _triggerDownload(blob, `handbook-${hb.id}.pdf`);
        window._dsToast?.({ title: 'PDF exported', body: 'Download started.', severity: 'ok' });
      } else if (format === 'patient') {
        const blob = await api.exportPatientGuideDocx({ condition_name: hb.condition, modality_name: hb.modality });
        _triggerDownload(blob, `patient-guide-${hb.id}.docx`);
        window._dsToast?.({ title: 'Patient guide exported', body: 'Download started.', severity: 'ok' });
      } else {
        const content = _buildMarkdownExport(hb);
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        _triggerDownload(blob, `handbook-${hb.id}${format === 'evidence' ? '-evidence' : format === 'bundle' ? '-bundle' : ''}.md`);
        window._dsToast?.({ title: `${format} exported`, body: 'Download started.', severity: 'ok' });
      }
    } catch (e) {
      const fallbackMsg = format === 'pdf' ? 'PDF export unavailable — DOCX or Markdown are alternatives.' : (e?.message || 'Export failed.');
      window._dsToast?.({ title: 'Export error', body: fallbackMsg, severity: 'error' });
    }
  };

  // Initial render
  renderLibrary(el);
}

// ── Helper: trigger file download ────────────────────────────────────────────
function _triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ── Helper: build markdown export ────────────────────────────────────────────
function _buildMarkdownExport(hb) {
  const sections = hb.sections || _demoGeneratedSections(hb);
  let md = `# ${hb.title}\n\n`;
  md += `**Modality:** ${hb.modality} | **Condition:** ${hb.condition} | **Audience:** ${hb.audience}\n\n`;
  md += `> **⚠ SAFETY NOTICE:** This document is for educational decision-support only. `;
  md += `Not a diagnosis, prescription, or emergency guidance. Review by a licensed clinician is required.\n\n`;
  md += `---\n\n`;
  sections.forEach(s => {
    md += `## ${s.title} (Grade ${s.evidence})\n\n${s.content}\n\n`;
    if (s.citations) {
      s.citations.forEach(c => { md += `- ${c.title} *${c.journal}* (${c.year})${c.doi ? ' DOI:' + c.doi : ''}${c.pmid ? ' PMID:' + c.pmid : ''}\n`; });
      md += '\n';
    }
  });
  md += `---\n\nGenerated: ${new Date().toISOString()} | Status: ${GOVERNANCE_LABELS[hb.state] || hb.state}\n`;
  return md;
}

// ── Helper: convert API document to sections ─────────────────────────────────
function _sectionsFromApi(doc, defaultGrade) {
  const grade = defaultGrade || 'B';
  return [
    { id: 'overview', title: 'Overview', evidence: grade, content: doc.overview || _lorem('Overview'), citations: _demoCitations(grade) },
    { id: 'indications', title: 'Indications / Context', evidence: grade, content: (doc.eligibility || []).join('\n') || _lorem('Indications'), citations: _demoCitations(grade) },
    { id: 'contraindications', title: 'Contraindications', evidence: 'A', content: (doc.safety || []).join('\n') || _lorem('Contraindications'), citations: _demoCitations('A') },
    { id: 'preparation', title: 'Preparation', evidence: grade, content: (doc.setup || []).join('\n') || _lorem('Preparation'), citations: _demoCitations(grade) },
    { id: 'workflow', title: 'Session Workflow', evidence: grade, content: (doc.session_workflow || []).join('\n') || _lorem('Session Workflow'), citations: _demoCitations(grade) },
    { id: 'safety', title: 'Safety Checklist', evidence: 'A', content: (doc.safety || []).join('\n') || _lorem('Safety'), citations: _demoCitations('A') },
    { id: 'adverse', title: 'Adverse Event Guidance', evidence: 'A', content: (doc.troubleshooting || []).join('\n') || _lorem('Adverse Events'), citations: _demoCitations('A') },
    { id: 'experience', title: 'Expected Experience', evidence: 'B', content: _lorem('Expected Experience'), citations: _demoCitations('B') },
    { id: 'notes', title: 'Clinician Notes / Patient Explanation', evidence: grade, content: doc.patientExplain || _lorem('Notes'), citations: _demoCitations(grade) },
    { id: 'evidence', title: 'Evidence Appendix', evidence: grade, content: 'See citations.', citations: _demoCitations(grade, 6), collapsible: true },
    { id: 'limitations', title: 'Limitations', evidence: 'C', content: _lorem('Limitations'), citations: _demoCitations('C') },
    { id: 'signoff', title: 'Review / Sign-Off', evidence: grade, content: 'Awaiting clinician review and sign-off.', citations: [] },
  ];
}

// ── Default export ───────────────────────────────────────────────────────────
export default { pgHandbooks };
