import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderElectrophysiologyReferenceCard } from './electrophysiology-reference-card.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dir, 'pages-qeeg-analysis.js'), 'utf8');

describe('qEEG electrophysiology wiring', () => {
  it('renders the reference card with disclaimer and source provenance', () => {
    const html = renderElectrophysiologyReferenceCard(
      {
        adapters: [
          { dataset_name: 'EEGBase', source_id: 'eegbase', modality: 'EEG/qEEG', recording_condition: 'unknown', population_context: 'Repository', access_type: 'free', dataset_type: 'repository', lifecycle_state: 'catalogued', status: 'catalogued', source_url: 'https://eegbase.kiv.zcu.cz/', warnings: ['Reference dataset only.'] },
        ],
      },
      {
        query: { modality: 'qEEG', condition: 'reference', recording_condition: 'unknown', frequency_band: 'theta', biomarker: 'theta/beta' },
        decision_support_disclaimer: 'Decision support only. Not diagnostic.',
        matching_reference_datasets: [
          { dataset_name: 'EEGBase', source_id: 'eegbase', match_score: 25, match_reason: 'modality matches EEG/qEEG', modality: 'EEG/qEEG', recording_condition: 'unknown', frequency_band: 'theta/beta', limitations: ['No live adapter access.'] },
        ],
      }
    );
    assert.match(html, /Electrophysiology reference datasets/);
    assert.match(html, /Decision support only/);
    assert.match(html, /EEGBase/);
    assert.match(html, /Reference search matches/);
  });

  it('pages-qeeg-analysis imports the electrophysiology reference helper', () => {
    assert.match(SRC, /renderElectrophysiologyReferenceCard/);
    assert.match(SRC, /electrophysiologySearch/);
  });
});
