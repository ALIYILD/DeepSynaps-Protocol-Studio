// demo-fixtures-analyzers.test.js — schema + invariant pins for demo-fixtures-analyzers.js
// Wave-6 coverage (PR 91/N)

import { describe, it, before } from 'node:test';
import assert from 'node:assert';

// ── Minimal DOM stub ──────────────────────────────────────────────────────────
// demo-fixtures-analyzers imports demo-session.js which may sniff window/document.
globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || {
  getElementById: () => null,
  querySelector: () => null,
  createElement: (tag) => ({
    tagName: tag.toUpperCase(),
    style: {},
    setAttribute: () => {},
    appendChild: () => {},
    innerHTML: '',
    classList: { add: () => {}, remove: () => {}, contains: () => false },
  }),
};

import {
  DEMO_PATIENT_PERSONAS,
  ANALYZER_DEMO_FIXTURES,
  ANALYZER_DEMO_VIEWS,
  DEMO_FIXTURE_BANNER_HTML,
  DEMO_MODE_BANNER_HTML,
  isFixtureFallbackActive,
  demoDigitalPhenotypingPayload,
} from './demo-fixtures-analyzers.js';

// ── DEMO_PATIENT_PERSONAS ─────────────────────────────────────────────────────

describe('DEMO_PATIENT_PERSONAS', () => {
  it('exports an array with exactly 5 patients', () => {
    assert.ok(Array.isArray(DEMO_PATIENT_PERSONAS));
    assert.strictEqual(DEMO_PATIENT_PERSONAS.length, 5);
  });

  it('every persona has id, name, age, sex, presenting', () => {
    for (const p of DEMO_PATIENT_PERSONAS) {
      assert.ok(p.id, `missing id`);
      assert.ok(p.name, `missing name on ${p.id}`);
      assert.ok(typeof p.age === 'number', `age not number on ${p.id}`);
      assert.ok(p.sex === 'M' || p.sex === 'F', `invalid sex on ${p.id}`);
      assert.ok(p.presenting, `missing presenting on ${p.id}`);
    }
  });

  it('all patient ids are unique', () => {
    const ids = DEMO_PATIENT_PERSONAS.map(p => p.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  it('patient names include "(synthetic)" for safety', () => {
    for (const p of DEMO_PATIENT_PERSONAS) {
      assert.ok(p.name.includes('(synthetic)'),
        `name "${p.name}" should contain "(synthetic)"`);
    }
  });

  it('ages are all positive integers between 18 and 80', () => {
    for (const p of DEMO_PATIENT_PERSONAS) {
      assert.ok(p.age >= 18 && p.age <= 80, `age ${p.age} out of range on ${p.id}`);
    }
  });
});

// ── ANALYZER_DEMO_FIXTURES ────────────────────────────────────────────────────

describe('ANALYZER_DEMO_FIXTURES', () => {
  it('is a frozen object', () => {
    assert.ok(Object.isFrozen(ANALYZER_DEMO_FIXTURES));
  });

  it('has all expected top-level keys', () => {
    const expected = [
      'patients', 'mri', 'qeeg', 'voice', 'text', 'neuro',
      'risk', 'biometrics', 'video', 'digitalPhenotyping',
      'medication', 'treatmentSessions', 'phenotype', 'movement',
      'labs', 'nutrition', 'behaviour',
    ];
    for (const k of expected) {
      assert.ok(k in ANALYZER_DEMO_FIXTURES, `missing key: ${k}`);
    }
  });

  it('patients array matches DEMO_PATIENT_PERSONAS', () => {
    assert.strictEqual(ANALYZER_DEMO_FIXTURES.patients.length, 5);
  });

  it('ANALYZER_DEMO_VIEWS is the same reference as ANALYZER_DEMO_FIXTURES', () => {
    assert.strictEqual(ANALYZER_DEMO_VIEWS, ANALYZER_DEMO_FIXTURES);
  });
});

// ── MRI fixture ───────────────────────────────────────────────────────────────

describe('ANALYZER_DEMO_FIXTURES.mri', () => {
  const mri = ANALYZER_DEMO_FIXTURES.mri;

  it('has ok=true and required fields', () => {
    assert.strictEqual(mri.ok, true);
    assert.ok(mri.analysis_id);
    assert.ok(mri.modality);
    assert.ok(mri.scanner);
  });

  it('qc object has snr_db, motion_mm, usable', () => {
    assert.ok(typeof mri.qc.snr_db === 'number');
    assert.ok(typeof mri.qc.motion_mm === 'number');
    assert.strictEqual(typeof mri.qc.usable, 'boolean');
    assert.strictEqual(mri.qc.usable, true);
  });

  it('volumetrics has total_intracranial_cm3 > 0', () => {
    assert.ok(mri.volumetrics.total_intracranial_cm3 > 0);
  });

  it('clinical_disclaimer is non-empty', () => {
    assert.ok(mri.clinical_disclaimer.length > 10);
  });

  it('targets array is non-empty and each target has id, region, modality, confidence', () => {
    assert.ok(Array.isArray(mri.targets) && mri.targets.length > 0);
    for (const t of mri.targets) {
      assert.ok(t.id);
      assert.ok(t.region);
      assert.ok(t.modality);
      assert.ok(typeof t.confidence === 'number' && t.confidence >= 0 && t.confidence <= 1);
    }
  });
});

// ── QEEG fixture ──────────────────────────────────────────────────────────────

describe('ANALYZER_DEMO_FIXTURES.qeeg', () => {
  const qeeg = ANALYZER_DEMO_FIXTURES.qeeg;

  it('has analysis_status completed', () => {
    assert.strictEqual(qeeg.analysis_status, 'completed');
  });

  it('has 19 channels', () => {
    assert.strictEqual(qeeg.channels_used, 19);
    assert.strictEqual(qeeg.channel_count, 19);
  });

  it('band_powers has derived_ratios with theta_beta_ratio', () => {
    assert.ok(typeof qeeg.band_powers.derived_ratios.theta_beta_ratio === 'number');
  });

  it('summary flags are non-empty array', () => {
    assert.ok(Array.isArray(qeeg.summary.flags) && qeeg.summary.flags.length > 0);
  });
});

// ── Risk fixture ──────────────────────────────────────────────────────────────

describe('ANALYZER_DEMO_FIXTURES.risk', () => {
  const risk = ANALYZER_DEMO_FIXTURES.risk;

  it('clinic_summary has patient_count = 3', () => {
    assert.strictEqual(risk.clinic_summary.patient_count, 3);
  });

  it('patient_profile is a function', () => {
    assert.strictEqual(typeof risk.patient_profile, 'function');
  });

  it('patient_profile returns object with categories', () => {
    const profile = risk.patient_profile('demo-pt-samantha-li');
    assert.ok(profile);
    assert.ok(Array.isArray(profile.categories) && profile.categories.length > 0);
  });

  it('patient_audit is a function', () => {
    assert.strictEqual(typeof risk.patient_audit, 'function');
  });

  it('unknown patient_profile falls back to first patient', () => {
    const profile = risk.patient_profile('nonexistent-patient');
    assert.ok(profile.patient_id);
  });
});

// ── Medication fixture ────────────────────────────────────────────────────────

describe('ANALYZER_DEMO_FIXTURES.medication', () => {
  const med = ANALYZER_DEMO_FIXTURES.medication;

  it('has patient_medications, check_interactions, interaction_log, active_protocol', () => {
    assert.strictEqual(typeof med.patient_medications, 'function');
    assert.strictEqual(typeof med.check_interactions, 'function');
    assert.ok(Array.isArray(med.interaction_log));
    assert.strictEqual(typeof med.active_protocol, 'function');
  });

  it('samantha-li has 3 medications', () => {
    const meds = med.patient_medications('demo-pt-samantha-li');
    assert.strictEqual(meds.length, 3);
  });

  it('elena-vasquez has a severe interaction', () => {
    const result = med.check_interactions('demo-pt-elena-vasquez');
    assert.strictEqual(result.severity_summary, 'severe');
    assert.ok(result.interactions.length > 0);
  });

  it('interaction_log has 3 entries', () => {
    assert.strictEqual(med.interaction_log.length, 3);
  });
});

// ── demoDigitalPhenotypingPayload ─────────────────────────────────────────────

describe('demoDigitalPhenotypingPayload', () => {
  it('is a function', () => {
    assert.strictEqual(typeof demoDigitalPhenotypingPayload, 'function');
  });

  it('returns object with schema_version and patient_id', () => {
    const payload = demoDigitalPhenotypingPayload('demo-pt-samantha-li');
    assert.ok(payload.schema_version);
    assert.strictEqual(payload.patient_id, 'demo-pt-samantha-li');
  });

  it('includes clinical_disclaimer', () => {
    const payload = demoDigitalPhenotypingPayload('demo-pt-marcus-chen');
    assert.ok(typeof payload.clinical_disclaimer === 'string' && payload.clinical_disclaimer.length > 10);
  });

  it('snapshot has expected domain keys', () => {
    const payload = demoDigitalPhenotypingPayload('demo-pt-samantha-li');
    const keys = Object.keys(payload.snapshot);
    assert.ok(keys.includes('mobility_stability'));
    assert.ok(keys.includes('sleep_timing_proxy'));
    assert.ok(keys.includes('data_completeness'));
  });

  it('domains is a non-empty array', () => {
    const payload = demoDigitalPhenotypingPayload('demo-pt-samantha-li');
    assert.ok(Array.isArray(payload.domains) && payload.domains.length > 0);
  });
});

// ── Banner HTML ───────────────────────────────────────────────────────────────

describe('DEMO_FIXTURE_BANNER_HTML / DEMO_MODE_BANNER_HTML', () => {
  it('DEMO_FIXTURE_BANNER_HTML is a non-empty string', () => {
    assert.ok(typeof DEMO_FIXTURE_BANNER_HTML === 'string' && DEMO_FIXTURE_BANNER_HTML.length > 10);
  });

  it('DEMO_MODE_BANNER_HTML equals DEMO_FIXTURE_BANNER_HTML', () => {
    assert.strictEqual(DEMO_MODE_BANNER_HTML, DEMO_FIXTURE_BANNER_HTML);
  });

  it('banner contains demo-fixture-banner attribute', () => {
    assert.ok(DEMO_FIXTURE_BANNER_HTML.includes('data-demo-fixture-banner'));
  });
});

// ── isFixtureFallbackActive ───────────────────────────────────────────────────

describe('isFixtureFallbackActive', () => {
  it('is a function that returns boolean', () => {
    assert.strictEqual(typeof isFixtureFallbackActive, 'function');
    const result = isFixtureFallbackActive();
    assert.ok(typeof result === 'boolean');
  });
});
