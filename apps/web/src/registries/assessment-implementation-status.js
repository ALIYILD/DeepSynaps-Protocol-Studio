/**
 * Truth alignment: SCALE_REGISTRY (what we claim) vs ASSESS_REGISTRY (inline forms actually shipped).
 * Used by Enter Scores, hub UI, unit tests, and scale-registry-alignment.js.
 */

import {
  SCALE_REGISTRY,
  resolveScaleCanonical,
  getScaleMeta,
  formatScaleWithBadgeHtml,
} from './scale-assessment-registry.js';

/** @typedef {import('./scale-assessment-registry.js').ScaleRecord} ScaleRecord */

/**
 * @typedef {'implemented_item_checklist'
 *   | 'declared_item_checklist_but_missing_form'
 *   | 'item_checklist_not_offered_in_app'
 *   | 'numeric_only'
 *   | 'clinician_entry'
 *   | 'unknown'} AssessmentImplementationStatus
 */

/**
 * Find instrument row after alias resolution (canonical id preferred).
 * @param {string} scaleId
 * @param {Array<{ id: string, inline?: boolean, questions?: string[] }>} assessRegistry
 */
export function findAssessInstrumentRow(scaleId, assessRegistry) {
  const canon = resolveScaleCanonical(scaleId);
  return assessRegistry.find(r => r.id === canon || r.id === scaleId) || null;
}

/**
 * True when ASSESS_REGISTRY provides a non-empty inline item form for this scale.
 * @param {string} scaleId
 * @param {Array<{ id: string, inline?: boolean, questions?: string[] }>} assessRegistry
 */
export function hasImplementedInlineChecklist(scaleId, assessRegistry) {
  const inst = findAssessInstrumentRow(scaleId, assessRegistry);
  return !!(inst?.inline && Array.isArray(inst.questions) && inst.questions.length > 0);
}

/**
 * Resolved implementation state for UI and alignment checks.
 * @param {string | null | undefined} rawToken
 * @param {Array<{ id: string, inline?: boolean, questions?: string[] }>} assessRegistry
 * @returns {{
 *   status: AssessmentImplementationStatus,
 *   canonicalId: string,
 *   rawToken: string,
 *   unknown: boolean,
 * }}
 */
export function getAssessmentImplementationStatus(rawToken, assessRegistry) {
  const raw = rawToken == null ? '' : String(rawToken).trim();
  const meta = getScaleMeta(raw);
  if (meta.unknown || !raw) {
    return {
      status: /** @type {const} */ ('unknown'),
      canonicalId: meta.canonical_id || '',
      rawToken: raw,
      unknown: true,
    };
  }

  const canon = meta.canonical_id;
  const implemented = hasImplementedInlineChecklist(raw, assessRegistry);

  if (meta.entry_mode === 'item_checklist' && meta.supported_in_app) {
    if (implemented) {
      return {
        status: /** @type {const} */ ('implemented_item_checklist'),
        canonicalId: canon,
        rawToken: raw,
        unknown: false,
      };
    }
    return {
      status: /** @type {const} */ ('declared_item_checklist_but_missing_form'),
      canonicalId: canon,
      rawToken: raw,
      unknown: false,
    };
  }

  if (meta.entry_mode === 'item_checklist' && !meta.supported_in_app) {
    return {
      status: /** @type {const} */ ('item_checklist_not_offered_in_app'),
      canonicalId: canon,
      rawToken: raw,
      unknown: false,
    };
  }

  if (meta.entry_mode === 'clinician_entry') {
    return {
      status: /** @type {const} */ ('clinician_entry'),
      canonicalId: canon,
      rawToken: raw,
      unknown: false,
    };
  }

  return {
    status: /** @type {const} */ ('numeric_only'),
    canonicalId: canon,
    rawToken: raw,
    unknown: false,
  };
}

/**
 * Deterministic alignment errors (same rules as legacy validateScaleRegistryAgainstAssess).
 * @param {Array<{ id: string, inline?: boolean, questions?: string[] }>} assessRegistry
 * @returns {string[]}
 */
