import { api } from './api.js';

export function getProtocolWatchSignalTitle(signal) {
  return (signal?.safety_signal_tags || [])
    .concat(signal?.contraindication_signal_tags || [])
    .join(', ')
    || signal?.title
    || signal?.example_titles
    || 'Safety signal';
}

export async function loadProtocolWatchContext({
  condition = '',
  modality = '',
  coverageLimit = 8,
  templateLimit = 4,
  safetyLimit = 4,
} = {}) {
  try {
    const [coverageRes, templates, safety] = await Promise.all([
      api.protocolCoverage({ condition, modality, limit: coverageLimit }).catch(() => null),
      api.listResearchProtocolTemplates({ indication: condition, modality, limit: templateLimit }).catch(() => []),
      api.listResearchSafetySignals({ indication: condition, modality, limit: safetyLimit }).catch(() => []),
    ]);

    const coverageRows = Array.isArray(coverageRes?.rows) ? coverageRes.rows : [];
    return {
      coverage: coverageRows[0] || null,
      template: Array.isArray(templates) ? templates[0] || null : null,
      safety: Array.isArray(safety) ? safety[0] || null : null,
    };
  } catch {
    return null;
  }
}
