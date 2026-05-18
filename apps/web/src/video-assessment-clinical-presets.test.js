// Tests for video-assessment-clinical-presets.js
// Pins: VA_CONDITION_PRESETS structure, getVaPreset lookup, normalizeClinicalContext,
//       VA_DEFAULT_PRESET_ID contract, and non-diagnostic reviewer_focus copy.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  VA_CONDITION_PRESETS,
  VA_DEFAULT_PRESET_ID,
  getVaPreset,
  normalizeClinicalContext,
} from './video-assessment-clinical-presets.js';

describe('VA_CONDITION_PRESETS structure', () => {
  it('exports a non-empty array', () => {
    assert.ok(Array.isArray(VA_CONDITION_PRESETS) && VA_CONDITION_PRESETS.length > 0);
  });

  it('every preset has required fields: id, label, evidence_diagnosis, phenotype_tags, patient_hint, reviewer_focus', () => {
    const REQUIRED = ['id', 'label', 'evidence_diagnosis', 'phenotype_tags', 'patient_hint', 'reviewer_focus'];
    for (const p of VA_CONDITION_PRESETS) {
      for (const f of REQUIRED) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(p, f) && p[f] !== null && p[f] !== undefined,
          `preset ${p.id || '?'} missing required field: ${f}`,
        );
      }
    }
  });

  it('every preset has at least one phenotype_tag', () => {
    for (const p of VA_CONDITION_PRESETS) {
      assert.ok(Array.isArray(p.phenotype_tags) && p.phenotype_tags.length > 0, `${p.id} must have phenotype_tags`);
    }
  });

  it('all preset ids are unique', () => {
    const ids = VA_CONDITION_PRESETS.map((p) => p.id);
    assert.strictEqual(new Set(ids).size, ids.length, 'preset ids must be unique');
  });

  it('reviewer_focus copy is non-diagnostic (should not claim diagnosis/measurement)', () => {
    for (const p of VA_CONDITION_PRESETS) {
      // reviewer_focus must not say "diagnoses" or "measures" — it should use hedging language
      const lower = p.reviewer_focus.toLowerCase();
      assert.ok(
        !lower.includes('this diagnoses') && !lower.includes('this measures'),
        `preset ${p.id} reviewer_focus must not use absolute diagnostic claims`,
      );
    }
  });
});

describe('VA_DEFAULT_PRESET_ID', () => {
  it('is a string matching an existing preset', () => {
    assert.ok(typeof VA_DEFAULT_PRESET_ID === 'string' && VA_DEFAULT_PRESET_ID.length > 0);
    assert.ok(
      VA_CONDITION_PRESETS.some((p) => p.id === VA_DEFAULT_PRESET_ID),
      `VA_DEFAULT_PRESET_ID "${VA_DEFAULT_PRESET_ID}" must refer to a real preset`,
    );
  });
});

describe('getVaPreset', () => {
  it('returns the correct preset for a known id', () => {
    const preset = getVaPreset('parkinsonism_followup');
    assert.ok(preset, 'parkinsonism_followup must be found');
    assert.strictEqual(preset.id, 'parkinsonism_followup');
  });

  it('returns undefined for an unknown id', () => {
    const result = getVaPreset('nonexistent_preset');
    assert.strictEqual(result, undefined);
  });

  it('returns undefined for null/undefined input', () => {
    assert.strictEqual(getVaPreset(null), undefined);
    assert.strictEqual(getVaPreset(undefined), undefined);
  });

  it('returns essential_tremor preset with correct evidence_diagnosis', () => {
    const preset = getVaPreset('essential_tremor');
    assert.ok(preset);
    assert.strictEqual(preset.evidence_diagnosis, 'essential tremor');
  });
});

describe('normalizeClinicalContext', () => {
  it('uses the given preset_id when valid', () => {
    const result = normalizeClinicalContext({ preset_id: 'ataxia_balance' });
    assert.strictEqual(result.preset_id, 'ataxia_balance');
  });

  it('falls back to VA_DEFAULT_PRESET_ID when preset_id is missing', () => {
    const result = normalizeClinicalContext({});
    assert.strictEqual(result.preset_id, VA_DEFAULT_PRESET_ID);
  });

  it('falls back to VA_DEFAULT_PRESET_ID for an unknown preset_id', () => {
    const result = normalizeClinicalContext({ preset_id: 'totally_unknown' });
    assert.strictEqual(result.preset_id, VA_DEFAULT_PRESET_ID);
  });

  it('truncates custom_indication to 240 characters', () => {
    const long = 'x'.repeat(300);
    const result = normalizeClinicalContext({ preset_id: 'dystonia', custom_indication: long });
    assert.strictEqual(result.custom_indication.length, 240);
  });

  it('includes condition_label from preset when not overridden', () => {
    const result = normalizeClinicalContext({ preset_id: 'dystonia' });
    const preset = getVaPreset('dystonia');
    assert.strictEqual(result.condition_label, preset.label);
  });

  it('returns a set_at ISO timestamp string', () => {
    const result = normalizeClinicalContext({ preset_id: 'essential_tremor' });
    assert.ok(typeof result.set_at === 'string');
    assert.ok(!isNaN(Date.parse(result.set_at)), 'set_at must be parseable as a date');
  });

  // ── Branch-coverage additions: explicit input fields ────────────────────

  it('keeps caller-supplied condition_label when it is a string', () => {
    // Hits the typeof condition_label === 'string' true branch on line 102.
    const result = normalizeClinicalContext({
      preset_id: 'dystonia',
      condition_label: 'Cervical dystonia (workup)',
    });
    assert.strictEqual(result.condition_label, 'Cervical dystonia (workup)');
  });

  it('keeps caller-supplied set_at when it is a string', () => {
    // Hits the typeof set_at === 'string' true branch on line 107.
    const ts = '2026-04-01T12:00:00Z';
    const result = normalizeClinicalContext({ preset_id: 'essential_tremor', set_at: ts });
    assert.strictEqual(result.set_at, ts);
  });

  it('ignores non-string custom_indication and yields empty string', () => {
    // Hits the typeof custom_indication === 'string' false branch on line 104.
    const result = normalizeClinicalContext({
      preset_id: 'essential_tremor',
      custom_indication: 42,
    });
    assert.strictEqual(result.custom_indication, '');
  });

  it('ignores non-string condition_label and falls back to preset label', () => {
    // Hits the typeof condition_label === 'string' false branch on line 102.
    const result = normalizeClinicalContext({
      preset_id: 'dystonia',
      condition_label: 99,
    });
    const preset = getVaPreset('dystonia');
    assert.strictEqual(result.condition_label, preset.label);
  });
});
