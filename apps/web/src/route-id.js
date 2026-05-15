const ROUTE_ALIASES = {
  'video-assessments-patient': 'video-assessments-capture',
  'video-assessments-clinician': 'video-assessments-review',
  'brain-twin': 'deeptwin',
  // Single onboarding flow — collapse the legacy 4-step `onboarding` into
  // the canonical 6-step wizard so old bookmarks / e2e specs / nav calls
  // all land on the same page. See pages-onboarding.js: pgOnboardingWizard.
  'onboarding': 'onboarding-wizard',
  // Intervention platform sidebar items → canonical page IDs
  'rehab-physio': 'rehab',
  'wellness-lifestyle': 'wellness',
  'complementary-interventions': 'complementary',
  // Genetic analyzer aliases
  'genomics': 'genomic-analyzer',
  'genetics': 'genomic-analyzer',
  'genetic-analyzer': 'genomic-analyzer',
  // CRM aliases
  'admin-crm': 'crm',
  'super-admin': 'crm',
  // Additional analyzers
  'cognition': 'cognitive-analyzer',
  'neuropsych': 'cognitive-analyzer',
  'fnirs': 'fnirs-analyzer',
  'nirs': 'fnirs-analyzer',
  'neurophysiology': 'neurophysiology-analyzer',
  'ephys': 'neurophysiology-analyzer',
  'pet': 'pet-analyzer',
  'positron': 'pet-analyzer',
  'sleep': 'sleep-analyzer',
  'polysomnography': 'sleep-analyzer',
  // Intelligence hub
  'twin-analyzer': 'deeptwin-insights',
  'prediction': 'forecast-simulation',
  'simulation': 'forecast-simulation',
  'kg': 'knowledge-graph',
  'ontology-graph': 'knowledge-graph',
  'trajectory': 'longitudinal-insights',
  'progress': 'longitudinal-insights',
  'correlation': 'multimodal-correlations',
  // Admin
  'admin-datasets': 'admin-research-datasets',
  'users': 'user-clinic-management',
  'staff': 'user-clinic-management',
  'audit': 'audit-trail',
  'logs': 'audit-trail',
  // Patient care
  'consent': 'consent-governance',
  'governance': 'consent-governance',
  'irb': 'consent-governance',
  'groups': 'group-therapy',
  'cohort-sessions': 'group-therapy',
  'home-tasks': 'home-program',
  'remote-program': 'home-program',
  'outcomes': 'outcome-measures',
  'measures': 'outcome-measures',
  'goals': 'patient-goals',
  'care-plan': 'patient-goals',
  // Intervention planning
  'surgery': 'surgical-planning',
  'operative': 'surgical-planning',
  // Ecosystem
  'evidence-search': 'evidence-research',
  'literature-review': 'evidence-research',
  'actions': 'quick-actions',
  'shortcuts': 'quick-actions',
};

export function normalizeRouteId(id) {
  if (typeof id !== 'string') return id;
  return ROUTE_ALIASES[id] || id;
}
