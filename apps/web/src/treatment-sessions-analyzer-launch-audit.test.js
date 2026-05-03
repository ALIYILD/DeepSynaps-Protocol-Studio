// Static contract: Treatment Sessions Analyzer route and API client hook.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const APP = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const API = readFileSync(new URL('./api.js', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('./pages-treatment-sessions-analyzer.js', import.meta.url), 'utf8');

test('app.js registers treatment-sessions-analyzer', () => {
  assert.ok(APP.includes("'treatment-sessions-analyzer'"), 'nav id');
  assert.ok(APP.includes('loadTreatmentSessionsAnalyzer'), 'lazy loader');
  assert.ok(APP.includes('pages-treatment-sessions-analyzer.js'), 'module path');
  assert.ok(APP.includes("pgTreatmentSessionsAnalyzer"), 'page entry');
});

test('api.js exposes getTreatmentSessionsAnalyzer', () => {
  assert.ok(API.includes('getTreatmentSessionsAnalyzer'), 'api method');
  assert.ok(API.includes('/treatment-sessions-analyzer'), 'path');
});

test('page exports pgTreatmentSessionsAnalyzer and disclaimer copy', () => {
  assert.ok(PAGE.includes('export async function pgTreatmentSessionsAnalyzer'), 'export');
  assert.ok(PAGE.includes('clinician-reviewed treatment-session decision support'), 'stance');
  assert.ok(PAGE.includes('Does not approve protocols, adjust dosing, or infer causality'), 'safety copy');
  assert.ok(PAGE.includes('honest gaps when APIs or records are missing'), 'honest gap copy');
  assert.ok(PAGE.includes('_parseOutcomeSummaries'), 'outcome summary parser');
  assert.ok(PAGE.includes('_hydrateCourseDetail'), 'course detail hydration');
});

test('guest role does not list Treatment Sessions Analyzer in sidebar', () => {
  const m = APP.match(/guest:\s*\[([^\]]+)\]/);
  assert.ok(m, 'ROLE_NAV_HIDE.guest array');
  assert.match(m[1], /'treatment-sessions-analyzer'/, 'hide from guest nav (API is 403)');
});
