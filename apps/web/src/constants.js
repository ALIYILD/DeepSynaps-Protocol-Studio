// ── Centralized fallback constants ─────────────────────────────────────────
// Used when registry APIs are unavailable.
// Pages should load from live API first; fall back to these only on failure.
// NEVER duplicate these inline in page files.

export const FALLBACK_CONDITIONS = [
  'Major Depressive Disorder',
  'Treatment-Resistant Depression',
  'ADHD',
  'Anxiety / GAD',
  'PTSD',
  'OCD',
  'Chronic Pain',
  "Parkinson's Disease",
  'Post-Stroke Rehabilitation',
  'Insomnia',
  'Autism Spectrum',
  'Other',
];

export const FALLBACK_MODALITIES = [
  'tDCS',
  'TMS / rTMS',
  'iTBS',
  'taVNS',
  'CES',
  'Neurofeedback',
  'TPS',
  'PBM',
  'Multimodal',
];

export const FALLBACK_ASSESSMENT_TEMPLATES = [
  { id: 'PHQ-9',     label: 'PHQ-9 — Depression (9-item)' },
  { id: 'HAM-D',     label: 'HAM-D — Hamilton Depression' },
  { id: 'MADRS',     label: 'MADRS — Montgomery-Åsberg' },
  { id: 'QIDS',      label: 'QIDS — Quick Inventory' },
  { id: 'GAD-7',     label: 'GAD-7 — Anxiety' },
  { id: 'PCL-5',     label: 'PCL-5 — PTSD Checklist' },
  { id: 'Y-BOCS',    label: 'Y-BOCS — OCD' },
  { id: 'ISI',       label: 'ISI — Insomnia Severity' },
  { id: 'DASS-21',   label: 'DASS-21 — Depression/Anxiety/Stress' },
  { id: 'ADHD-RS-5', label: 'ADHD Rating Scale 5' },
  { id: 'UPDRS-III', label: "UPDRS-III — Parkinson's Motor" },
  { id: 'NRS-Pain',  label: 'NRS-Pain — Numeric Rating Scale' },
];

export const COURSE_STATUS_COLORS = {
  pending_approval: 'var(--amber)',
  approved:         'var(--blue)',
  active:           'var(--teal)',
  paused:           'var(--amber)',
  completed:        'var(--green)',
  discontinued:     'var(--red)',
};

export const EVIDENCE_GRADE_COLORS = {
  'EV-A': 'var(--teal)',
  'EV-B': 'var(--blue)',
  'EV-C': 'var(--amber)',
  'EV-D': 'var(--red)',
};

// Role display labels
export const ROLE_LABELS = {
  admin:         'Admin',
  clinician:     'Clinician',
  resident:      'Resident',
  'clinic-admin':'Clinic Admin',
  reviewer:      'Reviewer',
  supervisor:    'Supervisor',
  technician:    'Technician',
  guest:         'Guest',
};

// Role-based nav entry points (first page shown after login)
export const ROLE_ENTRY_PAGE = {
  admin:         'dashboard',
  clinician:     'dashboard',
  resident:      'courses',
  'clinic-admin':'dashboard',
  reviewer:      'review-queue',
  supervisor:    'review-queue',
  technician:    'session-execution',
  guest:         'protocols-registry',
};
