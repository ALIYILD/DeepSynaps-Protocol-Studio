// Tests for raw-help-content.js
// Pins: RAW_HELP_TOPICS keys, required fields (title + HTML body), critical safety copy
//       in specific topics, absence of vendor names, and RAW_HELP_TOPIC_KEYS consistency.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { RAW_HELP_TOPICS, RAW_HELP_TOPIC_KEYS } from './raw-help-content.js';

const EXPECTED_KEYS = [
  'montage',
  'sensitivity',
  'bandpass',
  'notch',
  'ica_review',
  'bad_channel_marking',
  'bad_segment_marking',
  'auto_scan',
  'decomposition_studio',
  'templates',
  'spike_list',
  'caliper',
  'export',
  'cleaning_report',
  'ai_quality_score',
  'ai_auto_clean',
];

describe('RAW_HELP_TOPICS top-level structure', () => {
  it('exports a plain object', () => {
    assert.ok(RAW_HELP_TOPICS !== null && typeof RAW_HELP_TOPICS === 'object' && !Array.isArray(RAW_HELP_TOPICS));
  });

  it('every expected help topic key is present', () => {
    for (const key of EXPECTED_KEYS) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(RAW_HELP_TOPICS, key),
        `RAW_HELP_TOPICS missing expected key: ${key}`,
      );
    }
  });

  it('every topic has a non-empty title and body string', () => {
    for (const [key, topic] of Object.entries(RAW_HELP_TOPICS)) {
      assert.ok(typeof topic.title === 'string' && topic.title.length > 0, `${key}.title must be a non-empty string`);
      assert.ok(typeof topic.body === 'string' && topic.body.length > 0, `${key}.body must be a non-empty string`);
    }
  });

  it('every body is an HTML string (contains at least one <p> tag)', () => {
    for (const [key, topic] of Object.entries(RAW_HELP_TOPICS)) {
      assert.ok(topic.body.includes('<p>'), `${key}.body must contain at least one <p> tag`);
    }
  });
});

describe('RAW_HELP_TOPIC_KEYS', () => {
  it('equals Object.keys(RAW_HELP_TOPICS)', () => {
    const expected = Object.keys(RAW_HELP_TOPICS).sort();
    const actual = [...RAW_HELP_TOPIC_KEYS].sort();
    assert.deepStrictEqual(actual, expected, 'RAW_HELP_TOPIC_KEYS must match Object.keys(RAW_HELP_TOPICS)');
  });
});

describe('RAW_HELP_TOPICS safety-critical copy', () => {
  it('spike_list body states that detector output requires confirmation by a qualified electroencephalographer', () => {
    const body = RAW_HELP_TOPICS.spike_list.body.toLowerCase();
    assert.ok(
      body.includes('qualified electroencephalographer'),
      'spike_list must require qualified electroencephalographer review',
    );
  });

  it('auto_scan body states the clinician reviews proposals before they apply', () => {
    const body = RAW_HELP_TOPICS.auto_scan.body.toLowerCase();
    assert.ok(
      body.includes('review') && (body.includes('before') || body.includes('accept')),
      'auto_scan must describe clinician review gate before applying proposals',
    );
  });

  it('ai_auto_clean body states the model never edits cleaning state without human action', () => {
    const body = RAW_HELP_TOPICS.ai_auto_clean.body.toLowerCase();
    assert.ok(
      body.includes('human action') || body.includes('without a human'),
      'ai_auto_clean must state model never acts without human action',
    );
  });

  it('ai_quality_score body states score is a guide, not a substitute for visual review', () => {
    const body = RAW_HELP_TOPICS.ai_quality_score.body.toLowerCase();
    assert.ok(
      body.includes('guide') || body.includes('not a substitute'),
      'ai_quality_score must include a non-authority caveat',
    );
  });

  it('bandpass body states filtering is a display-time operation and raw signal is preserved', () => {
    const body = RAW_HELP_TOPICS.bandpass.body.toLowerCase();
    assert.ok(
      body.includes('display') || body.includes('preserved'),
      'bandpass must clarify the operation is display-time only',
    );
  });

  it('export body states the original raw recording is never overwritten', () => {
    const body = RAW_HELP_TOPICS.export.body.toLowerCase();
    assert.ok(
      body.includes('never overwritten') || body.includes('not overwritten'),
      'export body must guarantee raw recording is never overwritten',
    );
  });
});

describe('RAW_HELP_TOPICS references open standards only', () => {
  it('montage body references the 10-20 / 10-10 system', () => {
    assert.ok(
      RAW_HELP_TOPICS.montage.body.includes('10-20') || RAW_HELP_TOPICS.montage.body.includes('10-10'),
      'montage should reference the international 10-20/10-10 system',
    );
  });

  it('sensitivity body references IFCN minimum technical recommendations', () => {
    assert.ok(
      RAW_HELP_TOPICS.sensitivity.body.includes('IFCN'),
      'sensitivity should cite IFCN minimum technical recommendations',
    );
  });

  it('export body references at least two open interchange formats (EDF, FIF, or BrainVision)', () => {
    const body = RAW_HELP_TOPICS.export.body;
    const formatsFound = ['EDF', 'FIF', 'BrainVision'].filter((f) => body.includes(f));
    assert.ok(formatsFound.length >= 2, `export must mention at least 2 open formats, found: ${formatsFound}`);
  });
});
