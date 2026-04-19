// ── Centralized fallback constants ─────────────────────────────────────────
// Used when registry APIs are unavailable.
// Pages should load from live API first; fall back to these only on failure.
// NEVER duplicate these inline in page files.
// Full registry data lives in src/registries/ (Phase 2).

export const FALLBACK_CONDITIONS = [
  'Major Depressive Disorder',
  'Treatment-Resistant Depression',
  'Bipolar I Depression',
  'Bipolar II Depression',
  'Postpartum Depression',
  'Premenstrual Dysphoric Disorder',
  'Persistent Depressive Disorder',
  'Seasonal Affective Disorder',
  'Generalized Anxiety Disorder',
  'Social Anxiety Disorder',
  'Panic Disorder',
  'Specific Phobia',
  'Agoraphobia',
  'PTSD',
  'Complex PTSD',
  'Acute Stress Disorder',
  'OCD',
  'Body Dysmorphic Disorder',
  'Trichotillomania',
  'Excoriation Disorder',
  'ADHD (Inattentive)',
  'ADHD (Hyperactive/Combined)',
  'Autism Spectrum Disorder',
  'Tourette Syndrome',
  'Schizophrenia',
  'Schizoaffective Disorder',
  'Negative Symptoms (Schizophrenia)',
  "Parkinson's Disease",
  'Alzheimer\'s Disease',
  'Mild Cognitive Impairment',
  'Lewy Body Dementia',
  'Essential Tremor',
  'Dystonia',
  'Stroke Rehabilitation (Motor)',
  'Stroke Rehabilitation (Aphasia)',
  'Traumatic Brain Injury',
  'Post-Concussion Syndrome',
  'Multiple Sclerosis',
  'Drug-Resistant Epilepsy',
  'Chronic Migraine',
  'Tinnitus',
  'Neurological Dysphagia',
  'Spinal Cord Injury',
  'Chronic Pain',
  'Neuropathic Pain',
  'Fibromyalgia',
  'Complex Regional Pain Syndrome',
  'Phantom Limb Pain',
  'Chemotherapy-Induced Neuropathy',
  'Insomnia Disorder',
  'Substance Use Disorder',
  'Eating Disorders',
  'Long COVID Neurocognitive Syndrome',
  'Other',
];

export const FALLBACK_MODALITIES = [
  'TMS/rTMS',
  'iTBS',
  'cTBS',
  'Deep TMS',
  'tDCS',
  'tACS',
  'tRNS',
  'taVNS',
  'CES',
  'Neurofeedback',
  'TPS',
  'PBM',
  'Multimodal',
];

export const FALLBACK_ASSESSMENT_TEMPLATES = [
  // Depression
  { id: 'PHQ-9',     label: 'PHQ-9 — Patient Health Questionnaire-9' },
  { id: 'HAM-D17',   label: 'HAM-D17 — Hamilton Depression Rating Scale' },
  { id: 'MADRS',     label: 'MADRS — Montgomery-Åsberg Depression' },
  { id: 'QIDS-SR16', label: 'QIDS-SR16 — Quick Inventory of Depressive Symptoms' },
  { id: 'BDI-II',    label: 'BDI-II — Beck Depression Inventory' },
  // Anxiety
  { id: 'GAD-7',     label: 'GAD-7 — Generalized Anxiety Disorder Scale' },
  { id: 'HAM-A',     label: 'HAM-A — Hamilton Anxiety Rating Scale' },
  { id: 'LSAS',      label: 'LSAS — Liebowitz Social Anxiety Scale' },
  // PTSD
  { id: 'PCL-5',     label: 'PCL-5 — PTSD Checklist (DSM-5)' },
  { id: 'CAPS-5',    label: 'CAPS-5 — Clinician-Administered PTSD Scale' },
  // OCD
  { id: 'Y-BOCS',    label: 'Y-BOCS — Yale-Brown Obsessive Compulsive Scale' },
  { id: 'OCI-R',     label: 'OCI-R — OCD Inventory (Revised)' },
  // ADHD
  { id: 'ADHD-RS-5', label: 'ADHD-RS-5 — ADHD Rating Scale 5' },
  // Psychosis
  { id: 'PANSS',     label: 'PANSS — Positive & Negative Syndrome Scale' },
  // Cognitive
  { id: 'MMSE',      label: 'MMSE — Mini-Mental State Examination' },
  { id: 'MoCA',      label: 'MoCA — Montreal Cognitive Assessment' },
  // Sleep
  { id: 'ISI',       label: 'ISI — Insomnia Severity Index' },
  { id: 'PSQI',      label: 'PSQI — Pittsburgh Sleep Quality Index' },
  // Broad
  { id: 'DASS-21',   label: 'DASS-21 — Depression Anxiety Stress Scales' },
  { id: 'CGI-S',     label: 'CGI-S — Clinical Global Impression – Severity' },
  { id: 'CGI-I',     label: 'CGI-I — Clinical Global Impression – Improvement' },
  // Neuro/Motor
  { id: 'UPDRS-III', label: "UPDRS-III — Parkinson's Motor Scale" },
  // Pain
  { id: 'NRS-Pain',  label: 'NRS — Numeric Pain Rating Scale' },
  { id: 'BPI',       label: 'BPI — Brief Pain Inventory' },
  // Substance
  { id: 'AUDIT',     label: 'AUDIT — Alcohol Use Disorders Identification Test' },
];

export const COURSE_STATUS_COLORS = {
  pending_approval: 'var(--amber)',
  approved:         'var(--blue)',
  active:           'var(--teal)',
  paused:           'var(--amber)',
  completed:        'var(--green)',
  discontinued:     'var(--red)',
};

// Role-based nav entry points (first page shown after login)
export const ROLE_ENTRY_PAGE = {
  admin:          'home',
  clinician:      'home',
  resident:       'courses',
  'clinic-admin': 'patients',
  reviewer:       'review-queue',
  supervisor:     'review-queue',
  technician:     'session-execution',
  guest:          'evidence',
  patient:        'patient-portal',
};
