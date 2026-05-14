// Static contract: Intervention Analyzer route and API client hook.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const APP = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const API = readFileSync(new URL('./api.js', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('./pages-intervention-analyzer.js', import.meta.url), 'utf8');

test('app.js registers intervention-analyzer', () => {
  assert.ok(APP.includes("'intervention-analyzer'") || APP.includes("'treatment-sessions-analyzer'"), 'nav id');
  assert.ok(APP.includes('loadInterventionAnalyzer') || APP.includes('loadTreatmentSessionsAnalyzer'), 'lazy loader');
  assert.ok(APP.includes('pages-intervention-analyzer.js') || APP.includes('pages-treatment-sessions-analyzer.js'), 'module path');
  assert.ok(APP.includes("pgInterventionAnalyzer") || APP.includes("pgTreatmentSessionsAnalyzer"), 'page entry');
});

test('api.js exposes getInterventionAnalyzer or legacy getTreatmentSessionsAnalyzer', () => {
  assert.ok(API.includes('getInterventionAnalyzer') || API.includes('getTreatmentSessionsAnalyzer'), 'api method');
  assert.ok(API.includes('/intervention-analyzer') || API.includes('/treatment-sessions-analyzer'), 'path');
});

test('page exports pgInterventionAnalyzer and disclaimer copy', () => {
  assert.ok(PAGE.includes('export async function pgInterventionAnalyzer') || PAGE.includes('export async function pgTreatmentSessionsAnalyzer'), 'export');
  assert.ok(PAGE.includes('clinician-reviewed intervention decision support') || PAGE.includes('clinician-reviewed treatment-session decision support'), 'stance');
  assert.ok(PAGE.includes('Does not approve protocols, adjust dosing, or infer causality'), 'safety copy');
  assert.ok(PAGE.includes('honest gaps when APIs or records are missing'), 'honest gap copy');
  assert.ok(PAGE.includes('_parseOutcomeSummaries'), 'outcome summary parser');
  assert.ok(PAGE.includes('_hydrateCourseDetail'), 'course detail hydration');
});

test('guest role does not list Intervention Analyzer in sidebar', () => {
  const m = APP.match(/guest:\s*\[([^\]]+)\]/);
  assert.ok(m, 'ROLE_NAV_HIDE.guest array');
  assert.match(m[1], /'intervention-analyzer'|'treatment-sessions-analyzer'/, 'hide from guest nav (API is 403)');
});

// ---------------------------------------------------------------------------
// New launch-audit assertions for intervention-rename safety posture
// ---------------------------------------------------------------------------

test('page source contains no calibrated prediction model claims', () => {
  assert.ok(
    PAGE.includes('no_calibrated_model') || PAGE.includes('not a calibrated prediction model'),
    'Must disclaim absence of calibrated model'
  );
});

test('page source contains decision-support-only disclaimer', () => {
  assert.ok(PAGE.includes('decision support only') || PAGE.includes('decision-support only'));
});

test('forecast numbers are explicitly withheld in planning snapshot', () => {
  assert.ok(PAGE.includes('withheld') || PAGE.includes('not available'));
});

test('role gate function is exported for testability', () => {
  assert.ok(PAGE.includes('canUseInterventionAnalyzerWorkspace') || PAGE.includes('canUseTreatmentSessionsAnalyzerWorkspace'));
});

test('API batch sign-status endpoint is referenced (performance path)', () => {
  assert.ok(PAGE.includes('getTreatmentSessionSignStatusBatch') || PAGE.includes('sign-status/batch'));
});
