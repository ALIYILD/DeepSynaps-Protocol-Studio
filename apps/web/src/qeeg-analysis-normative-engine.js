// ─────────────────────────────────────────────────────────────────────────────
// qeeg-analysis-normative-engine.js — Recording condition + normative scaffold
//
// Maps acquisition metadata to a canonical vocabulary for UI and future
// normative providers. Does not invent normative databases or clinical z-scores.
// ─────────────────────────────────────────────────────────────────────────────
import { NORMATIVE_COMPARISON_REQUIRES_CONDITION_COPY } from './clinical-ai-safety-copy.js';

export const RECORDING_CONDITION_OPTIONS = [
  { value: 'eyes_closed', label: 'Eyes closed' },
  { value: 'eyes_open', label: 'Eyes open' },
  { value: 'task', label: 'Task / other' },
  { value: 'unknown', label: 'Unknown' },
];

export function normativeEngineStorageKey(analysisId) {
  return 'ds_qeeg_recording_condition_' + String(analysisId || '');
}

/** Align with server-side _resolve_recording_condition (eyes_closed | eyes_open | task | unknown). */
export function resolveRecordingConditionFromMetadata(eyesRaw) {
  if (eyesRaw == null || eyesRaw === '') return 'unknown';
  var s = String(eyesRaw).trim().toLowerCase();
  if (s === 'closed' || s === 'eyes_closed' || s === 'ec' || s === 'eye_closed' || s === 'eyes closed') {
    return 'eyes_closed';
  }
  if (s === 'open' || s === 'eyes_open' || s === 'eo' || s === 'eye_open' || s === 'eyes open') {
    return 'eyes_open';
  }
  if (s === 'task' || s === 'other' || s === 'mixed' || s === 'both' || s === 'eyes_mixed') {
    return 'task';
  }
  return 'unknown';
}

export function resolveRecordingConditionForAnalysis(analysis, analysisId) {
  var override = null;
  try {
    if (typeof sessionStorage !== 'undefined' && analysisId) {
      var v = sessionStorage.getItem(normativeEngineStorageKey(analysisId));
      if (v) override = v;
    }
  } catch (_) { /* sessionStorage unavailable */ }
  if (override) return override;
  var raw = analysis && (analysis.eyes_condition != null ? analysis.eyes_condition : analysis.eyesCondition);
  return resolveRecordingConditionFromMetadata(raw);
}

function _conditionLabel(value) {
  var opt = RECORDING_CONDITION_OPTIONS.find(function (o) { return o.value === value; });
  return opt ? opt.label : value;
}

function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Inline panel: clinician can label the recording state for normative matching.
 * Session override is browser-only (sessionStorage); it is not persisted to the
 * server until a future PATCH endpoint ships (see docs/qeeg-analyzer-endpoint-map.md).
 */
export function renderRecordingConditionPanel(analysis, analysisId) {
  var resolved = resolveRecordingConditionForAnalysis(analysis, analysisId);
  var warn = resolved === 'unknown'
    ? '<div role="status" data-testid="qeeg-normative-condition-warning" style="margin-top:10px;padding:10px 12px;border-radius:8px;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.35);font-size:12px;line-height:1.55;color:var(--text-primary)">'
      + esc(NORMATIVE_COMPARISON_REQUIRES_CONDITION_COPY)
      + '</div>'
    : '';
  var opts = RECORDING_CONDITION_OPTIONS.map(function (o) {
    return '<option value="' + esc(o.value) + '"' + (o.value === resolved ? ' selected' : '') + '>' + esc(o.label) + '</option>';
  }).join('');
  return '<div class="ds-card" data-testid="qeeg-recording-condition-card">'
    + '<div class="ds-card__header"><h3>Recording condition (normative context)</h3>'
    + '<span class="badge" style="font-size:11px;font-weight:700">Decision-support only</span></div>'
    + '<div class="ds-card__body" style="font-size:13px;color:var(--text-secondary);line-height:1.55">'
    + '<p style="margin:0 0 8px">Select the closest acquisition state for this session. '
    + 'This helps align quantitative summaries with normative databases when one is configured. '
    + '<strong>Not saved to the server:</strong> overrides apply in this browser only (sessionStorage); '
    + 'they clear when the session ends or storage is cleared. A future API will persist clinician overrides.</p>'
    + '<label for="qeeg-recording-condition-select" style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-tertiary);margin-bottom:4px">Recording condition</label>'
    + '<select id="qeeg-recording-condition-select" class="form-select" data-testid="qeeg-recording-condition-select" style="max-width:280px">'
    + opts
    + '</select>'
    + '<div style="margin-top:8px;font-size:12px;color:var(--text-tertiary)">Resolved for display: <strong style="color:var(--text-primary)">' + esc(_conditionLabel(resolved)) + '</strong>'
    + (analysis && analysis.eyes_condition ? ' · Metadata: <code style="font-size:11px">' + esc(String(analysis.eyes_condition)) + '</code>' : '')
    + '</div>'
    + warn
    + '</div></div>';
}

export function wireRecordingConditionPanel(analysisId, onNavigate, logAudit) {
  var sel = document.getElementById('qeeg-recording-condition-select');
  if (!sel) return;
  sel.addEventListener('change', function () {
    var v = sel.value || 'unknown';
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(normativeEngineStorageKey(analysisId), v);
      }
    } catch (_) { /* ignore */ }
    try {
      if (typeof logAudit === 'function') {
        logAudit({ recording_condition: v, analysis_id: analysisId });
      }
    } catch (_) { /* ignore */ }
    if (typeof onNavigate === 'function') onNavigate();
  });
}

/** Synthetic normative card for demo analysis when the live API card is not mounted. */
export function buildDemoNormativeModelCard(analysis) {
  var rc = resolveRecordingConditionForAnalysis(analysis, 'demo');
  var normDb = (analysis && analysis.norm_db_version) || 'toy-0.1';
  var unknown = rc === 'unknown';
  return {
    status: 'toy',
    normative_db_name: 'Demo synthetic model',
    normative_db_version: normDb,
    age_range: 'Synthetic / illustrative',
    eyes_condition_compatible: rc !== 'unknown',
    montage_compatible: true,
    zscore_method: 'Demo review-cue reference only',
    confidence_interval: 'n/a',
    ood_warning: unknown
      ? NORMATIVE_COMPARISON_REQUIRES_CONDITION_COPY
      : 'Demo cohort — out-of-distribution checks not simulated.',
    clinical_caveat: 'Synthetic demo values only; not clinical normative scoring. Decision-support only.',
    limitations: [
      'Z-scores and flags in this preview are review cues, not clinical conclusions.',
      unknown ? NORMATIVE_COMPARISON_REQUIRES_CONDITION_COPY : 'Eyes-state is illustrative; verify against acquisition notes.',
    ],
    complete: false,
    recording_condition: rc,
    normative_provider: {
      type: 'demo',
      name: 'Demo synthetic model',
      version: normDb,
      clinical_use: false,
      disclaimer: 'Synthetic demo reference only; not clinical normative scoring.',
    },
  };
}
