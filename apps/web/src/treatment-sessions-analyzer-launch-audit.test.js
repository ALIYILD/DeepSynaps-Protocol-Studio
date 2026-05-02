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
  assert.ok(PAGE.includes('decision-support'), 'stance');
});
