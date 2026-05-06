import { api } from './api.js';

let _evidenceUiStatsPromise = null;

/** Reset cached stats (e.g. tests). Next getEvidenceUiStats() refetches. */
export function resetEvidenceUiStatsCache() {
  _evidenceUiStatsPromise = null;
}

function _toCount(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function _normalizeGradeKey(key) {
  return String(key || '')
    .toUpperCase()
    .replace(/^EV-/, '')
    .trim();
}

function _summaryHasSignal(summary) {
  if (!summary || typeof summary !== 'object') return false;
  if (_toCount(summary.paper_count, 0) > 0) return true;
  const tiers = summary.top_evidence_tiers || summary.top_evidence_Tiers;
  if (Array.isArray(tiers) && tiers.some((row) => _toCount(row?.count, 0) > 0)) return true;
  const mods = summary.top_modalities;
  if (Array.isArray(mods) && mods.some((row) => _toCount(row?.count, 0) > 0)) return true;
  return false;
}

export async function getEvidenceUiStats({
  fallbackSummary = {},
  fallbackConditionCount = 0,
  fallbackMetaAnalyses = 0,
} = {}) {
  if (!_evidenceUiStatsPromise) {
    _evidenceUiStatsPromise = (async () => {
      try {
        const [summaryRes, statusRes, conditionsRes] = await Promise.allSettled([
          api.getResearchSummary?.(),
          api.evidenceStatus?.(),
          api.listResearchConditions?.(),
        ]);

        const summary = summaryRes.status === 'fulfilled' ? summaryRes.value : null;
        const status = statusRes.status === 'fulfilled' ? statusRes.value : null;
        const conditions =
          conditionsRes.status === 'fulfilled' && Array.isArray(conditionsRes.value)
            ? conditionsRes.value
            : [];

        const evidenceDbHasRows =
          status &&
          _toCount(status.total_papers, 0) +
            _toCount(status.total_trials, 0) +
            _toCount(status.total_fda, 0) >
            0;

        const summarySignals = _summaryHasSignal(summary);
        const conditionsSignal = conditions.length > 0;

        /** True when API responses indicate an indexed corpus or research summary is mounted — not merely HTTP 200 with empty placeholders. */
        const liveEvidenceService =
          evidenceDbHasRows ||
          summarySignals ||
          conditionsSignal;

        const gradeDistribution = {};
        for (const row of summary?.top_evidence_tiers || []) {
          const key = _normalizeGradeKey(row?.key);
          if (!key) continue;
          gradeDistribution[key] = _toCount(row?.count);
        }

        const modalityDistribution = {};
        for (const row of summary?.top_modalities || []) {
          const key = String(row?.key || '').trim();
          if (!key) continue;
          modalityDistribution[key] = _toCount(row?.count);
        }

        return {
          live: liveEvidenceService,
          evidenceStatusReachable: statusRes.status === 'fulfilled',
          evidenceStatusRejected: statusRes.status === 'rejected',
          totalPapers: _toCount(status?.total_papers, _toCount(summary?.paper_count)),
          totalTrials: _toCount(status?.total_trials, 0),
          totalFda: _toCount(status?.total_fda, 0),
          totalConditions: conditions.length,
          openAccessPaperCount: _toCount(summary?.open_access_paper_count, 0),
          topModalities: Array.isArray(summary?.top_modalities) ? summary.top_modalities : [],
          topConditions: Array.isArray(summary?.top_indications) ? summary.top_indications : [],
          topEvidenceTiers: Array.isArray(summary?.top_evidence_tiers) ? summary.top_evidence_tiers : [],
          topStudyTypes: Array.isArray(summary?.top_study_types) ? summary.top_study_types : [],
          topSafetyTags: Array.isArray(summary?.top_safety_tags) ? summary.top_safety_tags : [],
          modalityDistribution,
          gradeDistribution,
          sources: Array.isArray(fallbackSummary?.sources) ? fallbackSummary.sources : [],
        };
      } catch {
        return null;
      }
    })().catch(() => null);
  }

  const live = await _evidenceUiStatsPromise;
  return {
    live: !!live?.live,
    evidenceStatusReachable: !!live?.evidenceStatusReachable,
    evidenceStatusRejected: !!live?.evidenceStatusRejected,
    totalPapers: _toCount(live?.totalPapers, _toCount(fallbackSummary?.totalPapers, 0)),
    totalTrials: _toCount(live?.totalTrials, _toCount(fallbackSummary?.totalTrials, 0)),
    totalFda: _toCount(live?.totalFda, 0),
    totalConditions: _toCount(
      live?.totalConditions,
      _toCount(fallbackSummary?.totalConditions, fallbackConditionCount),
    ),
    totalMetaAnalyses: _toCount(fallbackSummary?.totalMetaAnalyses, fallbackMetaAnalyses),
    openAccessPaperCount: _toCount(live?.openAccessPaperCount, 0),
    topModalities: live?.topModalities || [],
    topConditions: live?.topConditions || [],
    topEvidenceTiers: live?.topEvidenceTiers || [],
    topStudyTypes: live?.topStudyTypes || [],
    topSafetyTags: live?.topSafetyTags || [],
    modalityDistribution: Object.keys(live?.modalityDistribution || {}).length
      ? live.modalityDistribution
      : fallbackSummary?.modalityDistribution || {},
    gradeDistribution: Object.keys(live?.gradeDistribution || {}).length
      ? live.gradeDistribution
      : fallbackSummary?.gradeDistribution || {},
    sources: live?.sources?.length ? live.sources : fallbackSummary?.sources || [],
  };
}