export function buildChecklistAlignmentErrors(assessRegistry) {
  const errors = [];
  const byId = new Map(assessRegistry.map(r => [r.id, r]));

  for (const r of assessRegistry) {
    const meta = SCALE_REGISTRY[r.id];
    if (!meta) {
      errors.push(`ASSESS_REGISTRY id "${r.id}" has no SCALE_REGISTRY row — add metadata or remove instrument.`);
      continue;
    }

    const inline = !!r.inline;
    const claimsInApp = meta.entry_mode === 'item_checklist' && meta.supported_in_app;

    if (inline) {
      if (!claimsInApp) {
        errors.push(
          `ASSESS "${r.id}" provides inline item UI but SCALE_REGISTRY does not declare item_checklist + supported_in_app.`,
        );
      }
      if (!Array.isArray(r.questions) || r.questions.length === 0) {
        errors.push(`ASSESS "${r.id}" is inline but missing non-empty questions[].`);
      }
    } else if (claimsInApp) {
      errors.push(
        `SCALE_REGISTRY marks "${r.id}" as in-app item checklist but ASSESS_REGISTRY has no inline UI.`,
      );
    }
  }

  for (const [scaleId, meta] of Object.entries(SCALE_REGISTRY)) {
    if (meta.entry_mode === 'item_checklist' && meta.supported_in_app) {
      const inst = byId.get(scaleId);
      if (!inst) {
        errors.push(
          `SCALE_REGISTRY promises in-app checklist for "${scaleId}" but ASSESS_REGISTRY has no instrument row.`,
        );
      } else if (!hasImplementedInlineChecklist(scaleId, assessRegistry)) {
        errors.push(`In-app scale "${scaleId}" must have inline: true and questions[] in ASSESS_REGISTRY.`);
      }
    }
  }

  return errors;
}

/**
 * Lists for tests / CI output: declared in-app item checklists vs inline implementations.
 * @param {Array<{ id: string, inline?: boolean, questions?: string[] }>} assessRegistry
 */
export function checklistImplementationReport(assessRegistry) {
  const declaredInAppItemChecklist = [];
  const implementedInline = [];
  const missingForm = [];

  for (const scaleId of Object.keys(SCALE_REGISTRY)) {
    const meta = SCALE_REGISTRY[scaleId];
    if (meta.entry_mode !== 'item_checklist' || !meta.supported_in_app) continue;
    declaredInAppItemChecklist.push(scaleId);
    if (hasImplementedInlineChecklist(scaleId, assessRegistry)) {
      implementedInline.push(scaleId);
    } else {
      missingForm.push(scaleId);
    }
  }

  const inlineButNotDeclared = [];
  for (const row of assessRegistry) {
    if (!row.inline || !Array.isArray(row.questions) || row.questions.length === 0) continue;
    const meta = SCALE_REGISTRY[row.id];
    if (!meta || meta.entry_mode !== 'item_checklist' || !meta.supported_in_app) {
      inlineButNotDeclared.push(row.id);
    }
  }

  return {
    declaredInAppItemChecklist: declaredInAppItemChecklist.sort(),
    implementedInline: implementedInline.sort(),
    missingForm: missingForm.sort(),
    inlineButNotDeclared: [...new Set(inlineButNotDeclared)].sort(),
  };
}

/**
 * Escape for HTML attribute / text in badges.
 * @param {string} s
 */
function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

/**
 * Badge HTML: same as {@link formatScaleWithBadgeHtml} unless metadata claims an in-app checklist
 * without a shipped form — then show a visible “Checklist pending” state.
 * @param {string} rawAbbrev
 * @param {Array<{ id: string, inline?: boolean, questions?: string[] }>} assessRegistry
 */
