import { api } from './api.js';

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function getModalitySignalTitle(signal) {
  return (signal?.safety_signal_tags || [])
    .concat(signal?.contraindication_signal_tags || [])
    .join(', ')
    || signal?.title
    || signal?.example_titles
    || 'Safety signal';
}

export function getModalityTemplateHint(bundle, modality) {
  const row = bundle?.[modality]?.templates?.[0];
  if (!row) return '';
  const bits = [row.indication, row.target, row.evidence_tier].filter(Boolean);
  return bits.length ? `Live template: ${bits.join(' · ')}.` : '';
}

export async function loadModalityEvidenceContext(modalities, {
  templateLimit = 4,
  safetyLimit = 4,
} = {}) {
  const safeModalities = Array.from(new Set(safeArray(modalities).filter(Boolean)));
  const out = {};
  await Promise.all(safeModalities.map(async (modality) => {
    try {
      const [templates, safety] = await Promise.all([
        api.listResearchProtocolTemplates?.({ modality, limit: templateLimit }).catch(() => []),
        api.listResearchSafetySignals?.({ modality, limit: safetyLimit }).catch(() => []),
      ]);
      out[modality] = {
        templates: safeArray(templates),
        safety: safeArray(safety),
      };
    } catch {
      out[modality] = { templates: [], safety: [] };
    }
  }));
  return out;
}
