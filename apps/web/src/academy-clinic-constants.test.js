import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACADEMY_GOVERNANCE_DISCLAIMER,
  ACADEMY_PATIENT_LOCAL_PROGRESS_NOTE,
  ACADEMY_CLINIC_LINKED_MODULES,
  academySectionCardMeta,
} from './academy-clinic-constants.js';

describe('ACADEMY_GOVERNANCE_DISCLAIMER', () => {
  it('is a non-empty string', () => {
    assert.ok(typeof ACADEMY_GOVERNANCE_DISCLAIMER === 'string');
    assert.ok(ACADEMY_GOVERNANCE_DISCLAIMER.length > 0);
  });

  it('contains training and reference material language', () => {
    assert.ok(ACADEMY_GOVERNANCE_DISCLAIMER.includes('training and reference material'));
  });

  it('contains does not diagnose language', () => {
    assert.ok(ACADEMY_GOVERNANCE_DISCLAIMER.includes('does not diagnose'));
  });
});

describe('ACADEMY_PATIENT_LOCAL_PROGRESS_NOTE', () => {
  it('is a non-empty string', () => {
    assert.ok(typeof ACADEMY_PATIENT_LOCAL_PROGRESS_NOTE === 'string');
    assert.ok(ACADEMY_PATIENT_LOCAL_PROGRESS_NOTE.length > 0);
  });

  it('mentions local storage', () => {
    assert.ok(ACADEMY_PATIENT_LOCAL_PROGRESS_NOTE.toLowerCase().includes('local storage'));
  });

  it('clarifies it is not sent to clinic', () => {
    assert.ok(ACADEMY_PATIENT_LOCAL_PROGRESS_NOTE.includes('not sent to your clinic'));
  });
});

describe('ACADEMY_CLINIC_LINKED_MODULES', () => {
  it('is a non-empty array', () => {
    assert.ok(Array.isArray(ACADEMY_CLINIC_LINKED_MODULES));
    assert.ok(ACADEMY_CLINIC_LINKED_MODULES.length > 0);
  });

  it('every entry has page and label strings', () => {
    for (const m of ACADEMY_CLINIC_LINKED_MODULES) {
      assert.ok(typeof m.page === 'string' && m.page.length > 0, `page missing: ${JSON.stringify(m)}`);
      assert.ok(typeof m.label === 'string' && m.label.length > 0, `label missing: ${JSON.stringify(m)}`);
    }
  });

  it('includes dashboard module', () => {
    const found = ACADEMY_CLINIC_LINKED_MODULES.find(m => m.page === 'dashboard');
    assert.ok(found, 'dashboard module not found');
    assert.strictEqual(found.label, 'Dashboard');
  });

  it('includes documents-v2 module', () => {
    const found = ACADEMY_CLINIC_LINKED_MODULES.find(m => m.page === 'documents-v2');
    assert.ok(found, 'documents-v2 module not found');
    assert.strictEqual(found.label, 'Documents');
  });

  it('includes ai-agent-v2 module labeled AI Agents', () => {
    const found = ACADEMY_CLINIC_LINKED_MODULES.find(m => m.page === 'ai-agent-v2');
    assert.ok(found, 'ai-agent-v2 not found');
    assert.strictEqual(found.label, 'AI Agents');
  });

  it('all page values are unique', () => {
    const pages = ACADEMY_CLINIC_LINKED_MODULES.map(m => m.page);
    const unique = new Set(pages);
    assert.strictEqual(unique.size, pages.length);
  });
});

describe('academySectionCardMeta', () => {
  it('returns correct meta for research section', () => {
    const meta = academySectionCardMeta('research');
    assert.strictEqual(meta.ctype, 'Reference');
    assert.ok(meta.audience.includes('Clinician'));
    assert.strictEqual(meta.src, 'Curated link (bundled)');
  });

  it('returns training type for seminars section', () => {
    const meta = academySectionCardMeta('seminars');
    assert.strictEqual(meta.ctype, 'Training / events');
  });

  it('returns external credential path for certifications', () => {
    const meta = academySectionCardMeta('certifications');
    assert.strictEqual(meta.ctype, 'External credential path');
  });

  it('returns self-paced type for courses', () => {
    const meta = academySectionCardMeta('courses');
    assert.strictEqual(meta.ctype, 'Self-paced (external site)');
  });

  it('returns fallback for unknown sectionId', () => {
    const meta = academySectionCardMeta('unknown-section');
    assert.strictEqual(meta.ctype, 'Reference');
    assert.strictEqual(meta.src, 'Curated link (bundled)');
  });

  it('returns fallback for undefined input', () => {
    const meta = academySectionCardMeta(undefined);
    assert.strictEqual(meta.src, 'Curated link (bundled)');
  });
});