export function formatScaleWithImplementationBadgeHtml(rawAbbrev, assessRegistry) {
  const impl = getAssessmentImplementationStatus(rawAbbrev, assessRegistry);
  if (impl.status === 'declared_item_checklist_but_missing_form') {
    const abbr = _esc(String(rawAbbrev));
    const title =
      'Registry lists this as an in-app item checklist, but no inline form is implemented yet. Enter scores manually until wired.';
    return (
      '<span class="ah2-sb-wrap"><span class="ah2-sb-abbr">' +
      abbr +
      '</span> <span class="ah2-sb ah2-sb--gap" title="' +
      _esc(title) +
      '">Checklist pending</span></span>'
    );
  }
  return formatScaleWithBadgeHtml(rawAbbrev);
}

/**
 * Partition bundle tokens by implementation truth (Enter Scores + info modal).
 * @param {string[]} rawIds
 * @param {Array<{ id: string, inline?: boolean, questions?: string[] }>} assessRegistry
 */
export function partitionScalesByImplementationTruth(rawIds, assessRegistry) {
  const implementedItemChecklist = [];
  const declaredMissingForm = [];
  const numericEntry = [];
  const clinicianEntry = [];
  const unknownTokens = [];
  const seen = new Set();

  for (const raw of rawIds) {
    const k = String(raw);
    if (seen.has(k)) continue;
    seen.add(k);
    const st = getAssessmentImplementationStatus(k, assessRegistry);
    switch (st.status) {
      case 'implemented_item_checklist':
        implementedItemChecklist.push(k);
        break;
      case 'declared_item_checklist_but_missing_form':
        declaredMissingForm.push(k);
        break;
      case 'clinician_entry':
        clinicianEntry.push(k);
        break;
      case 'unknown':
        unknownTokens.push(k);
        break;
      default:
        numericEntry.push(k);
    }
  }

  return {
    implementedItemChecklist: implementedItemChecklist.sort(),
    declaredMissingForm: declaredMissingForm.sort(),
    numericEntry: numericEntry.sort(),
    clinicianEntry: clinicianEntry.sort(),
    unknown: unknownTokens.sort(),
  };
}

/**
 * Legacy "Run assessment" / inline-vs-numeric routing derived from implementation truth.
 * @param {string | null | undefined} rawToken
 * @param {Array<{ id: string, inline?: boolean, questions?: string[] }>} assessRegistry
 * @returns {{
 *   mode: 'inline_item_checklist' | 'numeric_entry',
 *   status: AssessmentImplementationStatus,
 *   canonicalId: string,
 *   rawToken: string,
 * }}
 */
export function getLegacyRunAssessmentMode(rawToken, assessRegistry) {
  const impl = getAssessmentImplementationStatus(rawToken, assessRegistry);
  const mode =
    impl.status === 'implemented_item_checklist'
      ? /** @type {const} */ ('inline_item_checklist')
      : /** @type {const} */ ('numeric_entry');
  return {
    mode,
    status: impl.status,
    canonicalId: impl.canonicalId,
    rawToken: impl.rawToken,
  };
}

/**
 * Legacy Run assessment routing (pure, testable).
 * Ensures we only route to inline UI when an actual shipped inline form exists.
 *
 * @param {string | null | undefined} rawToken
 * @param {Array<{ id: string, inline?: boolean, questions?: string[] }>} assessRegistry
 * @returns {{
 *   route: 'inline_panel' | 'score_entry_panel',
 *   status: AssessmentImplementationStatus,
 *   instrument: { id: string, inline?: boolean, questions?: string[] } | null,
 * }}
 */
