// ─────────────────────────────────────────────────────────────────────────────
// qeeg-protocol-suggestion-filter.js
//
// Defence-in-depth filter for QEEG protocol-suggestion arrays returned by
// `services.qeeg_protocol_fit.suggest_protocols_from_report` (backend) and
// any other surface that emits the same shape.
//
// The backend already gates audit-disabled mappings (tDCS-O1/O2 for
// lateral-occipital bilateral deficit, tACS-Pz for precuneus bilateral
// excess) at the source — it skips entries with `enabled: false` and never
// emits the dedicated `NOT_SUPPORTED_DO_NOT_SURFACE` evidence grade. This
// file is a *belt-and-suspenders* check so that if a future regression
// (or a different code path) re-introduces them, no clinician-facing
// surface accidentally renders them.
//
// Reference: AI go-live audit 2026-05-08 (#10),
// `deepsynaps-qeeg-evidence-gaps.md` (auto-memory).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Drop suggestions that the backend audit has marked as "do not surface."
 * Tolerant of malformed inputs — non-objects are treated as gated and
 * removed rather than surfaced.
 *
 * @param {Array} suggestions
 * @returns {Array}
 */
export function filterGatedSuggestions(suggestions) {
  if (!Array.isArray(suggestions)) return [];
  return suggestions.filter(function (s) {
    if (!s || typeof s !== 'object') return false;
    if (s.enabled === false) return false;
    if (s.evidence_grade === 'NOT_SUPPORTED_DO_NOT_SURFACE') return false;
    // Hard-coded mapping fingerprints, in case a future code path forgets
    // to set enabled / evidence_grade. Mirrors the backend's
    // `_DK_ROI_PROTOCOL_HINTS` audit-disabled entries.
    if (s.pattern === 'lateraloccipital_bilateral_deficit') return false;
    if (s.pattern === 'precuneus_bilateral_excess') return false;
    if (s.modality === 'tDCS' && s.target === 'O1/O2') return false;
    if (s.modality === 'tACS' && s.target === 'Pz') return false;
    return true;
  });
}
