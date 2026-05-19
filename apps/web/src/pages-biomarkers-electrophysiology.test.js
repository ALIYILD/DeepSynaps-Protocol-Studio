import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderElectrophysiologyReferenceCard } from './electrophysiology-reference-card.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dir, 'pages-biomarkers.js'), 'utf8');

describe('Biomarkers electrophysiology wiring', () => {
  it('renders the qEEG electrophysiology reference card', () => {
    const html = renderElectrophysiologyReferenceCard(
      {
        adapters: [
          { dataset_name: 'Sleep-EDF', source_id: 'sleep_edf', modality: 'sleep EEG', recording_condition: 'sleep', population_context: 'Sleep EEG dataset', access_type: 'free', dataset_type: 'sleep EEG dataset', lifecycle_state: 'catalogued', status: 'catalogued', source_url: 'https://physionet.org/content/sleep-edfx/', warnings: ['Reference dataset only.'] },
        ],
      },
      {
        query: { modality: 'qEEG', condition: 'sleep', recording_condition: 'sleep', frequency_band: 'theta', biomarker: 'slow-wave activity' },
        decision_support_disclaimer: 'Decision support only. Not diagnostic.',
        matching_reference_datasets: [
          { dataset_name: 'Sleep-EDF', source_id: 'sleep_edf', match_score: 55, match_reason: 'recording condition matches sleep', modality: 'sleep EEG', recording_condition: 'sleep', frequency_band: 'delta/theta/spindle', limitations: ['Sleep-specific reference only.'] },
        ],
      }
    );
    assert.match(html, /Electrophysiology reference datasets/);
    assert.match(html, /Sleep-EDF/);
    assert.match(html, /Decision support only/);
  });

  it('pages-biomarkers imports the electrophysiology reference helper', () => {
    assert.match(SRC, /renderElectrophysiologyReferenceCard/);
    assert.match(SRC, /electrophysiologyListAdapters/);
    assert.match(SRC, /electrophysiologySearch/);
  });
});
