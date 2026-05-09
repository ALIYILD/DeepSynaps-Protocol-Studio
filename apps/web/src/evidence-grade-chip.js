// ─────────────────────────────────────────────────────────────────────────────
// evidence-grade-chip.js
//
// Shared renderer for the canonical evidence-grade strings emitted by the
// backend (services.qeeg_protocol_fit, qeeg_report_template, evidence_pipeline).
// Centralising the chip renderer here means every clinician-facing surface
// labels the same grade with the same colour, copy, and tooltip.
//
// The grade strings are NOT documented in any single contract file — they
// are the literal values exported from the Python services. This module is
// the canonical mapping and must be kept in sync when a new grade is added
// to the backend. Any unknown grade falls back to a neutral "research
// heuristic" pill so an undocumented grade does not surface as if it were
// regulatory-cleared.
//
// Reference: AI go-live audit 2026-05-08 (#5),
// `deepsynaps-qeeg-evidence-gaps.md` (auto-memory).
// ─────────────────────────────────────────────────────────────────────────────

const _GRADE_META = {
  // Strongest tier — FDA cleared, established clinical use.
  STRONG_FDA_CLEARED: {
    label: 'EV-A',
    fullLabel: 'EV-A · FDA cleared',
    color: '#10b981',
    bg: 'rgba(16,185,129,0.15)',
    border: 'rgba(16,185,129,0.45)',
    tooltip: 'FDA-cleared indication. Clinical evidence base supports use.',
  },
  // Mid tier — published evidence supports use, no RCT yet.
  MODERATE_NO_RCT_OPEN_LABEL_LARGE_SERIES: {
    label: 'EV-B',
    fullLabel: 'EV-B · open-label / case-series',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.15)',
    border: 'rgba(245,158,11,0.45)',
    tooltip: 'Moderate evidence — open-label studies and large case series. No randomised controlled trial.',
  },
  // Mid-low tier — TBR / FDA-cleared aid but contested
  FDA_CLEARED_AID_CONTESTED: {
    label: 'EV-B',
    fullLabel: 'EV-B · FDA-cleared aid (contested)',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.15)',
    border: 'rgba(245,158,11,0.45)',
    tooltip: 'FDA-cleared as a diagnostic aid; clinical utility is contested in current literature.',
  },
  // Weak tier — off-label or pilot evidence.
  WEAK_OFF_LABEL_FOR_ANXIETY: {
    label: 'EV-C',
    fullLabel: 'EV-C · weak off-label',
    color: '#fb923c',
    bg: 'rgba(251,146,60,0.15)',
    border: 'rgba(251,146,60,0.45)',
    tooltip: 'Weak / off-label evidence. Use with caution and informed consent.',
  },
  'EV-C': {
    label: 'EV-C',
    fullLabel: 'EV-C · pilot / heuristic',
    color: '#fb923c',
    bg: 'rgba(251,146,60,0.15)',
    border: 'rgba(251,146,60,0.45)',
    tooltip: 'Pilot-level or heuristic evidence. Not a regulatory-cleared use.',
  },
  RESEARCH_HEURISTIC: {
    label: 'Research',
    fullLabel: 'Research heuristic',
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.15)',
    border: 'rgba(167,139,250,0.45)',
    tooltip: 'Research-grade heuristic. Not a regulatory-cleared biomarker. Interpret descriptively.',
  },
  RESEARCH_INVESTIGATIONAL: {
    label: 'Investigational',
    fullLabel: 'Investigational / research only',
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.15)',
    border: 'rgba(167,139,250,0.45)',
    tooltip: 'Investigational only — research literature exists but no regulatory clearance. Do not use as a clinical biomarker.',
  },
  INVESTIGATIONAL_NO_REGULATORY_CLEARANCE: {
    label: 'No clearance',
    fullLabel: 'Investigational · no FDA / CE clearance',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.15)',
    border: 'rgba(239,68,68,0.45)',
    tooltip: 'Investigational — no FDA / CE clearance for any model in this category. Do not use as a clinical biomarker.',
  },
  NOT_SUPPORTED_DO_NOT_SURFACE: {
    label: 'NOT SUPPORTED',
    fullLabel: 'Not supported · do not use clinically',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.20)',
    border: 'rgba(239,68,68,0.65)',
    tooltip: 'No published trial supports this mapping. Audit-disabled — must not surface in clinician output.',
  },
};

const _DEFAULT_META = {
  label: 'Research',
  fullLabel: 'Research heuristic (unknown grade)',
  color: '#a78bfa',
  bg: 'rgba(167,139,250,0.15)',
  border: 'rgba(167,139,250,0.45)',
  tooltip: 'Unknown evidence grade — defaulting to research heuristic. Do not interpret as cleared use.',
};

function _esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Look up the chip metadata for an evidence-grade string.
 * Unknown grades return the default research-heuristic shape, never null,
 * so a fallthrough cannot accidentally render an "uncoloured" chip that
 * looks like a cleared use.
 *
 * @param {string} grade
 * @returns {object} {label, fullLabel, color, bg, border, tooltip}
 */
export function getEvidenceGradeMeta(grade) {
  if (typeof grade !== 'string') return { ..._DEFAULT_META };
  return { ...(_GRADE_META[grade] || _DEFAULT_META) };
}

/**
 * Render a single evidence-grade chip as inline HTML.
 *
 * @param {string} grade   canonical backend grade string
 * @param {object} [opts]  {full: boolean — show fullLabel instead of short label}
 * @returns {string}       safe HTML snippet
 */
export function renderEvidenceGradeChip(grade, opts) {
  const meta = getEvidenceGradeMeta(grade);
  const text = opts && opts.full ? meta.fullLabel : meta.label;
  return '<span class="ds-evidence-chip" '
    + 'style="display:inline-block;padding:2px 8px;border-radius:99px;'
    + 'font-size:10.5px;font-weight:700;letter-spacing:0.04em;'
    + 'background:' + meta.bg + ';border:1px solid ' + meta.border + ';'
    + 'color:' + meta.color + ';line-height:1.4;vertical-align:middle"'
    + ' title="' + _esc(meta.tooltip) + '">'
    + _esc(text)
    + '</span>';
}

/**
 * Render a row of all chips that appear in the supplied list of suggestions
 * (deduplicated). Useful for surfacing the evidence-grade legend on a
 * compact card.
 *
 * @param {Array} items   list of objects each carrying an `evidence_grade`
 * @returns {string}      safe HTML
 */
export function renderEvidenceGradeLegend(items) {
  if (!Array.isArray(items)) return '';
  const grades = Array.from(new Set(
    items
      .filter(function (s) { return s && typeof s === 'object'; })
      .map(function (s) { return s.evidence_grade; })
      .filter(function (g) { return typeof g === 'string' && g; })
  ));
  if (!grades.length) return '';
  return '<div class="ds-evidence-chip-row" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">'
    + grades.map(function (g) { return renderEvidenceGradeChip(g, { full: true }); }).join('')
    + '</div>';
}
