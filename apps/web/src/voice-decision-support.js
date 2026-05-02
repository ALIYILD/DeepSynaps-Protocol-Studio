/**
 * Single source of truth for Voice / acoustic biomarker decision-support copy and error UX.
 * Research / adjunct-to-judgment positioning — not a regulated diagnostic claim.
 */

/** Short line for chips, cards, and secondary banners */
export const VOICE_DECISION_SUPPORT_SHORT =
  'Voice acoustic outputs are decision-support signals for clinician review — not a diagnosis, staging tool, or treatment directive.';

/** Full paragraph for primary analyzer surfaces */
export const VOICE_DECISION_SUPPORT_FULL =
  'These outputs are clinical decision-support signals derived from acoustic heuristics and literature retrieval from the DeepSynaps corpus. '
  + 'They are not diagnoses, FDA-cleared tests, or treatment recommendations. '
  + 'Interpret with full clinical context and standardized speech–language assessment when indicated.';

/** Strip suitable for inline amber boxes (~2 sentences) */
export const VOICE_DECISION_SUPPORT_INLINE =
  `${VOICE_DECISION_SUPPORT_SHORT} Full acoustic biomarker reports with literature links run via Voice Analyzer or Recording Studio “Analyze.”`;

/**
 * Non-empty HTML snippet with pipeline provenance when present on stored report payload.
 */
export function voicePipelineMetaBlock(voiceReport) {
  const prov = voiceReport?.provenance;
  if (!prov || typeof prov !== 'object') return '';
  const pv = prov.pipeline_version;
  const nv = prov.norm_db_version;
  const sv = prov.schema_version;
  const parts = [];
  if (pv) parts.push(`Pipeline ${escapeHtml(pv)}`);
  if (nv) parts.push(`Norm DB ${escapeHtml(nv)}`);
  if (sv) parts.push(`Schema ${escapeHtml(sv)}`);
  if (!parts.length) return '';
  return `<div style="font-size:11px;color:var(--text-tertiary);margin-top:8px;font-family:var(--font-mono,monospace)">${parts.join(' · ')}</div>`;
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Map apiFetch errors (status + FastAPI detail) to clinician-facing toast copy.
 */
export function voiceApiErrorToast(err) {
  const status = err?.status;
  const detail = String(err?.message || err?.body?.detail || '').trim();
  if (status === 503) {
    return {
      title: 'Voice analyzer unavailable',
      body:
        'The acoustic pipeline is not installed on this API worker (install deepsynaps-audio with [acoustic]). '
        + (detail ? `Detail: ${detail.slice(0, 160)}` : ''),
      severity: 'warning',
    };
  }
  if (status === 401 || err?.code === 'not_a_real_user') {
    return {
      title: 'Sign-in required',
      body: detail || 'Use a full clinician account for voice analysis.',
      severity: 'warning',
    };
  }
  return {
    title: 'Voice analysis failed',
    body: detail.slice(0, 280) || 'Unknown error',
    severity: 'error',
  };
}

/** Extra DeepTwin strip when user navigates with voice domain hint */
export const VOICE_DEEPTWIN_DOMAIN_NOTE =
  'Voice domain: acoustic biomarker counts reflect Voice Analyzer / virtual-care uploads — decision-support only; confirm findings clinically.';
