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
import { isDemoSession } from '../demo-session.js';
import {
  _fetchPatientReportsBundle,
  _normalizeDocs,
  docCardHTML,
  logPatientReportsAuditEvent,
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

// ── Audit-event scope (2026-05-08) ───────────────────────────────────────
// The doc-card HTML emitted by `docCardHTML` references global click handlers
// (window._ptReportOpened / _ptReportDownloaded) that the legacy
// `pgPatientReports` function defines lazily on render. The v2 page is a
// distinct entry point — when a patient lands on Health Reports without
// having visited the legacy page first, those handlers do not exist and the
// audit row is silently dropped. We register module-level fallbacks here so
// per-doc view/download events are always recorded.
//
// `_pgHrLastDemoFlag` is set by `pgPatientHealthReports()` on each render so
// the per-card handlers know whether the page is currently in demo mode.
let _pgHrLastDemoFlag = false;
if (typeof window !== 'undefined') {
  if (!window._ptReportOpened) {
    window._ptReportOpened = function(reportId, kind) {
      logPatientReportsAuditEvent('report_opened', {
        report_id: reportId,
        using_demo_data: _pgHrLastDemoFlag,
        note: kind || 'view',
      });
    };
  }
  if (!window._ptReportDownloaded) {
    window._ptReportDownloaded = function(reportId) {
      logPatientReportsAuditEvent('report_downloaded', {
        report_id: reportId,
        using_demo_data: _pgHrLastDemoFlag,
        note: 'download click',
      });
    };
  }
}

/**
 * Tab-switch handler. Toggles `.active` on the button and shows/hides the
 * matching panel by `data-tab` attribute. Installed once at module load
 * via `window._ptHrTab` so re-renders don't stack handlers. Also emits a
 * `tab_change` audit event so the audit trail captures patient navigation
 * across the four tabs.
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
    // Best-effort audit ping. Never throws back at the click handler.
    logPatientReportsAuditEvent('tab_change', {
      using_demo_data: _pgHrLastDemoFlag,
      note: 'tab=' + String(tabId || ''),
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

/** Standard "paused while consent is withdrawn" banner. */
function _consentPausedBanner() {
  return `
    <div class="pt-consent-banner" role="status" aria-live="polite"
         style="padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:12.5px;color:#991b1b">
      <strong>Read-only:</strong> Paused while consent is withdrawn.
    </div>`;
}

/**
 * Render the Outcomes & Assessments tab body. Filter: outcome /
 * assessment / session-summary docs whose origin is `ai` or `clinic`
 * (per the eng-review filter spec).
 */
function _outcomesPanel(docs, ctx, consentActive) {
  if (!consentActive) return _consentPausedBanner();
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
 * Render the Documents tab body. Filter: category in
 * {consent, care, guide, letter, adverse} per the eng-review spec.
 */
function _documentsPanel(docs, ctx) {
  const items = (docs || []).filter(d =>
    d.category === 'consent' || d.category === 'care' || d.category === 'guide'
    || d.category === 'letter' || d.category === 'adverse'
  );
  if (!items.length) {
    return _emptyTile(t('patient.health_reports.empty.documents'));
  }
  return `<div class="pt-hr-tab-body">${items.map(d => docCardHTML(d, ctx)).join('')}</div>`;
}

/**
 * Render the wearable summary card from the bundle's wearableSummary
 * (already returned by `api.patientPortalWearableSummary(30)`). Aggregates
 * 30 daily rows into a single readable summary; the per-week snapshots
 * are surfaced as Biometrics doc cards just below.
 */
function _wearableSummaryCard(rows) {
  if (!Array.isArray(rows) || !rows.length) return '';
  const fmt = (n, d = 0) => (n == null || !Number.isFinite(Number(n))) ? null : Number(n).toFixed(d);
  const avg = (vals) => {
    const xs = vals.filter(v => v != null && Number.isFinite(Number(v))).map(Number);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const avgSleep   = avg(rows.map(r => r.sleep_duration_h));
  const avgRHR     = avg(rows.map(r => r.rhr_bpm));
  const avgHRV     = avg(rows.map(r => r.hrv_ms));
  const totalSteps = rows.reduce((acc, r) => acc + (Number(r.steps) || 0), 0);
  const stats = [];
  if (avgSleep != null) stats.push({ label: 'Sleep avg',   value: `${fmt(avgSleep, 1)} h` });
  if (avgRHR   != null) stats.push({ label: 'Resting HR',  value: `${fmt(avgRHR, 0)} bpm` });
  if (avgHRV   != null) stats.push({ label: 'HRV',         value: `${fmt(avgHRV, 0)} ms` });
  if (totalSteps > 0)   stats.push({ label: 'Total steps', value: totalSteps.toLocaleString() });
  if (!stats.length) return '';
  return `
    <div class="pt-hr-bio-summary"
         style="padding:14px 16px;border-radius:12px;border:1px solid rgba(244,114,182,0.2);background:rgba(244,114,182,0.06);margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#f472b6;margin-bottom:6px">
        Last 30 days · wearables
      </div>
      <div style="display:flex;gap:18px;flex-wrap:wrap">
        ${stats.map(s => `
          <div>
            <div style="font-size:11px;color:var(--text-tertiary,#94a3b8);text-transform:uppercase;letter-spacing:.06em">${esc(s.label)}</div>
            <div style="font-size:18px;font-weight:600;color:var(--text-primary)">${esc(s.value)}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

/**
 * Render the Advanced Analyzers tab body.
 *
 * Default state: a "Coming soon" tile with a chip row listing the
 * planned analyzer surfaces (qEEG / MRI / Voice / Text / Movement).
 *
 * Demo mode (`isDemoSession()` true): non-interactive synthetic preview
 * cards that no-op on click and show a tooltip explaining they are
 * demo previews. Mirrors the precedent at pages-clinical-tools.js:5803
 * where the demo build surfaces synthetic content rather than the
 * empty error state.
 */
function _analyzersPanel() {
  const planned = ['qEEG', 'MRI', 'Voice', 'Text', 'Movement'];

  if (isDemoSession()) {
    const previews = [
      { kind: 'qEEG',     age: '14-day-old', state: 'ready to view' },
      { kind: 'MRI',      age: '4-week-old', state: 'awaiting review' },
      { kind: 'Voice',    age: '7-day-old',  state: 'analysed' },
      { kind: 'Text',     age: '3-day-old',  state: 'analysed' },
      { kind: 'Movement', age: '2-day-old',  state: 'pending review' },
    ];
    return `
      <div class="pt-hr-tab-body">
        <div class="pt-demo-banner" role="status"
             style="margin-bottom:12px;padding:10px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:12.5px;color:#9a3412">
          <strong>DEMO data</strong> — synthetic analyzer previews. These cards do not link to live analyzers.
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
          ${previews.map(p => `
            <div class="pt-doc-card pt-hr-analyzer-preview" data-analyzer="${esc(p.kind)}"
                 style="cursor:not-allowed;opacity:0.85;padding:14px 16px;border-radius:12px;border:1px solid rgba(255,255,255,0.08)"
                 title="Demo preview — wires to live ${esc(p.kind)} analyzer post-launch"
                 onclick="event.preventDefault(); return false;">
              <div style="font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--teal,#00d4bc);margin-bottom:6px">
                ${esc(p.kind)}
              </div>
              <div style="font-size:14px;font-weight:600;color:var(--text-primary)">${esc(p.kind)} · ${esc(p.age)}</div>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${esc(p.state)}</div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  return `
    <div class="pt-docs-empty">
      <div class="pt-docs-empty-icon">&#128344;</div>
      <div class="pt-docs-empty-title">${esc(t('patient.health_reports.coming_soon'))}</div>
      <div class="pt-docs-empty-body">${esc(t('patient.health_reports.empty.analyzers'))}</div>
      <div class="pt-hr-analyzer-chips" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:14px">
        ${planned.map(p => `<span class="pt-doc-chip" style="font-size:12px;padding:4px 10px;border-radius:999px;border:1px solid rgba(255,255,255,0.1)">${esc(p)}</span>`).join('')}
      </div>
    </div>`;
}

/**
 * Render the Biometrics & Wearables tab body. Wearable summary card on
 * top; weekly biometric snapshot doc cards just below (these are the
 * `category === 'biometrics'` docs synthesised by `_normalizeDocs`).
 */
function _biometricsPanel(docs, ctx, wearableSummary, consentActive) {
  if (!consentActive) return _consentPausedBanner();
  const summaryCard = _wearableSummaryCard(wearableSummary);
  const items = (docs || []).filter(d => d.category === 'biometrics');
  if (!summaryCard && !items.length) {
    return _emptyTile('Connect Apple Health, Oura, Fitbit, or Garmin in Settings → Integrations to see weekly biometric snapshots here.');
  }
  return `
    <div class="pt-hr-tab-body">
      ${summaryCard}
      ${items.map(d => docCardHTML(d, ctx)).join('')}
    </div>`;
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
  const _isDemo = !!(patientReportsRaw && patientReportsRaw.is_demo);
  // Stash for the module-level click handlers that fire from doc-card
  // onclick attributes (they don't have direct access to this closure).
  _pgHrLastDemoFlag = _isDemo;

  // patientReportsById index for the doc-card CTA states (acknowledged,
  // share-back-pending). Falls back to {} when the server is unreachable.
  const patientReportsById = {};
  const items = (patientReportsRaw && Array.isArray(patientReportsRaw.items)) ? patientReportsRaw.items : [];
  for (const it of items) {
    if (it && it.id) patientReportsById[String(it.id)] = it;
  }

  // Mount-time audit ping (parity with legacy `pgPatientReports`). Records
  // that the patient opened the v2 Health Reports page with an honest
  // connectivity hint — a regulator can tell page-loads where the API was
  // unreachable from real opens. Never throws.
  logPatientReportsAuditEvent('view', {
    using_demo_data: _isDemo,
    note: _serverLive
      ? `surface=health_reports_v2; items=${items.length}; consent_active=${_consentActive ? 1 : 0}`
      : 'surface=health_reports_v2; fallback=offline',
  });

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
    _panel('analyzers',  _analyzersPanel()),
    _panel('biometrics', _biometricsPanel(docs, ctx, bundle.wearableSummary, _consentActive)),
    _panel('documents',  _documentsPanel(docs, ctx)),
  ].join('');

  el.innerHTML = `
    <div class="pt-hr-page">
      ${tabsHTML}
      ${panels}
    </div>`;
}
