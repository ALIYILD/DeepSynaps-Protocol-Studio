// Tests for documents-templates.js
// Pins public exports: DOCUMENT_TEMPLATES array shape, getTemplate(), renderTemplate().
// DOM-heavy rendering is skipped — the module has no DOM code.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  DOCUMENT_TEMPLATES,
  getTemplate,
  renderTemplate,
} from './documents-templates.js';

// ── DOCUMENT_TEMPLATES array ─────────────────────────────────────────────────

describe('DOCUMENT_TEMPLATES', () => {
  it('is a non-empty array', () => {
    assert.ok(Array.isArray(DOCUMENT_TEMPLATES));
    assert.ok(DOCUMENT_TEMPLATES.length > 0);
  });

  it('every template has required string fields: id, name, cat, body', () => {
    for (const t of DOCUMENT_TEMPLATES) {
      assert.strictEqual(typeof t.id, 'string', `${t.id} — id must be string`);
      assert.ok(t.id.length > 0, `template missing id`);
      assert.strictEqual(typeof t.name, 'string', `${t.id} — name must be string`);
      assert.strictEqual(typeof t.cat, 'string', `${t.id} — cat must be string`);
      assert.strictEqual(typeof t.body, 'string', `${t.id} — body must be string`);
      assert.ok(t.body.length > 0, `${t.id} — body must not be empty`);
    }
  });

  it('every template has a pages number >= 1', () => {
    for (const t of DOCUMENT_TEMPLATES) {
      assert.ok(typeof t.pages === 'number' && t.pages >= 1, `${t.id} — pages invalid`);
    }
  });

  it('every template has a non-empty langs array of strings', () => {
    for (const t of DOCUMENT_TEMPLATES) {
      assert.ok(Array.isArray(t.langs) && t.langs.length > 0, `${t.id} — langs invalid`);
      for (const l of t.langs) assert.strictEqual(typeof l, 'string', `${t.id} — lang must be string`);
    }
  });

  it('every template has an auto boolean', () => {
    for (const t of DOCUMENT_TEMPLATES) {
      assert.strictEqual(typeof t.auto, 'boolean', `${t.id} — auto must be boolean`);
    }
  });

  it('every template has a variables array of strings', () => {
    for (const t of DOCUMENT_TEMPLATES) {
      assert.ok(Array.isArray(t.variables), `${t.id} — variables must be array`);
      for (const v of t.variables) assert.strictEqual(typeof v, 'string', `${t.id} — variable must be string`);
    }
  });

  it('T01 is TMS Informed Consent Form in Consent category', () => {
    const t = DOCUMENT_TEMPLATES.find(x => x.id === 'T01');
    assert.ok(t, 'T01 must exist');
    assert.strictEqual(t.name, 'TMS Informed Consent Form');
    assert.strictEqual(t.cat, 'Consent');
  });

  it('T01 body contains clinical-safety disclaimer strings', () => {
    const t = DOCUMENT_TEMPLATES.find(x => x.id === 'T01');
    assert.ok(t.body.includes('seizure'), 'T01 body must mention seizure risk');
    assert.ok(t.body.includes('Voluntariness'), 'T01 body must mention voluntariness');
  });

  it('T07 (AI Consent) body contains decision-support language', () => {
    const t = DOCUMENT_TEMPLATES.find(x => x.id === 'T07');
    assert.ok(t, 'T07 must exist');
    assert.ok(t.body.includes('decision-support'), 'T07 body must contain "decision-support"');
    assert.ok(t.body.includes('does not diagnose'), 'T07 body must state AI does not diagnose');
  });

  it('template IDs are unique', () => {
    const ids = DOCUMENT_TEMPLATES.map(t => t.id);
    const unique = new Set(ids);
    assert.strictEqual(unique.size, ids.length, 'template IDs must be unique');
  });

  it('has at least one auto=true template', () => {
    const autoTemplates = DOCUMENT_TEMPLATES.filter(t => t.auto);
    assert.ok(autoTemplates.length > 0, 'at least one template must have auto=true');
  });

  it('has at least one template in each expected category', () => {
    const cats = new Set(DOCUMENT_TEMPLATES.map(t => t.cat));
    assert.ok(cats.has('Consent'), 'must have Consent category');
    assert.ok(cats.has('Report'), 'must have Report category');
  });
});

// ── getTemplate() ────────────────────────────────────────────────────────────

describe('getTemplate', () => {
  it('returns the correct template for a valid id', () => {
    const t = getTemplate('T01');
    assert.ok(t, 'T01 must be found');
    assert.strictEqual(t.id, 'T01');
    assert.strictEqual(t.name, 'TMS Informed Consent Form');
  });

  it('returns null for unknown id', () => {
    assert.strictEqual(getTemplate('ZZZZ'), null);
  });

  it('returns null for empty string id', () => {
    assert.strictEqual(getTemplate(''), null);
  });

  it('returns null for undefined id', () => {
    assert.strictEqual(getTemplate(undefined), null);
  });

  it('returns the same object found in DOCUMENT_TEMPLATES', () => {
    const t = getTemplate('T01');
    const expected = DOCUMENT_TEMPLATES.find(x => x.id === 'T01');
    assert.strictEqual(t, expected);
  });
});

// ── renderTemplate() ─────────────────────────────────────────────────────────

describe('renderTemplate', () => {
  it('substitutes provided values into {{placeholders}}', () => {
    const out = renderTemplate('T01', {
      clinic_name: 'Test Clinic',
      clinician_name: 'Dr. Smith',
      patient_name: 'Jane Doe',
    });
    assert.ok(out.includes('Test Clinic'), 'clinic_name substituted');
    assert.ok(out.includes('Dr. Smith'), 'clinician_name substituted');
    assert.ok(out.includes('Jane Doe'), 'patient_name substituted');
  });

  it('leaves unreplaced placeholders in {{key}} form when no value given', () => {
    const out = renderTemplate('T01', {});
    assert.ok(out.includes('{{clinic_name}}'), 'unreplaced placeholder retained');
  });

  it('returns empty string for unknown template id', () => {
    const out = renderTemplate('ZZZZ', { foo: 'bar' });
    assert.strictEqual(out, '');
  });

  it('returns empty string when id is undefined', () => {
    const out = renderTemplate(undefined, {});
    assert.strictEqual(out, '');
  });

  it('works with empty values object', () => {
    const out = renderTemplate('T01', {});
    assert.ok(typeof out === 'string' && out.length > 0);
  });

  it('substitutes num_sessions in T01 body', () => {
    const out = renderTemplate('T01', { num_sessions: '20' });
    assert.ok(out.includes('20'), 'num_sessions value appears in output');
    // The raw placeholder must not remain
    assert.ok(!out.includes('{{num_sessions}}'), '{{num_sessions}} must be replaced');
  });

  it('T15 rendered body contains device_name and programme_name substitutions', () => {
    const out = renderTemplate('T15', { device_name: 'BrainsWay H7', programme_name: 'Delta-3' });
    assert.ok(out.includes('BrainsWay H7'));
    assert.ok(out.includes('Delta-3'));
  });
});
