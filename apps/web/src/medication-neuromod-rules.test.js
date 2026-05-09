// Tests for medication-neuromod-rules.js
// Pins: MED_NEUROMOD_RULES integrity, crossCheckMedNeuromod matching, severity levels,
//       modality filtering, and citation/recommendation presence.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MED_NEUROMOD_RULES, crossCheckMedNeuromod } from './medication-neuromod-rules.js';

describe('MED_NEUROMOD_RULES data integrity', () => {
  it('exports a non-empty array', () => {
    assert.ok(Array.isArray(MED_NEUROMOD_RULES) && MED_NEUROMOD_RULES.length > 0);
  });

  it('every rule has id, drug_label, meds, modalities, severity, mechanism, recommendation, references', () => {
    const REQUIRED = ['id', 'drug_label', 'meds', 'modalities', 'severity', 'mechanism', 'recommendation', 'references'];
    for (const rule of MED_NEUROMOD_RULES) {
      for (const field of REQUIRED) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(rule, field),
          `rule ${rule.id} missing field: ${field}`,
        );
      }
    }
  });

  it('severity values are restricted to the clinical set', () => {
    const VALID = new Set(['monitor', 'moderate', 'major', 'critical']);
    for (const rule of MED_NEUROMOD_RULES) {
      assert.ok(VALID.has(rule.severity), `rule ${rule.id} has invalid severity: ${rule.severity}`);
    }
  });

  it('every rule has at least one reference with a pmid', () => {
    for (const rule of MED_NEUROMOD_RULES) {
      assert.ok(Array.isArray(rule.references) && rule.references.length > 0, `rule ${rule.id} has no references`);
      for (const ref of rule.references) {
        assert.ok(typeof ref.pmid === 'string' && ref.pmid.length > 0, `rule ${rule.id} reference missing pmid`);
      }
    }
  });

  it('all rule ids are unique', () => {
    const ids = MED_NEUROMOD_RULES.map((r) => r.id);
    assert.strictEqual(new Set(ids).size, ids.length, 'all rule ids must be unique');
  });

  it('clozapine rule has critical severity', () => {
    const rule = MED_NEUROMOD_RULES.find((r) => r.id === 'clozapine-rtms-seizure');
    assert.ok(rule, 'clozapine-rtms-seizure rule must exist');
    assert.strictEqual(rule.severity, 'critical');
  });

  it('bupropion rule has major severity and covers rtms/tms', () => {
    const rule = MED_NEUROMOD_RULES.find((r) => r.id === 'bupropion-rtms-seizure');
    assert.ok(rule, 'bupropion-rtms-seizure must exist');
    assert.strictEqual(rule.severity, 'major');
    assert.ok(rule.modalities.includes('rtms'), 'bupropion rule must cover rtms');
  });
});

describe('crossCheckMedNeuromod matching', () => {
  it('returns empty array when no meds supplied', () => {
    const result = crossCheckMedNeuromod({ meds: [], modalities: ['rtms'] });
    assert.deepStrictEqual(result, []);
  });

  it('returns empty array when no modalities supplied', () => {
    const result = crossCheckMedNeuromod({ meds: ['bupropion'], modalities: [] });
    assert.deepStrictEqual(result, []);
  });

  it('returns empty array when no arguments passed', () => {
    const result = crossCheckMedNeuromod();
    assert.deepStrictEqual(result, []);
  });

  it('matches bupropion + rtms with major severity', () => {
    const results = crossCheckMedNeuromod({ meds: ['bupropion'], modalities: ['rtms'] });
    assert.ok(results.length > 0, 'bupropion+rtms must trigger a rule');
    assert.strictEqual(results[0].severity, 'major');
    assert.strictEqual(results[0].matched_med_name, 'bupropion');
  });

  it('matches clozapine + tms as critical', () => {
    const results = crossCheckMedNeuromod({ meds: ['clozapine'], modalities: ['tms'] });
    assert.ok(results.some((r) => r.severity === 'critical'), 'clozapine+tms must be critical');
  });

  it('matches benzodiazepine against tdcs modality', () => {
    const results = crossCheckMedNeuromod({ meds: ['lorazepam'], modalities: ['tdcs'] });
    assert.ok(results.length > 0, 'lorazepam+tdcs must match a rule');
    assert.strictEqual(results[0].id, 'benzodiazepine-tdcs-blunted');
  });

  it('does not match benzodiazepine against rtms modality (different rule modality set)', () => {
    const results = crossCheckMedNeuromod({ meds: ['lorazepam'], modalities: ['rtms'] });
    assert.ok(
      !results.some((r) => r.id === 'benzodiazepine-tdcs-blunted'),
      'benzodiazepine-tdcs rule must not fire for rtms',
    );
  });

  it('accepts object meds with name and generic_name fields', () => {
    const results = crossCheckMedNeuromod({
      meds: [{ name: 'Wellbutrin', generic_name: 'bupropion' }],
      modalities: ['rtms'],
    });
    assert.ok(results.length > 0, 'object-shaped med with generic_name bupropion must match');
    assert.ok(results.some((r) => r.id === 'bupropion-rtms-seizure'));
  });

  it('matches lithium for both rtms and ect rules', () => {
    const rRtms = crossCheckMedNeuromod({ meds: ['lithium'], modalities: ['rtms'] });
    const rEct = crossCheckMedNeuromod({ meds: ['lithium'], modalities: ['ect'] });
    assert.ok(rRtms.some((r) => r.id === 'lithium-rtms-seizure'));
    assert.ok(rEct.some((r) => r.id === 'lithium-ect-cognitive'));
  });

  it('result entries include matched_med_name and matched_modality', () => {
    const results = crossCheckMedNeuromod({ meds: ['sertraline'], modalities: ['rtms'] });
    assert.ok(results.length > 0);
    for (const r of results) {
      assert.ok(typeof r.matched_med_name === 'string' && r.matched_med_name.length > 0);
      assert.ok(typeof r.matched_modality === 'string' && r.matched_modality.length > 0);
    }
  });
});
