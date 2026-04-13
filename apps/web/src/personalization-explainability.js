/**
 * Client-side compact snapshot for POST /api/v1/treatment-courses (personalization_explainability).
 * Aligns with PersistedPersonalizationExplainability in deepsynaps_core_schema.
 */

export const PERSISTED_EXPLAINABILITY_TOP_CAP = 20;

/**
 * @param {object|null|undefined} dbg - personalization_why_selected_debug from generate-draft
 * @returns {object|null}
 */
export function toPersistedPersonalizationExplainability(dbg) {
  if (!dbg || typeof dbg !== 'object') return null;
  const rawTop = dbg.top_protocols_by_structured_score;
  const top = Array.isArray(rawTop)
    ? rawTop.slice(0, PERSISTED_EXPLAINABILITY_TOP_CAP).map((row) => ({
        protocol_id: row.protocol_id,
        structured_score_total: row.structured_score_total,
      }))
    : [];
  return {
    format_version: dbg.format_version ?? 1,
    selected_protocol_id: dbg.selected_protocol_id ?? '',
    csv_first_protocol_id: dbg.csv_first_baseline_protocol_id ?? null,
    personalization_changed_vs_csv_first: dbg.personalization_changed_vs_csv_first ?? null,
    fired_rule_ids: [...(dbg.fired_rule_ids || [])],
    fired_rule_labels: [...(dbg.fired_rule_labels || [])],
    structured_rule_score_total: dbg.structured_rule_score_total ?? 0,
    token_fallback_used: !!dbg.token_fallback_used,
    ranking_factors_applied: [...(dbg.ranking_factors_applied || [])],
    top_protocols_by_structured_score: top,
    eligible_protocol_count: dbg.eligible_protocol_count ?? 0,
  };
}

/**
 * Stable fingerprint of wizard inputs that must match the last successful generate-draft
 * for a persisted explainability snapshot to be attached.
 * @param {Record<string, unknown>} ws - wizard state
 * @returns {string}
 */
export function computeWizardDraftFingerprint(ws) {
  const parts = [
    ws.patientId || '',
    ws.conditionSlug || '',
    ws.symptomCluster || '',
    ws.phenotypeId || '',
    [...(ws.modalitySlugs || [])].slice().sort().join('|'),
    ws.deviceSlug || '',
    (ws.targetRegion || '').trim(),
    String(ws.frequencyHz || ''),
    String(ws.intensityPct || ''),
    String(ws.sessionsPerWeek || ''),
    String(ws.totalSessions || ''),
    String(ws.sessionDurationMin || ''),
    ws.laterality || '',
    ws._fromProtocolId || '',
  ];
  return parts.join('::');
}

/**
 * @param {Record<string, unknown>} ws
 * @param {object} generatedResult - last generate-draft JSON (same reference as ws.generatedProtocol)
 * @param {string} currentFingerprint - computeWizardDraftFingerprint(ws) at save time
 * @returns {object|null} compact snapshot or null (omit field on POST)
 */
export function shouldAttachPersonalizationExplainability(ws, generatedResult, currentFingerprint) {
  const snap = ws.generatedProtocolPersistedExplainability;
  if (!snap || typeof snap !== 'object') return null;
  if (!ws.draftGenContextFingerprint || ws.draftGenContextFingerprint !== currentFingerprint) return null;
  const dbg = generatedResult?.personalization_why_selected_debug;
  if (!dbg) return null;
  const sid = dbg.selected_protocol_id || '';
  if (!sid || sid !== snap.selected_protocol_id) return null;
  return snap;
}
