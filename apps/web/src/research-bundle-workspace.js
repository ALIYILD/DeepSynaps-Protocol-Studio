import { api } from './api.js';

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export async function loadResearchBundleWorkspace({
  summaryLimit = 12,
  coverageLimit = 24,
  templateLimit = 24,
  exactProtocolLimit = 24,
  safetyLimit = 40,
  evidenceGraphLimit = 24,
  adjunctLimit = 12,
} = {}) {
  try {
    const [summary, coverageRes, templates, exactProtocols, safetySignals, evidenceGraph, adjunctSummary, adjunctPapers, adjunctReviewTables] = await Promise.all([
      api.getResearchSummary?.({ limit: summaryLimit }).catch(() => null),
      api.protocolCoverage?.({ limit: coverageLimit }).catch(() => null),
      api.listResearchProtocolTemplates?.({ limit: templateLimit }).catch(() => []),
      api.listResearchExactProtocols?.({ limit: exactProtocolLimit }).catch(() => []),
      api.listResearchSafetySignals?.({ limit: safetyLimit }).catch(() => []),
      api.listResearchEvidenceGraph?.({ limit: evidenceGraphLimit }).catch(() => []),
      api.getResearchAdjunctSummary?.({ limit: Math.min(summaryLimit, 8) }).catch(() => null),
      api.listResearchAdjunctEvidence?.({ limit: adjunctLimit }).catch(() => []),
      api.getResearchAdjunctReviewTables?.({ limit_per_condition: 6 }).catch(() => null),
    ]);

    const coverageRows = safeArray(coverageRes?.rows);
    const safeTemplates = safeArray(templates);
    const safeExactProtocols = safeArray(exactProtocols);
    const safeSafetySignals = safeArray(safetySignals);
    const safeEvidenceGraph = safeArray(evidenceGraph);
    const safeAdjunctPapers = safeArray(adjunctPapers);

    return {
      summary: summary || null,
      coverageRows,
      templates: safeTemplates,
      exactProtocols: safeExactProtocols,
      safetySignals: safeSafetySignals,
      evidenceGraph: safeEvidenceGraph,
      adjunctSummary: adjunctSummary || null,
      adjunctPapers: safeAdjunctPapers,
      adjunctReviewTables: adjunctReviewTables || null,
      live:
        coverageRows.length > 0 ||
        safeTemplates.length > 0 ||
        safeExactProtocols.length > 0 ||
        safeSafetySignals.length > 0 ||
        safeEvidenceGraph.length > 0 ||
        safeAdjunctPapers.length > 0,
    };
  } catch {
    return {
      summary: null,
      coverageRows: [],
      templates: [],
      exactProtocols: [],
      safetySignals: [],
      evidenceGraph: [],
      adjunctSummary: null,
      adjunctPapers: [],
      adjunctReviewTables: null,
      live: false,
    };
  }
}