export function routeLegacyRunAssessment(rawToken, assessRegistry) {
  const impl = getAssessmentImplementationStatus(rawToken, assessRegistry);
  const instrument = findAssessInstrumentRow(String(rawToken || ''), assessRegistry);

  if (impl.status !== 'implemented_item_checklist') {
    return {
      route: /** @type {const} */ ('score_entry_panel'),
      status: impl.status,
      instrument,
    };
  }

  // Even if metadata claims it's implemented, require an actual shipped form.
  if (!instrument || !instrument.inline || !Array.isArray(instrument.questions) || instrument.questions.length === 0) {
    return {
      route: /** @type {const} */ ('score_entry_panel'),
      status: /** @type {const} */ ('declared_item_checklist_but_missing_form'),
      instrument,
    };
  }

  return {
    route: /** @type {const} */ ('inline_panel'),
    status: /** @type {const} */ ('implemented_item_checklist'),
    instrument,
  };
}

/**
 * Small visual badge for the legacy Run Assessment card list.
 * Conservative: never implies in-app checklists unless implemented.
 * @param {AssessmentImplementationStatus} status
 * @returns {string}
 */
export function formatLegacyRunImplementationBadgeHtml(status) {
  const base =
    'style="display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.02em;line-height:1.2;border:1px solid var(--border);"';
  switch (status) {
    case 'implemented_item_checklist':
      return `<span ${base} title="Implemented in-app item checklist" style="display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.02em;line-height:1.2;border:1px solid var(--border-teal);background:rgba(0,212,188,0.10);color:var(--teal)">◉ Inline</span>`;
    case 'declared_item_checklist_but_missing_form':
      return `<span ${base} title="Checklist metadata exists but form is not implemented" style="display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.02em;line-height:1.2;border:1px solid rgba(245,158,11,0.35);background:rgba(245,158,11,0.10);color:var(--amber, #f59e0b)">Checklist pending</span>`;
    case 'clinician_entry':
      return `<span ${base} title="Clinician-administered / manual scoring" style="display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.02em;line-height:1.2;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--text-secondary)">Clinician</span>`;
    case 'numeric_only':
      return `<span ${base} title="Numeric total entry" style="display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.02em;line-height:1.2;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--text-secondary)">Numeric</span>`;
    case 'item_checklist_not_offered_in_app':
      return `<span ${base} title="Not offered as an in-app item checklist" style="display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.02em;line-height:1.2;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--text-secondary)">Not in-app</span>`;
    case 'unknown':
      return `<span ${base} title="Unknown instrument metadata" style="display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.02em;line-height:1.2;border:1px solid var(--border);background:rgba(255,255,255,0.03);color:var(--text-tertiary)">Unknown</span>`;
    default:
      return '';
  }
}

/**
 * HTML notice for the legacy Assessments Hub "Run Assessment" numeric entry panel (pgAssess).
 * Wording aligned with {@link buildHubScaleBlock} gap notes and condition-bundle info modal.
 * @param {AssessmentImplementationStatus} status
 * @returns {string}
 */
export function getLegacyRunScoreEntryNoticeHtml(status) {
  switch (status) {
    case 'declared_item_checklist_but_missing_form':
      return (
        '<div class="notice notice-warn" style="margin-bottom:12px;font-size:11px;line-height:1.5" role="status">' +
        'Checklist metadata is present, but the in-app item form is not implemented yet. ' +
        'Enter the total score from your completed source form.' +
        '</div>'
      );
    case 'item_checklist_not_offered_in_app':
      return (
        '<div class="notice notice-info" style="margin-bottom:12px;font-size:11px;line-height:1.5" role="status">' +
        'This instrument is not offered as an item-by-item checklist in this app. Enter the total score manually.' +
        '</div>'
      );
    case 'clinician_entry':
      return (
        '<div class="notice notice-info" style="margin-bottom:12px;font-size:11px;line-height:1.5" role="status">' +
        'Clinician-administered / manual scoring — enter the score from your standardized administration.' +
        '</div>'
      );
    case 'unknown':
      return (
        '<div class="notice notice-info" style="margin-bottom:12px;font-size:11px;line-height:1.5" role="status">' +
        'Scale metadata is incomplete in this build. Enter a numeric score; confirm the instrument outside this list if needed.' +
        '</div>'
      );
    case 'numeric_only':
    case 'implemented_item_checklist':
    default:
      return '';
  }
}
