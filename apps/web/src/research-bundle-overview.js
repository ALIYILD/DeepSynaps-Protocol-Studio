import { api } from './api.js';

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toCount(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export async function loadResearchBundleOverview({
  summaryLimit = 12,
  coverageLimit = 12,
  templateLimit = 12,
  safetyLimit = 18,
  includeConditions = true,
} = {}) {
  const [summaryRes, statusRes, coverageRes, templatesRes, safetyRes, conditionsRes] = await Promise.allSettled([
    api.getResearchSummary?.({ limit: summaryLimit }),
    api.evidenceStatus?.(),
    api.protocolCoverage?.({ limit: coverageLimit }),
    api.listResearchProtocolTemplates?.({ limit: templateLimit }),
    api.listResearchSafetySignals?.({ limit: safetyLimit }),
    includeConditions ? api.listResearchConditions?.() : Promise.resolve([]),
  ]);

  const summary = summaryRes.status === 'fulfilled' ? summaryRes.value : null;
  const status = statusRes.status === 'fulfilled' ? statusRes.value : null;
  const coverageRows = safeArray(coverageRes.status === 'fulfilled' ? coverageRes.value?.rows : []);
  const templates = safeArray(templatesRes.status === 'fulfilled' ? templatesRes.value : []);
  const safetySignals = safeArray(safetyRes.status === 'fulfilled' ? safetyRes.value : []);
  const conditions = safeArray(conditionsRes.status === 'fulfilled' ? conditionsRes.value : []);

  return {
    summary,
    status,
    coverageRows,
    templates,
    safetySignals,
    conditions,
    paperCount: toCount(status?.total_papers, toCount(summary?.paper_count, 0)),
    trialCount: toCount(status?.total_trials, 0),
    fdaCount: toCount(status?.total_fda, 0),
    conditionCount: conditions.length || toCount(summary?.condition_count, 0),
    live: !!summary || !!status || coverageRows.length > 0 || templates.length > 0 || safetySignals.length > 0 || conditions.length > 0,
  };
}
