import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_CONDITIONS,
  FALLBACK_MODALITIES,
  FALLBACK_ASSESSMENT_TEMPLATES,
  COURSE_STATUS_COLORS,
  ROLE_ENTRY_PAGE,
} from './constants.js';

describe('FALLBACK_CONDITIONS', () => {
  it('is a non-empty array', () => {
    assert.ok(Array.isArray(FALLBACK_CONDITIONS));
    assert.ok(FALLBACK_CONDITIONS.length > 0);
  });

  it('contains Major Depressive Disorder as first entry', () => {
    assert.strictEqual(FALLBACK_CONDITIONS[0], 'Major Depressive Disorder');
  });

  it('contains PTSD', () => {
    assert.ok(FALLBACK_CONDITIONS.includes('PTSD'));
  });

  it('ends with Other', () => {
    assert.strictEqual(FALLBACK_CONDITIONS[FALLBACK_CONDITIONS.length - 1], 'Other');
  });

  it('contains Long COVID Neurocognitive Syndrome', () => {
    assert.ok(FALLBACK_CONDITIONS.includes('Long COVID Neurocognitive Syndrome'));
  });
});

describe('FALLBACK_MODALITIES', () => {
  it('is a non-empty array', () => {
    assert.ok(Array.isArray(FALLBACK_MODALITIES));
    assert.ok(FALLBACK_MODALITIES.length > 0);
  });

  it('starts with TMS/rTMS', () => {
    assert.strictEqual(FALLBACK_MODALITIES[0], 'TMS/rTMS');
  });

  it('contains Neurofeedback', () => {
    assert.ok(FALLBACK_MODALITIES.includes('Neurofeedback'));
  });

  it('contains tDCS and tACS', () => {
    assert.ok(FALLBACK_MODALITIES.includes('tDCS'));
    assert.ok(FALLBACK_MODALITIES.includes('tACS'));
  });

  it('ends with Multimodal', () => {
    assert.strictEqual(FALLBACK_MODALITIES[FALLBACK_MODALITIES.length - 1], 'Multimodal');
  });
});

describe('FALLBACK_ASSESSMENT_TEMPLATES', () => {
  it('is a non-empty array of objects with id and label', () => {
    assert.ok(Array.isArray(FALLBACK_ASSESSMENT_TEMPLATES));
    assert.ok(FALLBACK_ASSESSMENT_TEMPLATES.length > 0);
    for (const t of FALLBACK_ASSESSMENT_TEMPLATES) {
      assert.ok(typeof t.id === 'string' && t.id.length > 0, `id missing on ${JSON.stringify(t)}`);
      assert.ok(typeof t.label === 'string' && t.label.length > 0, `label missing on ${JSON.stringify(t)}`);
    }
  });

  it('PHQ-9 entry has expected label', () => {
    const phq = FALLBACK_ASSESSMENT_TEMPLATES.find(t => t.id === 'PHQ-9');
    assert.ok(phq, 'PHQ-9 not found');
    assert.strictEqual(phq.label, 'PHQ-9 — Patient Health Questionnaire-9');
  });

  it('GAD-7 entry exists with correct id', () => {
    const gad = FALLBACK_ASSESSMENT_TEMPLATES.find(t => t.id === 'GAD-7');
    assert.ok(gad, 'GAD-7 not found');
    assert.ok(gad.label.includes('Generalized Anxiety'));
  });

  it('UPDRS-III entry exists', () => {
    const updrs = FALLBACK_ASSESSMENT_TEMPLATES.find(t => t.id === 'UPDRS-III');
    assert.ok(updrs, 'UPDRS-III not found');
    assert.ok(updrs.label.includes("Parkinson"));
  });

  it('all ids are unique', () => {
    const ids = FALLBACK_ASSESSMENT_TEMPLATES.map(t => t.id);
    const unique = new Set(ids);
    assert.strictEqual(unique.size, ids.length);
  });
});

describe('COURSE_STATUS_COLORS', () => {
  it('active maps to --teal CSS var', () => {
    assert.strictEqual(COURSE_STATUS_COLORS.active, 'var(--teal)');
  });

  it('completed maps to --green CSS var', () => {
    assert.strictEqual(COURSE_STATUS_COLORS.completed, 'var(--green)');
  });

  it('discontinued maps to --red CSS var', () => {
    assert.strictEqual(COURSE_STATUS_COLORS.discontinued, 'var(--red)');
  });

  it('has all 6 status keys', () => {
    const keys = ['pending_approval', 'approved', 'active', 'paused', 'completed', 'discontinued'];
    for (const k of keys) {
      assert.ok(k in COURSE_STATUS_COLORS, `Missing key: ${k}`);
    }
  });
});

describe('ROLE_ENTRY_PAGE', () => {
  it('clinician lands on home', () => {
    assert.strictEqual(ROLE_ENTRY_PAGE.clinician, 'home');
  });

  it('technician lands on session-execution', () => {
    assert.strictEqual(ROLE_ENTRY_PAGE.technician, 'session-execution');
  });

  it('guest lands on evidence', () => {
    assert.strictEqual(ROLE_ENTRY_PAGE.guest, 'evidence');
  });

  it('patient lands on patient-portal', () => {
    assert.strictEqual(ROLE_ENTRY_PAGE.patient, 'patient-portal');
  });

  it('reviewer and supervisor both land on review-queue', () => {
    assert.strictEqual(ROLE_ENTRY_PAGE.reviewer, 'review-queue');
    assert.strictEqual(ROLE_ENTRY_PAGE.supervisor, 'review-queue');
  });
});
