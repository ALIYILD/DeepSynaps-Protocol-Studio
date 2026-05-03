/**
 * Medication Analyzer — safety copy and contract smoke tests.
 * Run: node --test src/pages-medication-analyzer.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { ANALYZER_DEMO_FIXTURES } from './demo-fixtures-analyzers.js';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pagePath = path.join(__dirname, 'pages-medication-analyzer.js');
const pageSrc = fs.readFileSync(pagePath, 'utf8');

test('medication analyzer page: banned autonomous-prescribing phrasing not in UI source', () => {
  const banned = [
    'No interactions detected',
    'autonomous prescribing',
    'Stop ibuprofen',
  ];
  for (const b of banned) {
    assert.equal(pageSrc.includes(b), false, `unexpected substring: ${b}`);
  }
});

test('medication analyzer page: requires review and honest empty-state language', () => {
  assert.ok(pageSrc.includes('clinician/pharmacist review') || pageSrc.includes('clinician/pharmacist'), 'review gate copy');
  assert.ok(pageSrc.includes('does not') && pageSrc.includes('empty list'), 'empty list does not prove no medications');
  assert.ok(pageSrc.includes('Demo persona') || pageSrc.includes('sample vignette'), 'demo relabelling');
});

test('medication analyzer page: persists review workflow affordances', () => {
  const required = [
    'data-testid="medication-analyzer-page"',
    'Clinical decision-support.',
    'Does not prescribe',
    'Save note',
    'Add timeline annotation',
    'Export IRB JSON',
    'Patient profile',
    'Research / algorithm disclosure',
  ];
  for (const text of required) {
    assert.ok(pageSrc.includes(text), `missing UI affordance: ${text}`);
  }
});

test('demo interaction fixture: labels sample and omits prescriptive med orders', () => {
  const r = ANALYZER_DEMO_FIXTURES.medication.check_interactions('demo-pt-elena-vasquez', [
    'Warfarin', 'Ibuprofen', 'Amitriptyline', 'Pregabalin',
  ]);
  assert.equal(r.engine_id, 'demo_fixture_rules_v1');
  const json = JSON.stringify(r);
  assert.equal(json.toLowerCase().includes('stop ibuprofen'), false);
  for (const it of r.interactions || []) {
    const rec = String(it.recommendation || '');
    assert.ok(
      /review|clinician|pharmacist|protocol/i.test(rec),
      `recommendation should be review-gated, got: ${rec.slice(0, 80)}`,
    );
  }
  assert.ok(
    /demo|sample/i.test(r.engine_detail || '') && /review|clinician/i.test(r.engine_detail || ''),
    'engine_detail should label demo and review',
  );
});
