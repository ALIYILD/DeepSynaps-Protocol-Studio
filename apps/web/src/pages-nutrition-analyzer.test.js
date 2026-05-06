/**
 * Nutrition Analyzer — role gate and safety-copy tests.
 * Run: node --test src/pages-nutrition-analyzer.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import { nutritionAnalyzerAllowsRole } from './pages-nutrition-analyzer.js';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pagePath = path.join(__dirname, 'pages-nutrition-analyzer.js');
const pageSrc = fs.readFileSync(pagePath, 'utf8');

test('nutrition analyzer role gate allows clinician roles and rejects patient role', () => {
  assert.equal(nutritionAnalyzerAllowsRole('clinician'), true);
  assert.equal(nutritionAnalyzerAllowsRole('admin'), true);
  assert.equal(nutritionAnalyzerAllowsRole('patient'), false);
  assert.equal(nutritionAnalyzerAllowsRole('receptionist'), false);
});

test('nutrition analyzer page keeps clinician-review framing', () => {
  assert.ok(pageSrc.includes('Clinician-reviewed nutrition decision-support.'));
  assert.ok(pageSrc.includes('does not diagnose'));
  assert.ok(pageSrc.includes('requires authenticated clinician API access'));
});

test('nutrition analyzer page persists patient handoff context to linked pages', () => {
  assert.ok(pageSrc.includes('window._selectedPatientId = pid'));
  assert.ok(pageSrc.includes('window._profilePatientId = pid'));
});
