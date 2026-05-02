// ─────────────────────────────────────────────────────────────────────────────
// raw-ai-hooks.js — Phase 5 AI co-pilot overlay hooks
//
// Thin glue between the qEEG raw-data page UI and the new
// `/api/v1/qeeg-ai/...` endpoints. Each hook expects an `apiClient` (so tests
// can pass a stub) and writes back into either `state.ai` or specific DOM
// elements. Reasoning + features are surfaced as title= tooltips so the
// clinician can hover for "why this suggestion".
//
// Keeping these hooks in a separate module makes them easy to unit-test
// without instantiating the entire raw-data page.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fill the Phase-2 Quality Scorecard shell with the LLM-narrated AI score.
 * The deterministic numeric source-of-truth that already populated the card
 * stays — we only overwrite the narrative when a richer one returns.
 *
 * @param {object} state - the page's `state` object (with `state.ai`).
 * @param {string} analysisId
 * @param {object} apiClient - object exposing `getQEEGAIQualityScore`.
 * @param {Document} [doc=document] - optional DOM root (test injection).
 */
export async function fillQualityScorecardFromAI(state, analysisId, apiClient, doc) {
  if (!analysisId || !apiClient || !apiClient.getQEEGAIQualityScore) return null;
  const document_ = doc || (typeof document !== 'undefined' ? document : null);
  let resp = null;
  try {
    resp = await apiClient.getQEEGAIQualityScore(analysisId);
  } catch (_e) {
    return null; // Silent — deterministic card is still authoritative.
  }
  if (!resp || !resp.result) return null;
  const subs = resp.result.subscores || {};
  if (state && state.ai) {
    state.ai.qualityScore = resp.result.score;
    state.ai.qualityNarrative = resp.reasoning || state.ai.qualityNarrative;
    state.ai.qualityFeatures = resp.features || {};
    state.ai.qualitySubscores = subs;
  }
  if (document_) {
    const big = document_.getElementById && document_.getElementById('quality-score-big');
    if (big && resp.result.score != null) big.textContent = String(resp.result.score);
    const card = document_.getElementById && document_.getElementById('quality-scorecard');
    if (card && card.querySelector) {
      const keys = ['impedance', 'line_noise', 'blink_density', 'motion', 'channel_agreement'];
      for (const k of keys) {
        if (subs[k] == null) continue;
        const row = card.querySelector(`[data-metric="${k}"] span`);
        if (row) row.textContent = String(subs[k]);
      }
    }
    const nar = document_.getElementById && document_.getElementById('quality-narrative');
    if (nar && resp.reasoning) nar.textContent = resp.reasoning;
  }
  return resp;
}

/**
 * Prefill the LFF/HFF/Notch selects with the AI's recommendation.
 * Critically: this DOES NOT save the values automatically — the clinician
 * must explicitly hit "Save" to commit. The rationale string is set as the
 * select-group title= attribute so a tooltip surfaces "why".
 *
 * @returns {object|null} the API response, or null on error.
 */
export async function prefillFiltersFromAI(state, analysisId, apiClient, doc) {
  if (!analysisId || !apiClient || !apiClient.getQEEGAIRecommendFilters) return null;
  const document_ = doc || (typeof document !== 'undefined' ? document : null);
  let resp = null;
  try {
    resp = await apiClient.getQEEGAIRecommendFilters(analysisId);
  } catch (_e) {
    return null;
  }
  if (!resp || !resp.result) return null;
  const r = resp.result;
  if (state && state.ai) {
    state.ai.recommendedFilters = { lff: r.lff, hff: r.hff, notch: r.notch };
    state.ai.filterRationale = resp.reasoning || r.rationale || '';
  }
  if (state && state.processing && state.processing.filterParams) {
    if (r.lff != null) state.processing.filterParams.lff = r.lff;
    if (r.hff != null) state.processing.filterParams.hff = r.hff;
    if (r.notch != null) state.processing.filterParams.notch = r.notch;
    state.processing.hasUnsavedChanges = true;
  } else if (state && state.filterParams) {
    if (r.lff != null) state.filterParams.lff = r.lff;
    if (r.hff != null) state.filterParams.hff = r.hff;
    if (r.notch != null) state.filterParams.notch = r.notch;
    state.hasUnsavedChanges = true;
  }
  if (document_ && document_.getElementById) {
    const lff = document_.getElementById('eeg-lff-sel');
    const hff = document_.getElementById('eeg-hff-sel');
    const notch = document_.getElementById('eeg-notch-sel');
    if (lff && r.lff != null) lff.value = String(r.lff);
    if (hff && r.hff != null) hff.value = String(r.hff);
    if (notch && r.notch != null) notch.value = String(r.notch);
    // Surface rationale as a tooltip on each select so the clinician can hover
    // any of LFF/HFF/Notch and see the AI's "why".
    const tooltip = resp.reasoning || r.rationale || '';
    if (tooltip) {
      [lff, hff, notch].forEach((el) => {
        if (el && el.setAttribute) el.setAttribute('title', tooltip);
      });
    }
  }
  return resp;
}

