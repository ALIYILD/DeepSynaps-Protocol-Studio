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

import { t } from '../i18n.js';
import { setTopbar, spinner } from './_shared.js';
import {
  _fetchPatientReportsBundle,
  _normalizeDocs,
  docCardHTML,
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
 * Wrap a tab body in the panel envelope. The `data-tab` attr is the contract
 * the tab-switch handler reads. The first tab (outcomes) starts visible.
 */
function _panel(tabId, body, isFirst = false) {
  return `
    <div class="pt-hr-panel" data-tab="${esc(tabId)}" role="tabpanel"${isFirst ? '' : ' hidden'}>
      ${body}
    </div>`;
}

/** Generic empty-state used by tabs that don't have content yet. */
function _emptyTile(message) {
  return `
    <div class="pt-docs-empty">
      <div class="pt-docs-empty-icon">&#9649;</div>
      <div class="pt-docs-empty-body">${esc(message)}</div>
    </div>`;
}

/**
 * Build the context object `docCardHTML` reads. Mirrors the closure state
 * the legacy `pgPatientReports` captured (docs[] + patient-scope server
 * flags). The v2 page does not yet read patient-scope launch-audit flags
 * from the server — when consent is withdrawn the entire affected tab is
 * gated upstream, so we set the consent flag to `true` here.
 */
function _ctxFor(docs, opts = {}) {
  return {
    docs,
    patientReportsById: opts.patientReportsById || {},
    patientReportsServerLive: opts.patientReportsServerLive !== false,
    patientReportsConsentActive: opts.patientReportsConsentActive !== false,
  };
}

/**
 * Render the Outcomes & Assessments tab body. Filter: outcome /
 * assessment / session-summary docs whose origin is `ai` or `clinic`
 * (per the eng-review filter spec).
 */
function _outcomesPanel(docs, ctx, consentActive) {
  if (!consentActive) {
    return `
      <div class="pt-consent-banner" role="status" aria-live="polite"
           style="padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:12.5px;color:#991b1b">
        <strong>Read-only:</strong> Paused while consent is withdrawn.
      </div>`;
  }
  const items = (docs || []).filter(d =>
    (d.category === 'outcome' || d.category === 'assessment' || d.category === 'session-summary')
    && (d.origin === 'ai' || d.origin === 'clinic')
  );
  if (!items.length) {
    return _emptyTile(t('patient.reports.empty.body'));
  }
  return `<div class="pt-hr-tab-body">${items.map(d => docCardHTML(d, ctx)).join('')}</div>`;
}

/**
 * Patient Health Reports v2 — 4-tab page entry.
 *
 * Subsequent commits fill in:
 *   - Documents + Biometrics tabs (commit 5)
 *   - Advanced Analyzers tab + demo preview + legacy banner (commit 6)
 */
export async function pgPatientHealthReports() {
  setTopbar(t('patient.health_reports.title'));

  const el = document.getElementById('patient-content');
  if (!el) return;
  el.innerHTML = spinner();

  // Parallel-fetch via the shared helper. Soft-fail on any single source.
  const bundle = await _fetchPatientReportsBundle(null);

  // Build session/course lookup maps so the doc cards can show context
  // chips (session #, course title) just like the legacy page does.
  const sessions = Array.isArray(bundle.sessions) ? bundle.sessions : [];
  const courses  = Array.isArray(bundle.courses)  ? bundle.courses  : [];
  const sessionById = {};
  sessions.forEach(s => { if (s.id) sessionById[s.id] = s; });
  const courseById = {};
  courses.forEach(c => { if (c.id) courseById[c.id] = c; });

  const docs = _normalizeDocs(bundle, { sessionById, courseById });

  // Consent gate — reuse the legacy server contract. When the patient
  // reports list endpoint returns `consent_active: false`, the affected
  // tabs render a paused banner instead of the data.
  const patientReportsRaw = bundle.patientReports;
  const _consentActive = patientReportsRaw ? !!patientReportsRaw.consent_active : true;
  const _serverLive = !!patientReportsRaw && !bundle.serverErr;

  // patientReportsById index for the doc-card CTA states (acknowledged,
  // share-back-pending). Falls back to {} when the server is unreachable.
  const patientReportsById = {};
  const items = (patientReportsRaw && Array.isArray(patientReportsRaw.items)) ? patientReportsRaw.items : [];
  for (const it of items) {
    if (it && it.id) patientReportsById[String(it.id)] = it;
  }

  const ctx = _ctxFor(docs, {
    patientReportsById,
    patientReportsServerLive: _serverLive,
    patientReportsConsentActive: _consentActive,
  });

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
    _panel('outcomes',   _outcomesPanel(docs, ctx, _consentActive), true),
    _panel('analyzers',  _emptyTile(t('patient.health_reports.empty.analyzers'))),
    _panel('biometrics', _emptyTile(t('patient.health_reports.tab.biometrics') + ' — ' + t('patient.health_reports.coming_soon'))),
    _panel('documents',  _emptyTile(t('patient.health_reports.empty.documents'))),
  ].join('');

  el.innerHTML = `
    <div class="pt-hr-page">
      ${tabsHTML}
      ${panels}
    </div>`;
}
