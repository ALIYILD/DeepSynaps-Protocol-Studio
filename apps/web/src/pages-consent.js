// ─────────────────────────────────────────────────────────────────────────────
// pages-consent.js — Consent Management Module (Safety & Governance)
// Template library · consent tracking · form builder · digital signature ·
// audit trail · PDF export
// ─────────────────────────────────────────────────────────────────────────────

import { api } from './api.js';
import { downloadBlob } from './api.js';
import { CONDITIONS, DEVICES } from './protocols-data.js';

// ── Tokens ───────────────────────────────────────────────────────────────────
const T = {
  bg:       'var(--dv2-bg-base, var(--bg-base, #04121c))',
  panel:    'var(--dv2-bg-panel, var(--bg-panel, #0a1d29))',
  surface:  'var(--dv2-bg-surface, var(--bg-surface, rgba(255,255,255,0.04)))',
  surface2: 'var(--dv2-bg-surface-2, rgba(255,255,255,0.07))',
  card:     'var(--dv2-bg-card, rgba(14,22,40,0.8))',
  border:   'var(--dv2-border, var(--border, rgba(255,255,255,0.08)))',
  t1:       'var(--dv2-text-primary, var(--text-primary, #e2e8f0))',
  t2:       'var(--dv2-text-secondary, var(--text-secondary, #94a3b8))',
  t3:       'var(--dv2-text-tertiary, var(--text-tertiary, #64748b))',
  teal:     'var(--dv2-teal, var(--teal, #00d4bc))',
  blue:     'var(--dv2-blue, var(--blue, #4a9eff))',
  amber:    'var(--dv2-amber, var(--amber, #ffb547))',
  rose:     'var(--dv2-rose, var(--rose, #ff6b9d))',
  violet:   'var(--dv2-violet, var(--violet, #9b7fff))',
  green:    'var(--dv2-green, #22c55e)',
  fdisp:    'var(--dv2-font-display, var(--font-display, "Outfit", system-ui, sans-serif))',
  fbody:    'var(--dv2-font-body, var(--font-body, "DM Sans", system-ui, sans-serif))',
  fmono:    'var(--dv2-font-mono, "JetBrains Mono", ui-monospace, monospace)',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _uid() { return 'c-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

function _fmtDate(iso) {
  if (!iso) return '\u2014';
  try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

function _fmtDateTime(iso) {
  if (!iso) return '\u2014';
  try { return new Date(iso).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

function _statusColor(status) {
  switch (status) {
    case 'signed':  return T.green;
    case 'pending': return T.amber;
    case 'expired': return T.rose;
    case 'revoked': return T.t3;
    default: return T.t2;
  }
}

function _statusIcon(status) {
  switch (status) {
    case 'signed':  return '\u2713';
    case 'pending': return '\u25CB';
    case 'expired': return '\u29B0';
    case 'revoked': return '\u2715';
    default:        return '\u25CB';
  }
}

// ── Consent template library ─────────────────────────────────────────────────
// Common neuromodulation consent templates pre-populated with device/condition
// risks drawn from protocols-data.js
function _buildDeviceRisks(deviceId) {
  const dev = DEVICES.find(d => d.id === deviceId);
  if (!dev) return [];
  const riskMap = {
    tms:  ['Scalp discomfort at stimulation site', 'Headache (common, usually mild)', 'Muscle twitching (facial, scalp)', 'Rare: seizure (<0.1% per session)', 'Rare: hearing changes (use earplugs)', 'Syncope (fainting)'],
    tdcs: ['Tingling or itching at electrode site', 'Mild skin redness under electrodes', 'Headache', 'Phosphenes (brief light flashes)', 'Rare: skin burn if electrode dries'],
    tacs: ['Tingling at electrode sites', 'Phosphene perception during stimulation', 'Mild headache', 'Dizziness'],
    ces:  ['Mild tingling at ear clips', 'Transient dizziness', 'Headache', 'Skin irritation at electrode site'],
    tavns:['Mild ear tingling or discomfort', 'Redness at stimulation site', 'Occasional dizziness', 'Rare: vasovagal response'],
    tps:  ['Mild headache post-session', 'Transient scalp discomfort', 'Fatigue'],
    pbm:  ['Mild warmth at treatment site', 'Occasional headache', 'Eye strain if improper shielding'],
    pemf: ['Mild warmth at treatment site', 'Occasional temporary symptom flare', 'Rare: dizziness'],
    nf:   ['Temporary fatigue after session', 'Mild headache', 'Occasional frustration during training', 'Transient mood changes'],
  };
  return riskMap[deviceId] || ['Risks specific to this device will be discussed with your clinician'];
}

function _buildDeviceContraindications(deviceId) {
  const contraMap = {
    tms:  ['Metal implants in or near the head', 'Cochlear implants', 'Cardiac pacemaker or implanted defibrillator', 'Active seizure disorder or history of epilepsy', 'Pregnancy (relative contraindication)'],
    tdcs: ['Implanted electronic devices', 'Skull defects or craniotomy', 'Pregnancy', 'Skin lesions or wounds at electrode sites', 'Metallic implants in the head'],
    tacs: ['Cardiac pacemaker or implanted devices', 'Epilepsy or seizure history', 'Pregnancy', 'Metallic cranial implants'],
    ces:  ['Cardiac pacemaker', 'Implanted electrodes or stimulators'],
    tavns:['Bilateral vagotomy', 'Severe cardiac arrhythmia', 'Active ear infection', 'Implanted vagus nerve stimulator'],
    pbm:  ['Active hemorrhage at treatment site', 'Malignancy at treatment site', 'Photosensitivity disorders', 'Retinal conditions (for transcranial)'],
    pemf: ['Cardiac pacemaker', 'Implanted electronic devices', 'Pregnancy', 'Active hemorrhage'],
    nf:   ['Active psychosis (relative)', 'Severe dissociative disorders without clinical oversight'],
  };
  return contraMap[deviceId] || [];
}

const CONSENT_TEMPLATES = [
  {
    id: 'tpl-tms',
    name: 'TMS / rTMS Consent Form',
    deviceId: 'tms',
    category: 'treatment',
    description: 'Informed consent for Transcranial Magnetic Stimulation (TMS) and repetitive TMS treatment protocols.',
    sections: {
      procedure: 'Transcranial Magnetic Stimulation (TMS) is a non-invasive brain stimulation technique that uses brief magnetic pulses delivered through a coil placed on the scalp. The magnetic field passes through the skull and induces small electrical currents in targeted brain regions. Sessions typically last 3-40 minutes depending on the protocol (standard rTMS or iTBS). You will be seated comfortably and awake throughout the procedure. You may hear clicking sounds and feel tapping on your scalp.',
      risks: _buildDeviceRisks('tms'),
      benefits: ['Potential improvement in your condition symptoms', 'FDA-cleared for depression (MDD) and OCD', 'Non-invasive with no systemic side effects', 'No sedation or anesthesia required', 'Can be combined with medication and psychotherapy'],
      alternatives: ['Continued or modified medication management', 'Psychotherapy (CBT, DBT, etc.)', 'Electroconvulsive therapy (ECT)', 'Other neuromodulation (tDCS, VNS)', 'Watchful waiting'],
      contraindications: _buildDeviceContraindications('tms'),
    },
  },
  {
    id: 'tpl-tdcs',
    name: 'tDCS Consent Form',
    deviceId: 'tdcs',
    category: 'treatment',
    description: 'Informed consent for transcranial Direct Current Stimulation (tDCS) treatment protocols.',
    sections: {
      procedure: 'Transcranial Direct Current Stimulation (tDCS) is a non-invasive brain stimulation technique that delivers a low-intensity constant electrical current (typically 1-2 mA) through electrodes placed on the scalp. The current modulates neuronal activity in targeted brain regions. Sessions typically last 20-30 minutes. You will be seated comfortably and may feel a mild tingling sensation under the electrodes at the start of stimulation.',
      risks: _buildDeviceRisks('tdcs'),
      benefits: ['Potential improvement in condition symptoms', 'Non-invasive and well-tolerated', 'Can be administered in clinic or at home under supervision', 'No systemic side effects', 'Compatible with concurrent therapies'],
      alternatives: ['Medication management', 'Psychotherapy', 'TMS or other neuromodulation', 'No treatment / watchful waiting'],
      contraindications: _buildDeviceContraindications('tdcs'),
    },
  },
  {
    id: 'tpl-general-neuromod',
    name: 'General Neuromodulation Consent',
    deviceId: null,
    category: 'treatment',
    description: 'General informed consent form covering neuromodulation procedures. Device-specific risks are appended based on the treatment plan.',
    sections: {
      procedure: 'You are being offered a neuromodulation treatment as part of your care plan. Neuromodulation involves the use of electrical, magnetic, or other energy to modify activity in specific brain regions. The specific technique, target area, and parameters will be discussed with you by your clinician and documented in your treatment plan. Sessions are conducted in a clinical setting under professional supervision.',
      risks: ['Device-specific risks will be outlined based on your treatment plan', 'General risks include: headache, discomfort at the stimulation site, fatigue', 'Rare but serious risks vary by modality and will be discussed individually'],
      benefits: ['Targeted symptom improvement based on established evidence', 'Non-invasive or minimally invasive approach', 'Can complement existing treatments', 'Individualized to your clinical needs'],
      alternatives: ['Pharmacological treatment', 'Psychotherapy or behavioral interventions', 'Alternative neuromodulation techniques', 'Surgical intervention (in severe cases)', 'No additional treatment'],
      contraindications: ['Will be assessed individually based on your medical history and the specific treatment modality'],
    },
  },
  {
    id: 'tpl-research',
    name: 'Research Participation Consent',
    deviceId: null,
    category: 'research',
    description: 'Consent form for participation in neuromodulation research studies and clinical trials.',
    sections: {
      procedure: 'You are being invited to participate in a research study involving neuromodulation. This study aims to investigate the safety and/or efficacy of a specific neuromodulation protocol. Your participation is entirely voluntary and you may withdraw at any time without affecting your standard clinical care. The study procedures, including assessments, treatment sessions, and follow-up visits, will be explained to you in detail.',
      risks: ['Risks associated with the specific neuromodulation device (detailed in study protocol)', 'Potential for receiving sham/placebo stimulation in randomized studies', 'Time commitment for study visits and assessments', 'Possible discomfort from additional assessments (questionnaires, EEG, imaging)', 'Unknown risks associated with investigational protocols'],
      benefits: ['Potential therapeutic benefit from the investigational treatment', 'Contribution to scientific knowledge and future patient care', 'Close clinical monitoring throughout the study', 'Access to cutting-edge treatment protocols', 'No cost for study-related procedures'],
      alternatives: ['Standard clinical treatment outside of the research study', 'Participation in a different clinical trial', 'No participation in research (standard care continues)'],
      contraindications: ['Study-specific exclusion criteria will be reviewed during screening', 'General neuromodulation contraindications apply'],
    },
  },
];

// Generate device-specific templates dynamically from DEVICES
DEVICES.filter(d => !['tms', 'tdcs', 'other'].includes(d.id) && d.id !== 'dbs' && d.id !== 'vns').forEach(dev => {
  CONSENT_TEMPLATES.push({
    id: `tpl-${dev.id}`,
    name: `${dev.label} Consent Form`,
    deviceId: dev.id,
    category: 'treatment',
    description: `Informed consent for ${dev.label} treatment protocols.`,
    sections: {
      procedure: `You are being offered ${dev.label} as part of your treatment plan. This non-invasive neuromodulation technique will be administered under clinical supervision. Your clinician will explain the specific protocol parameters, target areas, and expected session duration.`,
      risks: _buildDeviceRisks(dev.id),
      benefits: ['Potential improvement in your condition symptoms', 'Non-invasive treatment approach', 'Can be combined with other therapies', 'Administered under professional supervision'],
      alternatives: ['Medication management', 'Psychotherapy', 'Alternative neuromodulation techniques', 'No additional treatment'],
      contraindications: _buildDeviceContraindications(dev.id),
    },
  });
});

// ── Demo consent records ─────────────────────────────────────────────────────
const DEMO_CONSENTS = [
  { id: _uid(), patient_name: 'Sarah M. Johnson', patient_id: 'pt-001', template_id: 'tpl-tms', template_name: 'TMS / rTMS Consent Form', status: 'signed', signed_at: '2026-04-20T14:30:00Z', expires_at: '2027-04-20T14:30:00Z', clinician: 'Dr. Emily Chen', ip_address: '192.168.1.45', condition: 'Major Depressive Disorder', device: 'tms' },
  { id: _uid(), patient_name: 'Michael R. Torres', patient_id: 'pt-002', template_id: 'tpl-tdcs', template_name: 'tDCS Consent Form', status: 'signed', signed_at: '2026-04-18T09:15:00Z', expires_at: '2027-04-18T09:15:00Z', clinician: 'Dr. Emily Chen', ip_address: '192.168.1.52', condition: 'Chronic Pain', device: 'tdcs' },
  { id: _uid(), patient_name: 'Lisa A. Park', patient_id: 'pt-003', template_id: 'tpl-tms', template_name: 'TMS / rTMS Consent Form', status: 'pending', signed_at: null, expires_at: null, clinician: 'Dr. James Wilson', ip_address: null, condition: 'OCD', device: 'tms' },
  { id: _uid(), patient_name: 'David K. White', patient_id: 'pt-004', template_id: 'tpl-research', template_name: 'Research Participation Consent', status: 'pending', signed_at: null, expires_at: null, clinician: 'Dr. Emily Chen', ip_address: null, condition: 'Treatment-Resistant Depression', device: 'tms' },
  { id: _uid(), patient_name: 'Jennifer L. Adams', patient_id: 'pt-005', template_id: 'tpl-tms', template_name: 'TMS / rTMS Consent Form', status: 'expired', signed_at: '2025-03-10T11:00:00Z', expires_at: '2026-03-10T11:00:00Z', clinician: 'Dr. James Wilson', ip_address: '192.168.1.38', condition: 'PTSD', device: 'tms' },
  { id: _uid(), patient_name: 'Robert J. Garcia', patient_id: 'pt-006', template_id: 'tpl-tdcs', template_name: 'tDCS Consent Form', status: 'revoked', signed_at: '2026-02-05T16:45:00Z', expires_at: '2027-02-05T16:45:00Z', clinician: 'Dr. Emily Chen', ip_address: '192.168.1.61', condition: 'ADHD', device: 'tdcs', revoked_at: '2026-04-01T10:00:00Z', revoke_reason: 'Patient withdrew from treatment' },
  { id: _uid(), patient_name: 'Amanda C. Lee', patient_id: 'pt-007', template_id: 'tpl-general-neuromod', template_name: 'General Neuromodulation Consent', status: 'signed', signed_at: '2026-04-22T10:00:00Z', expires_at: '2027-04-22T10:00:00Z', clinician: 'Dr. Emily Chen', ip_address: '192.168.1.77', condition: 'Generalized Anxiety Disorder', device: 'ces' },
];

// ── Demo audit log ───────────────────────────────────────────────────────────
const DEMO_AUDIT = [
  { id: _uid(), action: 'consent_created', patient_name: 'Sarah M. Johnson', template: 'TMS / rTMS Consent Form', actor: 'Dr. Emily Chen', timestamp: '2026-04-20T14:25:00Z', ip: '192.168.1.45', details: 'Consent form generated and sent to patient' },
  { id: _uid(), action: 'consent_signed', patient_name: 'Sarah M. Johnson', template: 'TMS / rTMS Consent Form', actor: 'Sarah M. Johnson (patient)', timestamp: '2026-04-20T14:30:00Z', ip: '192.168.1.45', details: 'Digital signature captured' },
  { id: _uid(), action: 'consent_countersigned', patient_name: 'Sarah M. Johnson', template: 'TMS / rTMS Consent Form', actor: 'Dr. Emily Chen', timestamp: '2026-04-20T14:32:00Z', ip: '192.168.1.45', details: 'Clinician attestation completed' },
  { id: _uid(), action: 'consent_created', patient_name: 'Michael R. Torres', template: 'tDCS Consent Form', actor: 'Dr. Emily Chen', timestamp: '2026-04-18T09:10:00Z', ip: '192.168.1.52', details: 'Consent form generated' },
  { id: _uid(), action: 'consent_signed', patient_name: 'Michael R. Torres', template: 'tDCS Consent Form', actor: 'Michael R. Torres (patient)', timestamp: '2026-04-18T09:15:00Z', ip: '192.168.1.52', details: 'Digital signature captured' },
  { id: _uid(), action: 'consent_sent', patient_name: 'Lisa A. Park', template: 'TMS / rTMS Consent Form', actor: 'Dr. James Wilson', timestamp: '2026-04-22T08:00:00Z', ip: '192.168.1.33', details: 'Consent form sent to patient for review' },
  { id: _uid(), action: 'consent_revoked', patient_name: 'Robert J. Garcia', template: 'tDCS Consent Form', actor: 'Dr. Emily Chen', timestamp: '2026-04-01T10:00:00Z', ip: '192.168.1.61', details: 'Patient withdrew from treatment; consent revoked at patient request' },
  { id: _uid(), action: 'consent_expired', patient_name: 'Jennifer L. Adams', template: 'TMS / rTMS Consent Form', actor: 'System', timestamp: '2026-03-10T00:00:00Z', ip: 'system', details: 'Consent passed 12-month validity window' },
];

// ── State ────────────────────────────────────────────────────────────────────
function defaultState() {
  return {
    tab: 'dashboard',          // dashboard | templates | builder | audit
    dashFilter: 'all',         // all | pending | signed | expired | revoked
    dashSearch: '',
    consents: [...DEMO_CONSENTS],
    auditLog: [...DEMO_AUDIT],
    // Builder state
    builder: {
      templateId: '',
      patientName: '',
      patientId: '',
      condition: '',
      device: '',
      customSections: null,    // null = use template defaults
      clinicianName: '',
      clinicianTitle: '',
      additionalNotes: '',
    },
    // Signature state
    signatureMode: false,
    signatureData: null,
    viewingConsent: null,      // consent id being viewed in detail
  };
}

// ── Page bootstrap ───────────────────────────────────────────────────────────
export async function pgConsentManagement(setTopbar, navigate) {
  if (typeof setTopbar === 'function') {
    setTopbar('Consent Management',
      `<span style="font-size:0.8rem;color:${T.t2};align-self:center">Safety & Governance \u00B7 informed consent tracking</span>`);
  }
  const root = document.getElementById('content');
  if (!root) return;

  // Initialise / restore state
  if (!window._consentState) window._consentState = defaultState();
  const S = window._consentState;

  // Try to load live consent records from API (graceful fallback)
  try {
    const liveConsents = await api.listConsentRecords();
    if (Array.isArray(liveConsents) && liveConsents.length) {
      S.consents = liveConsents;
    } else if (liveConsents?.items?.length) {
      S.consents = liveConsents.items;
    }
  } catch { /* use demo data */ }

  try {
    const liveAudit = await api.getConsentAuditLog();
    if (Array.isArray(liveAudit) && liveAudit.length) {
      S.auditLog = liveAudit;
    } else if (liveAudit?.items?.length) {
      S.auditLog = liveAudit.items;
    }
  } catch { /* use demo data */ }

  // ── Handlers ─────────────────────────────────────────────────────────────
  window._consentTab = (tab) => { S.tab = tab; S.viewingConsent = null; S.signatureMode = false; render(); };
  window._consentFilter = (f) => { S.dashFilter = f; render(); };
  window._consentSearch = (q) => { S.dashSearch = q; render(); };
  window._consentViewDetail = (id) => { S.viewingConsent = id; render(); };
  window._consentCloseDetail = () => { S.viewingConsent = null; S.signatureMode = false; render(); };

  window._consentUseTemplate = (tplId) => {
    S.tab = 'builder';
    S.builder.templateId = tplId;
    const tpl = CONSENT_TEMPLATES.find(t => t.id === tplId);
    if (tpl && tpl.deviceId) S.builder.device = tpl.deviceId;
    S.builder.customSections = null;
    render();
  };

  window._consentBuilderField = (field, value) => {
    S.builder[field] = value;
    // Auto-populate device risks when device changes
    if (field === 'device' && value) {
      S.builder.customSections = null;
    }
    render();
  };

  window._consentBuilderSectionEdit = (section, value) => {
    if (!S.builder.customSections) {
      const tpl = CONSENT_TEMPLATES.find(t => t.id === S.builder.templateId);
      S.builder.customSections = tpl ? JSON.parse(JSON.stringify(tpl.sections)) : {};
    }
    S.builder.customSections[section] = value;
  };

  window._consentSendForSignature = () => {
    const b = S.builder;
    if (!b.patientName || !b.templateId) {
      window._showNotifToast?.({ title: 'Required', body: 'Patient name and consent template are required.', severity: 'warn' });
      return;
    }
    const tpl = CONSENT_TEMPLATES.find(t => t.id === b.templateId);
    const newConsent = {
      id: _uid(),
      patient_name: b.patientName,
      patient_id: b.patientId || _uid(),
      template_id: b.templateId,
      template_name: tpl?.name || 'Custom Consent',
      status: 'pending',
      signed_at: null,
      expires_at: null,
      clinician: b.clinicianName || 'Current Clinician',
      ip_address: null,
      condition: b.condition || '',
      device: b.device || '',
      custom_sections: b.customSections,
      additional_notes: b.additionalNotes,
    };
    S.consents.unshift(newConsent);
    S.auditLog.unshift({
      id: _uid(),
      action: 'consent_created',
      patient_name: b.patientName,
      template: tpl?.name || 'Custom',
      actor: b.clinicianName || 'Clinician',
      timestamp: new Date().toISOString(),
      ip: 'local',
      details: 'Consent form created and sent for signature',
    });

    // Try to persist to backend
    api.createConsentRecord?.(newConsent).catch(() => {});

    window._showNotifToast?.({ title: 'Consent Sent', body: `Consent form sent to ${b.patientName} for signature.`, severity: 'success' });
    S.builder = defaultState().builder;
    S.tab = 'dashboard';
    render();
  };

  window._consentOpenSignature = (consentId) => {
    S.viewingConsent = consentId;
    S.signatureMode = true;
    S.signatureData = null;
    render();
    setTimeout(() => _initSignaturePad(), 50);
  };

  window._consentCompleteSignature = () => {
    const consent = S.consents.find(c => c.id === S.viewingConsent);
    if (!consent) return;
    const canvas = document.getElementById('cm-sig-canvas');
    const sigData = canvas ? canvas.toDataURL('image/png') : null;
    if (!sigData || _isCanvasBlank(canvas)) {
      window._showNotifToast?.({ title: 'Signature Required', body: 'Please sign in the signature pad before completing.', severity: 'warn' });
      return;
    }
    consent.status = 'signed';
    consent.signed_at = new Date().toISOString();
    consent.expires_at = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    consent.ip_address = '127.0.0.1';
    consent.signature_data = sigData;

    S.auditLog.unshift({
      id: _uid(),
      action: 'consent_signed',
      patient_name: consent.patient_name,
      template: consent.template_name,
      actor: consent.patient_name + ' (patient)',
      timestamp: consent.signed_at,
      ip: consent.ip_address,
      details: 'Digital signature captured and verified',
    });

    api.updateConsentRecord?.(consent.id, consent).catch(() => {});

    S.signatureMode = false;
    S.signatureData = sigData;
    window._showNotifToast?.({ title: 'Consent Signed', body: `${consent.patient_name} signed the ${consent.template_name}.`, severity: 'success' });
    render();
  };

  window._consentClearSignature = () => {
    const canvas = document.getElementById('cm-sig-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  window._consentRevoke = (consentId) => {
    const consent = S.consents.find(c => c.id === consentId);
    if (!consent) return;
    consent.status = 'revoked';
    consent.revoked_at = new Date().toISOString();
    consent.revoke_reason = 'Revoked by clinician';
    S.auditLog.unshift({
      id: _uid(),
      action: 'consent_revoked',
      patient_name: consent.patient_name,
      template: consent.template_name,
      actor: 'Clinician',
      timestamp: consent.revoked_at,
      ip: 'local',
      details: 'Consent revoked by clinician',
    });
    api.updateConsentRecord?.(consent.id, consent).catch(() => {});
    window._showNotifToast?.({ title: 'Consent Revoked', body: `Consent for ${consent.patient_name} has been revoked.`, severity: 'warn' });
    render();
  };

  window._consentExportPDF = (consentId) => {
    const consent = S.consents.find(c => c.id === consentId);
    if (!consent) return;
    const tpl = CONSENT_TEMPLATES.find(t => t.id === consent.template_id);
    const sections = consent.custom_sections || tpl?.sections || {};
    const risks = Array.isArray(sections.risks) ? sections.risks.join('\n  - ') : (sections.risks || '');
    const benefits = Array.isArray(sections.benefits) ? sections.benefits.join('\n  - ') : (sections.benefits || '');
    const alternatives = Array.isArray(sections.alternatives) ? sections.alternatives.join('\n  - ') : (sections.alternatives || '');
    const contraindications = Array.isArray(sections.contraindications) ? sections.contraindications.join('\n  - ') : (sections.contraindications || '');

    const text = [
      '==============================================================',
      `  INFORMED CONSENT - ${(consent.template_name || 'Consent Form').toUpperCase()}`,
      '==============================================================',
      '',
      `Patient: ${consent.patient_name}`,
      `Condition: ${consent.condition || 'N/A'}`,
      `Device: ${consent.device ? (DEVICES.find(d => d.id === consent.device)?.label || consent.device) : 'N/A'}`,
      `Clinician: ${consent.clinician || 'N/A'}`,
      `Status: ${consent.status.toUpperCase()}`,
      consent.signed_at ? `Signed: ${_fmtDateTime(consent.signed_at)}` : 'Awaiting signature',
      consent.expires_at ? `Expires: ${_fmtDate(consent.expires_at)}` : '',
      '',
      '--------------------------------------------------------------',
      '  PROCEDURE DESCRIPTION',
      '--------------------------------------------------------------',
      sections.procedure || 'See attached protocol documentation.',
      '',
      '--------------------------------------------------------------',
      '  RISKS AND SIDE EFFECTS',
      '--------------------------------------------------------------',
      risks ? `  - ${risks}` : 'See protocol documentation.',
      '',
      '--------------------------------------------------------------',
      '  POTENTIAL BENEFITS',
      '--------------------------------------------------------------',
      benefits ? `  - ${benefits}` : 'See protocol documentation.',
      '',
      '--------------------------------------------------------------',
      '  ALTERNATIVES',
      '--------------------------------------------------------------',
      alternatives ? `  - ${alternatives}` : 'See protocol documentation.',
      '',
      '--------------------------------------------------------------',
      '  CONTRAINDICATIONS',
      '--------------------------------------------------------------',
      contraindications ? `  - ${contraindications}` : 'See clinician assessment.',
      '',
      consent.additional_notes ? `\nAdditional Notes: ${consent.additional_notes}` : '',
      '',
      '--------------------------------------------------------------',
      '  PATIENT ACKNOWLEDGEMENT',
      '--------------------------------------------------------------',
      'I acknowledge that I have read and understand the above information.',
      'I have had the opportunity to ask questions and have received',
      'satisfactory answers. I voluntarily consent to the described procedure.',
      '',
      consent.signed_at ? `Signed electronically on ${_fmtDateTime(consent.signed_at)}` : '[AWAITING SIGNATURE]',
      consent.ip_address ? `IP Address: ${consent.ip_address}` : '',
      '',
      '--------------------------------------------------------------',
      '  CLINICIAN ATTESTATION',
      '--------------------------------------------------------------',
      `I, ${consent.clinician || '[Clinician Name]'}, attest that I have explained`,
      'the procedure, risks, benefits, and alternatives to the patient.',
      'The patient has demonstrated understanding and provided voluntary consent.',
      '',
      `Consent ID: ${consent.id}`,
      `Generated: ${_fmtDateTime(new Date().toISOString())}`,
      '==============================================================',
    ].filter(line => line !== null).join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    downloadBlob(blob, `consent-${consent.patient_name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.txt`);

    S.auditLog.unshift({
      id: _uid(),
      action: 'consent_exported',
      patient_name: consent.patient_name,
      template: consent.template_name,
      actor: 'Clinician',
      timestamp: new Date().toISOString(),
      ip: 'local',
      details: 'Consent document exported as PDF/text',
    });
  };

  function render() { _render(root, S); }
  render();
}

// ── Signature pad helpers ────────────────────────────────────────────────────
function _isCanvasBlank(canvas) {
  if (!canvas) return true;
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return false;
  }
  return true;
}

function _initSignaturePad() {
  const canvas = document.getElementById('cm-sig-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let lastX = 0, lastY = 0;

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if (e.touches && e.touches.length) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function startDraw(e) {
    e.preventDefault();
    drawing = true;
    const p = getPos(e);
    lastX = p.x;
    lastY = p.y;
  }

  function draw(e) {
    if (!drawing) return;
    e.preventDefault();
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastX = p.x;
    lastY = p.y;
  }

  function endDraw() { drawing = false; }

  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', endDraw);
  canvas.addEventListener('mouseleave', endDraw);
  canvas.addEventListener('touchstart', startDraw, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', endDraw);
}

// ── Render ───────────────────────────────────────────────────────────────────
function _render(root, S) {
  root.innerHTML = `
    ${_styleBlock()}
    <div class="cm-wrap">
      ${_tabBar(S.tab)}
      <div class="cm-body">
        ${S.viewingConsent ? _renderConsentDetail(S) : ''}
        ${!S.viewingConsent && S.tab === 'dashboard' ? _renderDashboard(S) : ''}
        ${!S.viewingConsent && S.tab === 'templates' ? _renderTemplates() : ''}
        ${!S.viewingConsent && S.tab === 'builder' ? _renderBuilder(S) : ''}
        ${!S.viewingConsent && S.tab === 'audit' ? _renderAudit(S) : ''}
      </div>
    </div>
  `;

  if (S.signatureMode) {
    setTimeout(() => _initSignaturePad(), 50);
  }
}

function _tabBar(active) {
  const tab = (id, label, icon, num) =>
    `<button class="cm-tab ${active === id ? 'active' : ''}" onclick="window._consentTab('${id}')">
       <span class="cm-tab-num">${num}</span>${icon} ${esc(label)}
     </button>`;
  return `
    <div class="cm-tab-bar">
      ${tab('dashboard', 'Dashboard', '\uD83D\uDCCB', '01')}
      ${tab('templates', 'Templates', '\uD83D\uDCC4', '02')}
      ${tab('builder', 'Form Builder', '\u270F\uFE0F', '03')}
      ${tab('audit', 'Audit Trail', '\uD83D\uDD0D', '04')}
      <div class="cm-tab-spacer"></div>
      <span class="cm-tab-hint">Safety & Governance</span>
    </div>
  `;
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function _renderDashboard(S) {
  const consents = S.consents;
  const counts = {
    all: consents.length,
    pending: consents.filter(c => c.status === 'pending').length,
    signed: consents.filter(c => c.status === 'signed').length,
    expired: consents.filter(c => c.status === 'expired').length,
    revoked: consents.filter(c => c.status === 'revoked').length,
  };

  let filtered = S.dashFilter === 'all' ? consents : consents.filter(c => c.status === S.dashFilter);
  if (S.dashSearch) {
    const q = S.dashSearch.toLowerCase();
    filtered = filtered.filter(c =>
      (c.patient_name || '').toLowerCase().includes(q) ||
      (c.template_name || '').toLowerCase().includes(q) ||
      (c.condition || '').toLowerCase().includes(q)
    );
  }

  const chip = (id, label, count, color) => {
    const isActive = S.dashFilter === id;
    return `<button class="cm-stat-chip ${isActive ? 'active' : ''}" style="${isActive ? `background:${color}22;border-color:${color};color:${color}` : ''}" onclick="window._consentFilter('${id}')">
      <span class="cm-stat-val" style="color:${color}">${count}</span>
      <span class="cm-stat-lbl">${esc(label)}</span>
    </button>`;
  };

  return `
    <div class="cm-dashboard">
      <div class="cm-stats-row">
        ${chip('all', 'Total', counts.all, T.teal)}
        ${chip('pending', 'Pending', counts.pending, T.amber)}
        ${chip('signed', 'Signed', counts.signed, T.green)}
        ${chip('expired', 'Expired', counts.expired, T.rose)}
        ${chip('revoked', 'Revoked', counts.revoked, T.t3)}
      </div>

      <div class="cm-toolbar">
        <input class="cm-search" type="text" placeholder="Search patients, templates, conditions\u2026"
               value="${esc(S.dashSearch)}" oninput="window._consentSearch(this.value)">
        <button class="cm-btn primary" onclick="window._consentTab('builder')">+ New Consent</button>
      </div>

      <div class="cm-table-wrap">
        <div class="cm-table-header">
          <span class="cm-th" style="flex:2">Patient</span>
          <span class="cm-th" style="flex:2">Template</span>
          <span class="cm-th" style="flex:1.5">Condition</span>
          <span class="cm-th" style="flex:1">Status</span>
          <span class="cm-th" style="flex:1.5">Signed</span>
          <span class="cm-th" style="flex:1.5">Expires</span>
          <span class="cm-th" style="flex:1">Actions</span>
        </div>
        ${filtered.length ? filtered.map(c => `
          <div class="cm-table-row" onclick="window._consentViewDetail('${esc(c.id)}')">
            <span class="cm-td" style="flex:2">
              <div class="cm-patient-name">${esc(c.patient_name)}</div>
            </span>
            <span class="cm-td" style="flex:2">
              <div class="cm-tpl-name">${esc(c.template_name)}</div>
            </span>
            <span class="cm-td" style="flex:1.5">
              <span class="cm-cond-pill">${esc(c.condition || '\u2014')}</span>
            </span>
            <span class="cm-td" style="flex:1">
              <span class="cm-status-badge" style="color:${_statusColor(c.status)};border-color:${_statusColor(c.status)}">${_statusIcon(c.status)} ${esc(c.status)}</span>
            </span>
            <span class="cm-td cm-td-date" style="flex:1.5">${_fmtDate(c.signed_at)}</span>
            <span class="cm-td cm-td-date" style="flex:1.5">${_fmtDate(c.expires_at)}</span>
            <span class="cm-td" style="flex:1" onclick="event.stopPropagation()">
              ${c.status === 'pending' ? `<button class="cm-action-btn" onclick="window._consentOpenSignature('${esc(c.id)}')" title="Capture signature">\u270D</button>` : ''}
              ${c.status === 'signed' ? `<button class="cm-action-btn" onclick="window._consentExportPDF('${esc(c.id)}')" title="Export">\u2913</button>` : ''}
              ${c.status === 'signed' ? `<button class="cm-action-btn rose" onclick="window._consentRevoke('${esc(c.id)}')" title="Revoke">\u2715</button>` : ''}
            </span>
          </div>
        `).join('') : `
          <div class="cm-empty">No consent records match the current filters.</div>
        `}
      </div>
    </div>
  `;
}

// ── Templates ────────────────────────────────────────────────────────────────
function _renderTemplates() {
  return `
    <div class="cm-templates">
      <div class="cm-templates-header">
        <div class="cm-templates-title">Consent Template Library</div>
        <div class="cm-templates-sub">Select a template to start a new consent form. Templates include device-specific risks and contraindications.</div>
      </div>
      <div class="cm-tpl-grid">
        ${CONSENT_TEMPLATES.map(tpl => {
          const dev = tpl.deviceId ? DEVICES.find(d => d.id === tpl.deviceId) : null;
          const catColor = tpl.category === 'research' ? T.violet : T.teal;
          return `
            <div class="cm-tpl-card" onclick="window._consentUseTemplate('${esc(tpl.id)}')">
              <div class="cm-tpl-card-icon" style="color:${catColor}">${dev ? dev.icon : '\uD83D\uDCC4'}</div>
              <div class="cm-tpl-card-body">
                <div class="cm-tpl-card-name">${esc(tpl.name)}</div>
                <div class="cm-tpl-card-desc">${esc(tpl.description)}</div>
                <div class="cm-tpl-card-meta">
                  <span class="cm-tpl-cat" style="color:${catColor};border-color:${catColor}">${esc(tpl.category)}</span>
                  ${dev ? `<span class="cm-tpl-device">${dev.icon} ${esc(dev.label)}</span>` : ''}
                  <span class="cm-tpl-sections">${Object.keys(tpl.sections).length} sections</span>
                </div>
              </div>
              <div class="cm-tpl-card-action">Use \u2192</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ── Builder ──────────────────────────────────────────────────────────────────
function _renderBuilder(S) {
  const b = S.builder;
  const tpl = CONSENT_TEMPLATES.find(t => t.id === b.templateId);
  const sections = b.customSections || tpl?.sections || {};
  const selectedDev = b.device ? DEVICES.find(d => d.id === b.device) : null;

  // Auto-augment risks/contraindications based on selected device
  let displayRisks = sections.risks || [];
  let displayContra = sections.contraindications || [];
  if (b.device && !b.customSections) {
    const devRisks = _buildDeviceRisks(b.device);
    const devContra = _buildDeviceContraindications(b.device);
    if (Array.isArray(displayRisks) && devRisks.length) displayRisks = devRisks;
    if (Array.isArray(displayContra) && devContra.length) displayContra = devContra;
  }

  const conditionOptions = CONDITIONS.map(c =>
    `<option value="${esc(c.id)}" ${b.condition === c.id ? 'selected' : ''}>${esc(c.label)}</option>`
  ).join('');

  const deviceOptions = DEVICES.map(d =>
    `<option value="${esc(d.id)}" ${b.device === d.id ? 'selected' : ''}>${d.icon} ${esc(d.label)}</option>`
  ).join('');

  const templateOptions = CONSENT_TEMPLATES.map(t =>
    `<option value="${esc(t.id)}" ${b.templateId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`
  ).join('');

  const _sectionEditor = (key, label, content) => {
    const val = Array.isArray(content) ? content.join('\n') : (content || '');
    return `
      <div class="cm-section-editor">
        <div class="cm-section-label">${esc(label)}</div>
        <textarea class="cm-section-textarea" oninput="window._consentBuilderSectionEdit('${key}', this.value)">${esc(val)}</textarea>
      </div>
    `;
  };

  return `
    <div class="cm-builder">
      <div class="cm-builder-grid">
        <div class="cm-builder-left">
          <div class="cm-group">
            <div class="cm-group-title"><span class="cm-num">01</span>Template & Patient</div>
            <label class="cm-label">Consent Template *</label>
            <select class="cm-input" onchange="window._consentBuilderField('templateId', this.value)">
              <option value="">Select template\u2026</option>
              ${templateOptions}
            </select>

            <div class="cm-row">
              <div style="flex:1">
                <label class="cm-label">Patient Name *</label>
                <input class="cm-input" type="text" placeholder="Full legal name" value="${esc(b.patientName)}"
                       oninput="window._consentBuilderField('patientName', this.value)">
              </div>
              <div style="flex:1">
                <label class="cm-label">Patient ID</label>
                <input class="cm-input" type="text" placeholder="e.g. PT-001" value="${esc(b.patientId)}"
                       oninput="window._consentBuilderField('patientId', this.value)">
              </div>
            </div>

            <div class="cm-row">
              <div style="flex:1">
                <label class="cm-label">Condition</label>
                <select class="cm-input" onchange="window._consentBuilderField('condition', this.value)">
                  <option value="">Select condition\u2026</option>
                  ${conditionOptions}
                </select>
              </div>
              <div style="flex:1">
                <label class="cm-label">Device / Modality</label>
                <select class="cm-input" onchange="window._consentBuilderField('device', this.value)">
                  <option value="">Select device\u2026</option>
                  ${deviceOptions}
                </select>
              </div>
            </div>
          </div>

          <div class="cm-group">
            <div class="cm-group-title"><span class="cm-num">02</span>Procedure Description</div>
            ${_sectionEditor('procedure', 'Describe the procedure to the patient', sections.procedure)}
          </div>

          <div class="cm-group">
            <div class="cm-group-title"><span class="cm-num">03</span>Risks & Side Effects</div>
            ${_sectionEditor('risks', 'List risks and potential side effects (one per line)', displayRisks)}
          </div>

          <div class="cm-group">
            <div class="cm-group-title"><span class="cm-num">04</span>Benefits</div>
            ${_sectionEditor('benefits', 'Describe potential benefits', sections.benefits)}
          </div>

          <div class="cm-group">
            <div class="cm-group-title"><span class="cm-num">05</span>Alternatives</div>
            ${_sectionEditor('alternatives', 'List treatment alternatives', sections.alternatives)}
          </div>

          <div class="cm-group">
            <div class="cm-group-title"><span class="cm-num">06</span>Contraindications</div>
            ${_sectionEditor('contraindications', 'List contraindications', displayContra)}
          </div>
        </div>

        <div class="cm-builder-right">
          <div class="cm-group">
            <div class="cm-group-title"><span class="cm-num">07</span>Clinician Attestation</div>
            <label class="cm-label">Clinician Name</label>
            <input class="cm-input" type="text" placeholder="Dr. Jane Smith" value="${esc(b.clinicianName)}"
                   oninput="window._consentBuilderField('clinicianName', this.value)">
            <label class="cm-label">Title / Credentials</label>
            <input class="cm-input" type="text" placeholder="MD, PhD, Board Certified" value="${esc(b.clinicianTitle)}"
                   oninput="window._consentBuilderField('clinicianTitle', this.value)">
            <label class="cm-label">Additional Notes</label>
            <textarea class="cm-section-textarea" style="min-height:80px" placeholder="Any additional information for the patient\u2026"
                      oninput="window._consentBuilderField('additionalNotes', this.value)">${esc(b.additionalNotes)}</textarea>
          </div>

          <div class="cm-group">
            <div class="cm-group-title"><span class="cm-num">08</span>Preview</div>
            <div class="cm-preview">
              <div class="cm-preview-title">${esc(tpl?.name || 'Select a template')}</div>
              <div class="cm-preview-patient">${esc(b.patientName || 'Patient name required')}</div>
              ${b.condition ? `<div class="cm-preview-cond">${esc(CONDITIONS.find(c => c.id === b.condition)?.label || b.condition)}</div>` : ''}
              ${selectedDev ? `<div class="cm-preview-device">${selectedDev.icon} ${esc(selectedDev.label)}</div>` : ''}
              <div class="cm-preview-sections">${Object.keys(sections).length} sections configured</div>
            </div>
          </div>

          <div class="cm-builder-actions">
            <button class="cm-btn ghost" onclick="window._consentTab('templates')">Back to Templates</button>
            <button class="cm-btn primary" onclick="window._consentSendForSignature()">Send for Signature \u2192</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── Consent detail / signature ───────────────────────────────────────────────
function _renderConsentDetail(S) {
  const consent = S.consents.find(c => c.id === S.viewingConsent);
  if (!consent) return '<div class="cm-empty">Consent record not found.</div>';

  const tpl = CONSENT_TEMPLATES.find(t => t.id === consent.template_id);
  const sections = consent.custom_sections || tpl?.sections || {};
  const dev = consent.device ? DEVICES.find(d => d.id === consent.device) : null;

  const _listSection = (items) => {
    if (!items) return '<div class="cm-detail-text">\u2014</div>';
    const arr = Array.isArray(items) ? items : String(items).split('\n').filter(Boolean);
    if (!arr.length) return '<div class="cm-detail-text">\u2014</div>';
    return `<ul class="cm-detail-list">${arr.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
  };

  const signaturePad = S.signatureMode ? `
    <div class="cm-signature-section">
      <div class="cm-group-title"><span class="cm-num">\u270D</span>Digital Signature</div>
      <div class="cm-sig-instructions">Please sign in the box below using your mouse or touch input. This constitutes your electronic signature.</div>
      <div class="cm-sig-pad-wrap">
        <canvas id="cm-sig-canvas" class="cm-sig-canvas" width="560" height="180"></canvas>
      </div>
      <div class="cm-sig-actions">
        <button class="cm-btn ghost" onclick="window._consentClearSignature()">Clear</button>
        <button class="cm-btn primary" onclick="window._consentCompleteSignature()">Complete Signature</button>
      </div>
    </div>
  ` : '';

  const signatureDisplay = consent.signature_data && !S.signatureMode ? `
    <div class="cm-signature-display">
      <div class="cm-group-title"><span class="cm-num">\u2713</span>Captured Signature</div>
      <img src="${consent.signature_data}" class="cm-sig-image" alt="Patient signature">
      <div class="cm-sig-meta">Signed: ${_fmtDateTime(consent.signed_at)} \u00B7 IP: ${esc(consent.ip_address || 'N/A')}</div>
    </div>
  ` : '';

  // Relevant audit entries
  const relatedAudit = S.auditLog.filter(a =>
    a.patient_name === consent.patient_name && a.template === consent.template_name
  ).slice(0, 10);

  return `
    <div class="cm-detail">
      <div class="cm-detail-toolbar">
        <button class="cm-back-btn" onclick="window._consentCloseDetail()">\u2190 Back to Dashboard</button>
        <div class="cm-detail-actions">
          ${consent.status === 'pending' ? `<button class="cm-btn primary" onclick="window._consentOpenSignature('${esc(consent.id)}')">Capture Signature</button>` : ''}
          ${consent.status === 'signed' ? `<button class="cm-btn ghost" onclick="window._consentExportPDF('${esc(consent.id)}')">Export</button>` : ''}
          ${consent.status === 'signed' ? `<button class="cm-btn rose" onclick="window._consentRevoke('${esc(consent.id)}')">Revoke</button>` : ''}
        </div>
      </div>

      <div class="cm-detail-hero">
        <div class="cm-detail-hero-icon">${dev ? dev.icon : '\uD83D\uDCC4'}</div>
        <div class="cm-detail-hero-body">
          <h2 class="cm-detail-hero-title">${esc(consent.template_name)}</h2>
          <div class="cm-detail-hero-meta">
            <span class="cm-detail-patient">${esc(consent.patient_name)}</span>
            <span class="cm-status-badge" style="color:${_statusColor(consent.status)};border-color:${_statusColor(consent.status)}">${_statusIcon(consent.status)} ${esc(consent.status)}</span>
            ${consent.condition ? `<span class="cm-cond-pill">${esc(consent.condition)}</span>` : ''}
          </div>
          <div class="cm-detail-hero-dates">
            <span>Clinician: ${esc(consent.clinician)}</span>
            ${consent.signed_at ? `<span>Signed: ${_fmtDateTime(consent.signed_at)}</span>` : '<span>Awaiting signature</span>'}
            ${consent.expires_at ? `<span>Expires: ${_fmtDate(consent.expires_at)}</span>` : ''}
          </div>
        </div>
      </div>

      <div class="cm-detail-grid">
        <div class="cm-detail-left">
          <div class="cm-detail-card">
            <div class="cm-detail-card-title">Procedure Description</div>
            <div class="cm-detail-text">${esc(sections.procedure || '\u2014')}</div>
          </div>

          <div class="cm-detail-card">
            <div class="cm-detail-card-title">Risks & Side Effects</div>
            ${_listSection(sections.risks)}
          </div>

          <div class="cm-detail-card">
            <div class="cm-detail-card-title">Potential Benefits</div>
            ${_listSection(sections.benefits)}
          </div>

          <div class="cm-detail-card">
            <div class="cm-detail-card-title">Alternatives</div>
            ${_listSection(sections.alternatives)}
          </div>

          <div class="cm-detail-card">
            <div class="cm-detail-card-title">Contraindications</div>
            ${_listSection(sections.contraindications)}
          </div>

          ${signaturePad}
          ${signatureDisplay}
        </div>

        <div class="cm-detail-right">
          <div class="cm-detail-card">
            <div class="cm-detail-card-title">Consent Audit Trail</div>
            ${relatedAudit.length ? relatedAudit.map(a => `
              <div class="cm-audit-row-mini">
                <div class="cm-audit-action-mini ${a.action.includes('revoke') ? 'rose' : a.action.includes('sign') ? 'green' : ''}">${esc(a.action.replace('consent_', '').replace(/_/g, ' '))}</div>
                <div class="cm-audit-meta-mini">${esc(a.actor)} \u00B7 ${_fmtDateTime(a.timestamp)}</div>
                <div class="cm-audit-detail-mini">${esc(a.details)}</div>
              </div>
            `).join('') : '<div class="cm-empty-small">No audit entries for this consent.</div>'}
          </div>

          ${consent.additional_notes ? `
          <div class="cm-detail-card">
            <div class="cm-detail-card-title">Additional Notes</div>
            <div class="cm-detail-text">${esc(consent.additional_notes)}</div>
          </div>` : ''}

          <div class="cm-detail-card">
            <div class="cm-detail-card-title">Record Details</div>
            <div class="cm-kv"><span>Consent ID</span><span class="cm-kv-val">${esc(consent.id)}</span></div>
            <div class="cm-kv"><span>Patient ID</span><span class="cm-kv-val">${esc(consent.patient_id)}</span></div>
            ${consent.ip_address ? `<div class="cm-kv"><span>IP Address</span><span class="cm-kv-val">${esc(consent.ip_address)}</span></div>` : ''}
            ${consent.revoked_at ? `<div class="cm-kv"><span>Revoked</span><span class="cm-kv-val" style="color:${T.rose}">${_fmtDateTime(consent.revoked_at)}</span></div>` : ''}
            ${consent.revoke_reason ? `<div class="cm-kv"><span>Reason</span><span class="cm-kv-val">${esc(consent.revoke_reason)}</span></div>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── Audit Trail ──────────────────────────────────────────────────────────────
function _renderAudit(S) {
  const log = S.auditLog;

  const _actionColor = (action) => {
    if (action.includes('sign')) return T.green;
    if (action.includes('revoke')) return T.rose;
    if (action.includes('expire')) return T.amber;
    if (action.includes('export')) return T.blue;
    return T.teal;
  };

  const _actionIcon = (action) => {
    if (action.includes('sign')) return '\u2713';
    if (action.includes('revoke')) return '\u2715';
    if (action.includes('expire')) return '\u29B0';
    if (action.includes('create')) return '+';
    if (action.includes('export')) return '\u2913';
    if (action.includes('sent')) return '\u2709';
    return '\u25CB';
  };

  return `
    <div class="cm-audit">
      <div class="cm-audit-header">
        <div class="cm-audit-title">Consent Audit Trail</div>
        <div class="cm-audit-sub">Complete record of all consent-related actions. Every creation, signature, revocation, and export is logged with timestamp and IP.</div>
      </div>

      <div class="cm-audit-table">
        <div class="cm-audit-table-header">
          <span class="cm-th" style="flex:0.5"></span>
          <span class="cm-th" style="flex:1.5">Action</span>
          <span class="cm-th" style="flex:2">Patient</span>
          <span class="cm-th" style="flex:2">Template</span>
          <span class="cm-th" style="flex:1.5">Actor</span>
          <span class="cm-th" style="flex:2">Timestamp</span>
          <span class="cm-th" style="flex:1">IP</span>
        </div>
        ${log.map(a => `
          <div class="cm-audit-row">
            <span class="cm-td" style="flex:0.5">
              <span class="cm-audit-icon" style="color:${_actionColor(a.action)};background:${_actionColor(a.action)}18">${_actionIcon(a.action)}</span>
            </span>
            <span class="cm-td" style="flex:1.5">
              <span class="cm-audit-action" style="color:${_actionColor(a.action)}">${esc(a.action.replace('consent_', '').replace(/_/g, ' '))}</span>
            </span>
            <span class="cm-td" style="flex:2">${esc(a.patient_name)}</span>
            <span class="cm-td cm-td-mono" style="flex:2">${esc(a.template)}</span>
            <span class="cm-td" style="flex:1.5">${esc(a.actor)}</span>
            <span class="cm-td cm-td-date" style="flex:2">${_fmtDateTime(a.timestamp)}</span>
            <span class="cm-td cm-td-mono" style="flex:1">${esc(a.ip)}</span>
          </div>
          <div class="cm-audit-detail-row">${esc(a.details)}</div>
        `).join('')}
      </div>
    </div>
  `;
}

// ── Style block ──────────────────────────────────────────────────────────────
function _styleBlock() {
  return `<style>
    .cm-wrap { display:flex; flex-direction:column; height:100%; background:${T.bg}; color:${T.t1}; font-family:${T.fbody}; }

    /* Tab bar */
    .cm-tab-bar { display:flex; align-items:center; gap:6px; padding:10px 18px; border-bottom:1px solid ${T.border}; background:${T.panel}; flex-wrap:wrap; }
    .cm-tab { display:inline-flex; align-items:center; gap:8px; padding:7px 14px; border-radius:999px; border:1px solid ${T.border}; background:transparent; color:${T.t2}; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; transition:all 120ms; }
    .cm-tab:hover { color:${T.t1}; border-color:${T.teal}44; }
    .cm-tab.active { background:${T.teal}22; border-color:${T.teal}; color:${T.teal}; }
    .cm-tab-num { font-family:${T.fmono}; font-size:10px; opacity:0.7; }
    .cm-tab-spacer { flex:1; }
    .cm-tab-hint { font-family:${T.fmono}; font-size:10.5px; color:${T.t3}; }

    /* Body */
    .cm-body { flex:1; overflow-y:auto; padding:20px; }

    /* Stats & toolbar */
    .cm-stats-row { display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap; }
    .cm-stat-chip { display:flex; align-items:center; gap:8px; padding:10px 16px; border:1px solid ${T.border}; border-radius:10px; background:${T.surface}; cursor:pointer; font-family:inherit; transition:all 120ms; }
    .cm-stat-chip:hover { border-color:${T.teal}44; }
    .cm-stat-chip.active { border-width:1.5px; }
    .cm-stat-val { font-family:${T.fdisp}; font-size:20px; font-weight:700; }
    .cm-stat-lbl { font-size:11.5px; color:${T.t2}; font-weight:500; }

    .cm-toolbar { display:flex; gap:10px; margin-bottom:16px; align-items:center; flex-wrap:wrap; }
    .cm-search { flex:1; min-width:200px; padding:9px 14px; background:${T.surface}; border:1px solid ${T.border}; border-radius:8px; color:${T.t1}; font-size:12.5px; font-family:inherit; }
    .cm-search:focus { outline:none; border-color:${T.teal}; }

    /* Buttons */
    .cm-btn { padding:8px 16px; border-radius:8px; font-size:12.5px; font-weight:600; cursor:pointer; font-family:inherit; border:1px solid ${T.border}; transition:all 120ms; }
    .cm-btn.primary { background:${T.teal}; color:#04121c; border-color:${T.teal}; }
    .cm-btn.primary:hover { filter:brightness(1.08); }
    .cm-btn.ghost { background:transparent; color:${T.t2}; }
    .cm-btn.ghost:hover { color:${T.t1}; border-color:${T.teal}66; }
    .cm-btn.rose { background:${T.rose}22; color:${T.rose}; border-color:${T.rose}55; }
    .cm-btn.rose:hover { background:${T.rose}33; }

    /* Table */
    .cm-table-wrap { border:1px solid ${T.border}; border-radius:10px; overflow:hidden; }
    .cm-table-header { display:flex; padding:10px 14px; background:${T.panel}; border-bottom:1px solid ${T.border}; }
    .cm-th { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:${T.t3}; }
    .cm-table-row { display:flex; padding:12px 14px; border-bottom:1px solid ${T.border}; cursor:pointer; transition:background 120ms; align-items:center; }
    .cm-table-row:hover { background:${T.surface}; }
    .cm-table-row:last-child { border-bottom:none; }
    .cm-td { font-size:12.5px; color:${T.t1}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .cm-td-date { font-family:${T.fmono}; font-size:11.5px; color:${T.t2}; }
    .cm-td-mono { font-family:${T.fmono}; font-size:11px; }
    .cm-patient-name { font-weight:600; }
    .cm-tpl-name { font-size:12px; color:${T.t2}; }
    .cm-cond-pill { font-size:10.5px; padding:2px 8px; border-radius:4px; background:${T.surface2}; color:${T.t2}; font-family:${T.fmono}; }
    .cm-status-badge { font-size:11px; padding:3px 8px; border-radius:5px; border:1px solid; font-weight:600; font-family:${T.fmono}; text-transform:capitalize; white-space:nowrap; }
    .cm-action-btn { width:28px; height:28px; border:1px solid ${T.border}; border-radius:6px; background:transparent; color:${T.t2}; cursor:pointer; font-size:13px; display:inline-flex; align-items:center; justify-content:center; margin-right:4px; transition:all 120ms; }
    .cm-action-btn:hover { color:${T.teal}; border-color:${T.teal}; background:${T.teal}11; }
    .cm-action-btn.rose:hover { color:${T.rose}; border-color:${T.rose}; background:${T.rose}11; }
    .cm-empty { padding:32px; text-align:center; color:${T.t3}; font-size:13px; }
    .cm-empty-small { padding:12px 0; text-align:center; color:${T.t3}; font-size:11.5px; }

    /* Templates */
    .cm-templates { padding:4px 0; }
    .cm-templates-header { margin-bottom:20px; }
    .cm-templates-title { font-family:${T.fdisp}; font-size:20px; font-weight:700; color:${T.t1}; }
    .cm-templates-sub { font-size:12.5px; color:${T.t3}; margin-top:4px; }
    .cm-tpl-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:14px; }
    .cm-tpl-card { background:${T.panel}; border:1px solid ${T.border}; border-radius:12px; cursor:pointer; display:flex; gap:14px; padding:16px; transition:border-color 120ms, transform 120ms; align-items:flex-start; }
    .cm-tpl-card:hover { border-color:${T.teal}; transform:translateY(-1px); }
    .cm-tpl-card-icon { font-size:28px; flex-shrink:0; width:44px; height:44px; display:flex; align-items:center; justify-content:center; background:${T.surface}; border-radius:10px; }
    .cm-tpl-card-body { flex:1; min-width:0; }
    .cm-tpl-card-name { font-family:${T.fdisp}; font-size:14px; font-weight:700; color:${T.t1}; margin-bottom:4px; }
    .cm-tpl-card-desc { font-size:11.5px; color:${T.t3}; line-height:1.45; margin-bottom:8px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .cm-tpl-card-meta { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
    .cm-tpl-cat { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; padding:2px 7px; border:1px solid; border-radius:4px; }
    .cm-tpl-device { font-size:10.5px; color:${T.t2}; font-family:${T.fmono}; }
    .cm-tpl-sections { font-size:10.5px; color:${T.t3}; font-family:${T.fmono}; }
    .cm-tpl-card-action { font-size:11px; color:${T.teal}; font-weight:600; flex-shrink:0; align-self:center; }

    /* Builder */
    .cm-builder { padding:4px 0; }
    .cm-builder-grid { display:grid; grid-template-columns:1fr 340px; gap:20px; }
    @media (max-width: 900px) { .cm-builder-grid { grid-template-columns:1fr; } }
    .cm-group { padding:14px 0; border-bottom:1px solid ${T.border}; }
    .cm-group:last-child { border-bottom:none; }
    .cm-group-title { display:flex; align-items:center; gap:8px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:${T.t2}; margin-bottom:12px; }
    .cm-num { font-family:${T.fmono}; color:${T.teal}; background:${T.teal}22; padding:1px 6px; border-radius:4px; font-size:9.5px; }
    .cm-label { display:block; font-size:11.5px; font-weight:600; color:${T.t2}; margin:10px 0 4px; }
    .cm-input { width:100%; padding:8px 12px; background:${T.surface}; border:1px solid ${T.border}; border-radius:7px; color:${T.t1}; font-size:12.5px; font-family:inherit; box-sizing:border-box; }
    .cm-input:focus { outline:none; border-color:${T.teal}; }
    .cm-row { display:flex; gap:12px; }
    .cm-row > div { flex:1; }

    .cm-section-editor { margin-top:8px; }
    .cm-section-label { font-size:10.5px; color:${T.t3}; margin-bottom:4px; }
    .cm-section-textarea { width:100%; min-height:100px; padding:10px 12px; background:${T.surface}; border:1px solid ${T.border}; border-radius:7px; color:${T.t1}; font-size:12px; font-family:inherit; resize:vertical; line-height:1.55; box-sizing:border-box; }
    .cm-section-textarea:focus { outline:none; border-color:${T.teal}; }

    .cm-preview { background:${T.surface}; border:1px solid ${T.border}; border-radius:10px; padding:16px; }
    .cm-preview-title { font-family:${T.fdisp}; font-size:14px; font-weight:700; color:${T.t1}; margin-bottom:6px; }
    .cm-preview-patient { font-size:13px; font-weight:600; color:${T.teal}; margin-bottom:4px; }
    .cm-preview-cond, .cm-preview-device { font-size:11px; color:${T.t2}; font-family:${T.fmono}; margin-top:2px; }
    .cm-preview-sections { font-size:10.5px; color:${T.t3}; margin-top:8px; font-family:${T.fmono}; }

    .cm-builder-actions { display:flex; gap:10px; margin-top:16px; }
    .cm-builder-actions .cm-btn { flex:1; text-align:center; }

    /* Detail view */
    .cm-detail { padding:4px 0; }
    .cm-detail-toolbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
    .cm-back-btn { background:none; border:none; color:${T.t2}; font-size:12.5px; cursor:pointer; font-family:inherit; padding:0; }
    .cm-back-btn:hover { color:${T.teal}; }
    .cm-detail-actions { display:flex; gap:8px; }

    .cm-detail-hero { display:flex; gap:16px; padding:20px; background:${T.panel}; border:1px solid ${T.border}; border-radius:12px; margin-bottom:16px; align-items:flex-start; }
    .cm-detail-hero-icon { font-size:32px; width:56px; height:56px; display:flex; align-items:center; justify-content:center; background:${T.surface}; border-radius:12px; flex-shrink:0; }
    .cm-detail-hero-body { flex:1; }
    .cm-detail-hero-title { font-family:${T.fdisp}; font-size:18px; font-weight:700; color:${T.t1}; margin:0 0 6px; }
    .cm-detail-hero-meta { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
    .cm-detail-patient { font-size:13px; font-weight:600; color:${T.teal}; }
    .cm-detail-hero-dates { display:flex; gap:14px; margin-top:8px; font-size:11px; color:${T.t3}; font-family:${T.fmono}; flex-wrap:wrap; }

    .cm-detail-grid { display:grid; grid-template-columns:1fr 340px; gap:16px; }
    @media (max-width: 900px) { .cm-detail-grid { grid-template-columns:1fr; } }
    .cm-detail-card { background:${T.panel}; border:1px solid ${T.border}; border-radius:10px; padding:16px; margin-bottom:12px; }
    .cm-detail-card-title { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:${T.t2}; margin-bottom:10px; }
    .cm-detail-text { font-size:12.5px; color:${T.t2}; line-height:1.6; white-space:pre-wrap; }
    .cm-detail-list { margin:0; padding:0 0 0 18px; font-size:12.5px; color:${T.t2}; line-height:1.65; }
    .cm-detail-list li { margin-bottom:4px; }

    .cm-kv { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid ${T.border}; font-size:11.5px; }
    .cm-kv:last-child { border-bottom:none; }
    .cm-kv span:first-child { color:${T.t3}; }
    .cm-kv-val { color:${T.t1}; font-family:${T.fmono}; font-size:11px; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

    /* Signature */
    .cm-signature-section { background:${T.panel}; border:1px solid ${T.teal}44; border-radius:10px; padding:20px; margin-top:12px; }
    .cm-sig-instructions { font-size:12px; color:${T.t2}; margin-bottom:12px; line-height:1.5; }
    .cm-sig-pad-wrap { border:2px dashed ${T.border}; border-radius:8px; padding:4px; background:${T.surface}; }
    .cm-sig-canvas { display:block; width:100%; height:180px; cursor:crosshair; border-radius:6px; touch-action:none; }
    .cm-sig-actions { display:flex; gap:10px; margin-top:12px; justify-content:flex-end; }
    .cm-signature-display { background:${T.panel}; border:1px solid ${T.green}44; border-radius:10px; padding:16px; margin-top:12px; }
    .cm-sig-image { max-width:100%; height:auto; border:1px solid ${T.border}; border-radius:6px; background:#0a1d29; margin-top:8px; }
    .cm-sig-meta { font-size:10.5px; color:${T.t3}; margin-top:8px; font-family:${T.fmono}; }

    /* Audit mini rows inside detail */
    .cm-audit-row-mini { padding:8px 0; border-bottom:1px solid ${T.border}; }
    .cm-audit-row-mini:last-child { border-bottom:none; }
    .cm-audit-action-mini { font-size:11.5px; font-weight:700; text-transform:capitalize; color:${T.teal}; }
    .cm-audit-action-mini.rose { color:${T.rose}; }
    .cm-audit-action-mini.green { color:${T.green}; }
    .cm-audit-meta-mini { font-size:10.5px; color:${T.t3}; font-family:${T.fmono}; margin-top:2px; }
    .cm-audit-detail-mini { font-size:11px; color:${T.t2}; margin-top:3px; }

    /* Audit full page */
    .cm-audit { padding:4px 0; }
    .cm-audit-header { margin-bottom:20px; }
    .cm-audit-title { font-family:${T.fdisp}; font-size:20px; font-weight:700; color:${T.t1}; }
    .cm-audit-sub { font-size:12.5px; color:${T.t3}; margin-top:4px; line-height:1.5; }
    .cm-audit-table { border:1px solid ${T.border}; border-radius:10px; overflow:hidden; }
    .cm-audit-table-header { display:flex; padding:10px 14px; background:${T.panel}; border-bottom:1px solid ${T.border}; }
    .cm-audit-row { display:flex; padding:10px 14px; border-bottom:1px solid ${T.border}; align-items:center; }
    .cm-audit-detail-row { padding:0 14px 10px 46px; font-size:11px; color:${T.t3}; border-bottom:1px solid ${T.border}; line-height:1.4; }
    .cm-audit-icon { width:24px; height:24px; border-radius:6px; display:inline-flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; }
    .cm-audit-action { font-size:12px; font-weight:600; text-transform:capitalize; }

    /* Responsive */
    @media (max-width: 768px) {
      .cm-table-header, .cm-audit-table-header { display:none; }
      .cm-table-row, .cm-audit-row { flex-wrap:wrap; gap:6px; }
      .cm-table-row .cm-td, .cm-audit-row .cm-td { flex:auto !important; }
      .cm-tpl-grid { grid-template-columns:1fr; }
      .cm-detail-hero { flex-direction:column; }
    }
  </style>`;
}
