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
} = {}) {
  try {
    const [summary, coverageRes, templates, exactProtocols, safetySignals, evidenceGraph] = await Promise.all([
      api.getResearchSummary?.({ limit: summaryLimit }).catch(() => null),
      api.protocolCoverage?.({ limit: coverageLimit }).catch(() => null),
      api.listResearchProtocolTemplates?.({ limit: templateLimit }).catch(() => []),
      api.listResearchExactProtocols?.({ limit: exactProtocolLimit }).catch(() => []),
      api.listResearchSafetySignals?.({ limit: safetyLimit }).catch(() => []),
      api.listResearchEvidenceGraph?.({ limit: evidenceGraphLimit }).catch(() => []),
    ]);

    const coverageRows = safeArray(coverageRes?.rows);
    const safeTemplates = safeArray(templates);
    const safeExactProtocols = safeArray(exactProtocols);
    const safeSafetySignals = safeArray(safetySignals);
    const safeEvidenceGraph = safeArray(evidenceGraph);

    return {
      summary: summary || null,
      coverageRows,
      templates: safeTemplates,
      exactProtocols: safeExactProtocols,
      safetySignals: safeSafetySignals,
      evidenceGraph: safeEvidenceGraph,
      live:
        coverageRows.length > 0 ||
        safeTemplates.length > 0 ||
        safeExactProtocols.length > 0 ||
        safeSafetySignals.length > 0 ||
        safeEvidenceGraph.length > 0,
    };
  } catch {
    return {
      summary: null,
      coverageRows: [],
      templates: [],
      exactProtocols: [],
      safetySignals: [],
      evidenceGraph: [],
      live: false,
    };
  }
}