/**
 * Apply per-IC AI classifications to a Phase-4 EEGDecompositionStudio
 * instance. We don't replace its render path — instead we set a per-cell
 * `title` so hovering an IC cell shows "label confidence% — explanation".
 *
 * @param {object} resp - the response from `getQEEGAIClassifyComponents`.
 * @param {object} containerOrStudio - either the studio (with .container)
 *   or a raw HTMLElement.
 */
export function applyComponentClassificationsTooltips(resp, containerOrStudio) {
  if (!resp || !Array.isArray(resp.result)) return 0;
  const container = containerOrStudio && containerOrStudio.container
    ? containerOrStudio.container
    : containerOrStudio;
  if (!container || !container.querySelectorAll) return 0;
  const byIdx = new Map();
  for (const r of resp.result) {
    if (r && r.idx != null) byIdx.set(Number(r.idx), r);
  }
  const cells = container.querySelectorAll('.eeg-ds__cell');
  let n = 0;
  for (let i = 0; i < (cells.length || 0); i += 1) {
    const cell = cells[i];
    if (!cell || !cell.dataset) continue;
    const idx = Number(cell.dataset.idx);
    const r = byIdx.get(idx);
    if (!r) continue;
    const conf = (Number(r.confidence) * 100).toFixed(0);
    const tip = `IC${idx}: ${r.label} ${conf}% — ${r.explanation || ''}`;
    if (cell.setAttribute) cell.setAttribute('title', tip);
    cell.dataset.aiLabel = String(r.label || '');
    cell.dataset.aiConfidence = String(r.confidence || 0);
    n += 1;
  }
  return n;
}

/**
 * Render the LLM recording-summary blob into the right-rail "AI Recording
 * Summary" section. Idempotent — only renders once per analysisId.
 */
export async function renderRecordingNarrative(state, analysisId, apiClient, doc) {
  if (!analysisId || !apiClient || !apiClient.getQEEGAINarrate) return null;
  const document_ = doc || (typeof document !== 'undefined' ? document : null);
  if (state && state.ai && state.ai.recordingNarrativeAnalysisId === analysisId) {
    return state.ai.recordingNarrative || null;
  }
  let resp = null;
  try {
    resp = await apiClient.getQEEGAINarrate(analysisId);
  } catch (_e) {
    return null;
  }
  if (!resp) return null;
  const text = (resp.result && resp.result.summary) || resp.reasoning || '';
  if (state && state.ai) {
    state.ai.recordingNarrative = text;
    state.ai.recordingNarrativeFeatures = resp.features || {};
    state.ai.recordingNarrativeAnalysisId = analysisId;
  }
  if (document_ && document_.getElementById) {
    const el = document_.getElementById('ai-recording-summary-body');
    if (el) el.textContent = text;
  }
  return resp;
}

/**
 * Hover handler for a bad-channel row. Loads explanation lazily and
 * populates a small popover element. The caller passes the channel name
 * + the popover element (and optionally a callback to position it).
 */
export async function explainBadChannelOnHover(analysisId, channel, apiClient, popoverEl) {
  if (!analysisId || !channel || !apiClient || !apiClient.getQEEGAIExplainBadChannel) return null;
  let resp = null;
  try {
    resp = await apiClient.getQEEGAIExplainBadChannel(analysisId, channel);
  } catch (_e) {
    return null;
  }
  if (!resp) return null;
  if (popoverEl) {
    const r = resp.result || {};
    const conf = r.confidence != null ? ` (conf ${(Number(r.confidence) * 100).toFixed(0)}%)` : '';
    const reason = r.reason || 'ok';
    const text = (resp.reasoning || `Channel ${channel}: ${reason}${conf}`).trim();
    popoverEl.textContent = text;
    if (popoverEl.setAttribute) popoverEl.setAttribute('data-channel', channel);
  }
  return resp;
}

/**
 * Suggest a montage and (a) write it into state.montage and (b) update the
 * select element with a tooltip showing the rationale. Caller commits via
 * Save.
 */
export async function suggestMontageFromAI(state, analysisId, apiClient, doc) {
  if (!analysisId || !apiClient || !apiClient.getQEEGAIRecommendMontage) return null;
  const document_ = doc || (typeof document !== 'undefined' ? document : null);
  let resp = null;
  try {
    resp = await apiClient.getQEEGAIRecommendMontage(analysisId);
  } catch (_e) {
    return null;
  }
  if (!resp || !resp.result) return null;
  const r = resp.result;
  if (state && state.ai) {
    state.ai.recommendedMontage = r.montage;
    state.ai.montageRationale = resp.reasoning || r.rationale || '';
  }
  if (document_ && document_.getElementById) {
    const sel = document_.getElementById('eeg-montage-sel');
    if (sel && r.montage) {
      sel.value = String(r.montage);
      if (resp.reasoning && sel.setAttribute) {
        sel.setAttribute('title', resp.reasoning);
      }
    }
  }
  return resp;
}
