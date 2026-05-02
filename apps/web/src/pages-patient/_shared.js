// Patient pages — shared helpers.
//
// This module hosts the small helpers that need to be shared between the
// residual `pages-patient.js` and the page-files that have been extracted
// out of it (see `apps/web/src/pages-patient/*.js`).
//
// The split was performed mechanically (no behavioural change) to make the
// formerly 25k-line `pages-patient.js` smaller and reduce concurrent-session
// merge collisions. Helpers here MUST stay in lockstep with their original
// definitions inside `pages-patient.js` — both files re-export `setTopbar`
// for backwards compatibility, and `spinner` is private to patient pages.

/**
 * Update the patient-shell topbar title and right-aligned actions.
 * `html` should be a trusted, escaped string (most callers build it from
 * static strings or data they have already escaped).
 */
export function setTopbar(title, html = '') {
  const _ttl = document.getElementById('patient-page-title');
  const _act = document.getElementById('patient-topbar-actions');
  if (_ttl) _ttl.textContent = title;
  if (_act) _act.innerHTML = html;
}

/** Lightweight loading spinner used while a patient page fetches data. */
export function spinner() {
  return '<div style="text-align:center;padding:48px;color:var(--teal);font-size:24px">◈</div>';
}
