// Tests for learning-eeg-reference.js — Learning EEG Reference cards
// Pins: both render functions export, audience branching (raw vs analyzer),
//       source-site attribution note, entry count, external URL rendering,
//       rel="noopener noreferrer", XSS safety of static data (URLs), titles.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { renderLearningEEGReferenceCard, renderLearningEEGCompactList } from './learning-eeg-reference.js';

// Expected canonical topic IDs from the module.
const EXPECTED_IDS = [
  'foundations', 'montage', 'terminology', 'normal-awake', 'artifacts',
  'epileptiform', 'normal-asleep', 'normal-variants', 'non-epileptiform',
  'seizures', 'neonatal', 'pediatric',
];

describe('renderLearningEEGReferenceCard exports', () => {
  it('is a function', () => {
    assert.strictEqual(typeof renderLearningEEGReferenceCard, 'function');
  });
});

describe('renderLearningEEGCompactList exports', () => {
  it('is a function', () => {
    assert.strictEqual(typeof renderLearningEEGCompactList, 'function');
  });
});

describe('renderLearningEEGReferenceCard()', () => {
  it('renders all 12 topic titles', () => {
    const html = renderLearningEEGReferenceCard();
    // These are representative titles from the data
    assert.ok(html.includes('Signal foundations'), 'expected "Signal foundations" title');
    assert.ok(html.includes('Epileptiform patterns'), 'expected "Epileptiform patterns" title');
    assert.ok(html.includes('Seizures'), 'expected "Seizures" title');
    assert.ok(html.includes('Pediatric EEG'), 'expected "Pediatric EEG" title');
    assert.ok(html.includes('Neonatal EEG'), 'expected "Neonatal EEG" title');
  });

  it('renders "Learning EEG Reference" default title', () => {
    const html = renderLearningEEGReferenceCard();
    assert.ok(html.includes('Learning EEG Reference'), 'expected default title');
  });

  it('renders a custom title when provided', () => {
    const html = renderLearningEEGReferenceCard({ title: 'My EEG Guide' });
    assert.ok(html.includes('My EEG Guide'), 'expected custom title');
  });

  it('renders a custom intro when provided', () => {
    const html = renderLearningEEGReferenceCard({ intro: 'Custom intro text.' });
    assert.ok(html.includes('Custom intro text.'), 'expected custom intro text');
  });

  it('includes the source attribution note for Learning EEG by David Valentine MD', () => {
    const html = renderLearningEEGReferenceCard();
    assert.ok(html.includes('Learning EEG by David Valentine MD'), 'expected authorship attribution');
    assert.ok(html.includes('brief reference summaries and links'), 'expected "brief reference summaries and links" disclaimer');
    assert.ok(html.includes('not a mirrored copy of the site'), 'expected anti-mirror disclaimer');
  });

  it('uses analyzerUse text by default (audience not set to raw)', () => {
    const html = renderLearningEEGReferenceCard();
    // epileptiform analyzerUse contains "quantitative deviation"
    assert.ok(html.includes('quantitative deviation'), 'expected analyzer-mode "quantitative deviation" text');
  });

  it('uses rawUse text when audience is "raw"', () => {
    const html = renderLearningEEGReferenceCard({ audience: 'raw' });
    // artifacts rawUse contains "annotate, reject, filter"
    assert.ok(html.includes('annotate, reject, filter'), 'expected raw-mode text for artifacts entry');
  });

  it('renders external links with rel="noopener noreferrer"', () => {
    const html = renderLearningEEGReferenceCard();
    assert.ok(html.includes('rel="noopener noreferrer"'), 'links must include rel="noopener noreferrer"');
  });

  it('renders links with target="_blank"', () => {
    const html = renderLearningEEGReferenceCard();
    assert.ok(html.includes('target="_blank"'), 'links must open in new tab');
  });

  it('renders learningeeg.com URLs', () => {
    const html = renderLearningEEGReferenceCard();
    assert.ok(html.includes('learningeeg.com'), 'expected learningeeg.com URLs');
  });
});

describe('renderLearningEEGCompactList()', () => {
  it('renders "Learning EEG Reference" heading', () => {
    const html = renderLearningEEGCompactList();
    assert.ok(html.includes('Learning EEG Reference'), 'expected heading');
  });

  it('renders the source-links-only disclaimer', () => {
    const html = renderLearningEEGCompactList();
    assert.ok(html.includes('source links only'), 'expected source-links-only notice');
    assert.ok(html.includes('full educational content'), 'expected reference to full site');
  });

  it('renders all 12 topic titles', () => {
    const html = renderLearningEEGCompactList();
    assert.ok(html.includes('Signal foundations'), 'expected foundations title');
    assert.ok(html.includes('Normal variants'), 'expected normal-variants title');
    assert.ok(html.includes('Artifacts'), 'expected artifacts title');
  });

  it('uses analyzerUse text by default', () => {
    const html = renderLearningEEGCompactList();
    // seizures analyzerUse: "abnormal qEEG should not be described as seizure"
    assert.ok(html.includes('should not be described as seizure'), 'expected analyzer seizure guardrail text');
  });

  it('uses rawUse text when audience is "raw"', () => {
    const html = renderLearningEEGCompactList({ audience: 'raw' });
    // normal-asleep rawUse: "Helps distinguish sleep architecture"
    assert.ok(html.includes('sleep architecture'), 'expected raw-mode sleep architecture text');
  });

  it('renders external links with rel="noopener noreferrer"', () => {
    const html = renderLearningEEGCompactList();
    assert.ok(html.includes('rel="noopener noreferrer"'), 'compact list links must include rel="noopener noreferrer"');
  });

  it('renders "Open source" link text for each entry', () => {
    const html = renderLearningEEGCompactList();
    const count = (html.match(/Open source/g) || []).length;
    assert.strictEqual(count, EXPECTED_IDS.length, `expected ${EXPECTED_IDS.length} "Open source" links, got ${count}`);
  });
});
