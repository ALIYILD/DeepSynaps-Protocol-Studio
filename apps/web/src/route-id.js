const ROUTE_ALIASES = {
  'brain-twin': 'deeptwin',
  // Single onboarding flow — collapse the legacy 4-step `onboarding` into
  // the canonical 6-step wizard so old bookmarks / e2e specs / nav calls
  // all land on the same page. See pages-onboarding.js: pgOnboardingWizard.
  'onboarding': 'onboarding-wizard',
};

export function normalizeRouteId(id) {
  if (typeof id !== 'string') return id;
  return ROUTE_ALIASES[id] || id;
}
