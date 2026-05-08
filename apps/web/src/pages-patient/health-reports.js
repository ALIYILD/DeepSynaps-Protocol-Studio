// Patient Health Reports (v2) — 4-tab page that supersedes the legacy
// `My Reports` view. Eng-review locked decisions:
//   - Route slug: `patient-health-reports`
//   - Tab IA (in order): Outcomes & Assessments / Advanced Analyzers /
//     Biometrics & Wearables / Documents
//   - Tab bar pattern: reuse `as-tabs` HTML/CSS from the Assessments page.
//   - Container id: `#pt-hr-tabs`.
//   - Coming-soon tile reuses `pt-docs-empty` + chip row.
//   - Demo-mode (`isDemoSession()`) shows synthetic preview cards on the
//     Advanced Analyzers tab. The remaining placeholders stay as-is.
//   - Consent revocation reuses the legacy `_patientReportsConsentActive`
//     gate verbatim.
//
// This commit ships only the skeleton: tab buttons, empty panels, tab-toggle
// JS, `_fetchPatientReportsBundle()` wired in. Per-tab content is filled in
// by subsequent commits.

import { t } from '../i18n.js';
import { setTopbar, spinner } from './_shared.js';
import {
  _fetchPatientReportsBundle,
} from './_reports-shared.js';

// HTML escaper — local to this module (mirrors `_hdEsc` from `_shared.js`).
function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Tab definitions in IA order. Labels resolve via t() at call-time so that
 * locale changes don't get baked in. The `id` matches the `data-tab`
 * attribute on the button and the panel's `id` suffix.
 */
function _tabDefs() {
  return [
    { id: 'outcomes',   label: t('patient.health_reports.tab.outcomes') },
    { id: 'analyzers',  label: t('patient.health_reports.tab.analyzers') },
    { id: 'biometrics', label: t('patient.health_reports.tab.biometrics') },
    { id: 'documents',  label: t('patient.health_reports.tab.documents') },
  ];
}

/**
 * Tab-switch handler. Toggles `.active` on the button and shows/hides the
 * matching panel by `data-tab` attribute. Installed once at module load
 * via `window._ptHrTab` so re-renders don't stack handlers.
 */
if (typeof window !== 'undefined' && !window._ptHrTab) {
  window._ptHrTab = function(tabId) {
    const root = document.getElementById('pt-hr-tabs');
    if (!root) return;
    const buttons = root.querySelectorAll('button[data-tab]');
    buttons.forEach(b => {
      if (b.getAttribute('data-tab') === tabId) b.classList.add('active');
      else b.classList.remove('active');
    });
    const panels = document.querySelectorAll('.pt-hr-panel');
    panels.forEach(p => {
      if (p.getAttribute('data-tab') === tabId) p.removeAttribute('hidden');
      else p.setAttribute('hidden', '');
    });
  };
}

/**
 * Render placeholder body for a tab. Replaced by tab-specific renderers in
 * subsequent commits. The `data-tab` attr is the contract the tab-switch
 * handler reads.
 */
function _placeholderPanel(tabId, message) {
  return `
    <div class="pt-hr-panel" data-tab="${esc(tabId)}" role="tabpanel"${tabId === 'outcomes' ? '' : ' hidden'}>
      <div class="pt-docs-empty">
        <div class="pt-docs-empty-icon">&#9649;</div>
        <div class="pt-docs-empty-body">${esc(message)}</div>
      </div>
    </div>`;
}

/**
 * Patient Health Reports v2 — 4-tab scaffold.
 *
 * Subsequent commits fill in:
 *   - Outcomes & Assessments tab (commit 4)
 *   - Documents + Biometrics tabs (commit 5)
 *   - Advanced Analyzers tab + demo preview + legacy banner (commit 6)
 */
export async function pgPatientHealthReports() {
  setTopbar(t('patient.health_reports.title'));

  const el = document.getElementById('patient-content');
  if (!el) return;
  el.innerHTML = spinner();

  // Fetch via the shared parallel-fetch helper. The bundle is currently
  // unused by this skeleton — wired in commit 4 when the Outcomes tab
  // renders its real cards.
  // eslint-disable-next-line no-unused-vars
  const _bundle = await _fetchPatientReportsBundle(null);

  const tabs = _tabDefs();
  const tabsHTML = `
    <div class="as-tabs" id="pt-hr-tabs" role="tablist">
      ${tabs.map((tab, idx) => `
        <button class="${idx === 0 ? 'active' : ''}" data-tab="${esc(tab.id)}"
                role="tab" aria-selected="${idx === 0 ? 'true' : 'false'}"
                onclick="window._ptHrTab && window._ptHrTab('${esc(tab.id)}')">
          ${esc(tab.label)}
        </button>`).join('')}
    </div>`;

  const panels = [
    _placeholderPanel('outcomes',   t('patient.health_reports.tab.outcomes')   + ' — ' + t('patient.health_reports.coming_soon')),
    _placeholderPanel('analyzers',  t('patient.health_reports.empty.analyzers')),
    _placeholderPanel('biometrics', t('patient.health_reports.tab.biometrics') + ' — ' + t('patient.health_reports.coming_soon')),
    _placeholderPanel('documents',  t('patient.health_reports.empty.documents')),
  ].join('');

  el.innerHTML = `
    <div class="pt-hr-page">
      ${tabsHTML}
      ${panels}
    </div>`;
}
